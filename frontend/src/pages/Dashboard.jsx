import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTheme } from '../features/theme/useTheme.js'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../features/auth/context'
import {
  activityTimelineSortKeyMs,
  formatTransactionAmount,
  formatTransactionCategory,
  formatTransactionDate,
  normalizeTransactionsResponse,
  sortTransactionsByActivityDate,
} from '../features/transactions/formatters'
import { apiRequest } from '../lib/api'
import { dispatchTransactionsUpdated } from '../lib/transactionsEvents'
import PlaidConnectButton from '../features/plaid/PlaidConnectButton'
import { getPlaidItems, syncPlaidItem } from '../features/plaid/api'
import { filterTransactionsForDisciplineWindow } from '../features/pacts/disciplineState'
import { computePactSavings } from '../features/pacts/savings'
import DashboardTopbar from '../components/DashboardTopbar'
import '../dashboard.css'

function formatCurrency(value) {
  return `$${Number(value || 0).toFixed(2)}`
}

function normalizeCategory(category) {
  if (!category) return 'Other'
  return String(category)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

/** Browser local calendar month; activity date prefers bank `date`, then `created_at`. Purchases = positive amount. */
function filterPurchasesInCurrentMonth(transactions) {
  if (!Array.isArray(transactions) || transactions.length === 0) return []
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()
  const startMs = new Date(y, m, 1, 0, 0, 0, 0).getTime()
  const endMs = new Date(y, m + 1, 0, 23, 59, 59, 999).getTime()
  return transactions.filter((tx) => {
    const amt = Number(tx.amount || 0)
    if (!Number.isFinite(amt) || amt <= 0) return false
    const t = activityTimelineSortKeyMs(tx)
    if (t === Number.NEGATIVE_INFINITY) return false
    return t >= startMs && t <= endMs
  })
}

const CATEGORY_COLOR_FALLBACKS = ['#d7aa59', '#5a8ec8', '#8aaa28', '#b07d5a', '#9b7ebd', '#3d9a8e']

function categoryColorForLabel(categoryLabel, index) {
  const s = String(categoryLabel || '').toLowerCase()
  if (s === 'other') return '#a89f96'
  if (/(food|dining|grocery|restaurant|coffee|drink|eat)/.test(s)) return '#d7aa59'
  if (/(shop|retail|merchand|amazon|store|goods|general)/.test(s)) return '#c9a227'
  if (/(subscri|entertain|stream|media|game|netflix|spotify)/.test(s)) return '#9b8cb8'
  if (/(transport|gas|travel|uber|lyft|parking|taxi|auto)/.test(s)) return '#3d9a8e'
  if (/(health|medical|pharmacy|fitness|gym)/.test(s)) return '#5a8ec8'
  if (/(bill|rent|util|insurance|loan|fee|mortgage)/.test(s)) return '#8a7a68'
  if (/(income|transfer|deposit|payment)/.test(s)) return '#6a9a4a'
  return CATEGORY_COLOR_FALLBACKS[index % CATEGORY_COLOR_FALLBACKS.length]
}

/** Groups purchases by calendar month for the last N months. */
function buildMonthlySpendingData(transactions, numMonths = 6) {
  const now = new Date()
  const months = []
  for (let i = numMonths - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push({
      year: d.getFullYear(),
      month: d.getMonth(),
      label: d.toLocaleString('default', { month: 'short' }),
      total: 0,
    })
  }
  for (const tx of transactions) {
    const amt = Number(tx.amount || 0)
    if (!Number.isFinite(amt) || amt <= 0) continue
    const dateStr = tx.date || tx.created_at
    if (!dateStr) continue
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) continue
    const bucket = months.find((b) => b.year === d.getFullYear() && b.month === d.getMonth())
    if (bucket) bucket.total += amt
  }
  return months
}

/** Top categories + optional "Other"; percents sum to 100 for display. */
function buildDisciplineSpendingBreakdown(transactions, normalizeCategoryFn) {
  const total = transactions.reduce((sum, tx) => sum + Number(tx.amount || 0), 0)

  if (!transactions.length || total <= 0) {
    return { items: [], total: 0 }
  }

  const totals = {}
  for (const tx of transactions) {
    const cat = normalizeCategoryFn(tx.category)
    totals[cat] = (totals[cat] || 0) + Number(tx.amount || 0)
  }

  const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1])
  const top4 = sorted.slice(0, 4)
  const top4Sum = top4.reduce((s, [, amt]) => s + amt, 0)
  const remainder = total - top4Sum

  const rawItems = top4.map(([cat, amt], i) => ({
    category: cat,
    amount: amt,
    color: categoryColorForLabel(cat, i),
  }))

  if (remainder > 0.005) {
    rawItems.push({
      category: 'Other',
      amount: remainder,
      color: categoryColorForLabel('Other', rawItems.length),
    })
  }

  const shares = rawItems.map((it) => (it.amount / total) * 100)
  const rounded = shares.map((sh) => Math.max(0, Math.round(sh)))
  let drift = 100 - rounded.reduce((a, b) => a + b, 0)
  if (rounded.length > 0) {
    const maxI = rounded.indexOf(Math.max(...rounded))
    rounded[maxI] += drift
  }

  const items = rawItems.map((it, i) => ({
    ...it,
    percent: rounded[i],
  }))

  return { items, total }
}

function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
}

function accountabilityLabel(type, percent) {
  const p = Number(percent || 0)
  const savingsBit = p > 0 ? ` · ${p}% savings (simulated)` : ''
  if (type === 'email') return `Alerts: email yourself${savingsBit}`
  if (type === 'friend') return `Alerts: accountability partner${savingsBit}`
  if (type === 'none') return `No alerts${savingsBit}`
  if (type === 'savings_percentage') return `Legacy: savings-only${savingsBit}`
  if (type === 'both') return `Legacy: email + savings${savingsBit}`
  return `Alerts${savingsBit}`
}

function transactionMatchesPact(tx, pact) {
  const txCategory = normalizeText(tx.category)
  const txMerchant = normalizeText(tx.merchant)
  const txDescription = normalizeText(tx.description)

  const pactCategory = normalizeText(
    pact.custom_category || pact.category || pact.preset_category
  )

  if (!pactCategory) return false

  return (
    txCategory.includes(pactCategory) ||
    pactCategory.includes(txCategory) ||
    txMerchant.includes(pactCategory) ||
    txDescription.includes(pactCategory)
  )
}

export default function Dashboard() {
  const { user, token, refreshUser } = useAuth()
  const location = useLocation()
  const { bg } = useTheme()
  const firstName = user?.name?.split(' ')[0] || 'there'

  const [transactions, setTransactions] = useState([])
  const [pacts, setPacts] = useState([])
  const [plaidItems, setPlaidItems] = useState([])
  const [accountabilityByPact, setAccountabilityByPact] = useState({})
  const [simulatedSavings, setSimulatedSavings] = useState({
    enabled: false,
    totalRecorded: 0,
    transfers: [],
  })
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState(null)

  const userIdRef = useRef(user?.id)
  useEffect(() => {
    userIdRef.current = user?.id
  }, [user?.id])

  const loadDashboardData = useCallback(async (opts = {}) => {
    const silent = opts.silent === true
    const uid = userIdRef.current
    if (!token || !uid) {
      setLoading(false)
      return
    }

    try {
      if (!silent) {
        setLoading(true)
      }
      setError(null)

      const [transactionsData, pactsData, plaidItemsData, savingsPayload] = await Promise.all([
        apiRequest('/api/transactions/', { token }),
        apiRequest(`/api/pacts/user/${uid}`, { token }),
        getPlaidItems(token),
        apiRequest('/api/simulated-savings-transfers/', { token }).catch(() => null),
      ])

      const rawTransactions = normalizeTransactionsResponse(transactionsData)

      const normalizedTransactions = rawTransactions.map((tx) => ({
        id: tx.id,
        user_id: tx.user_id,
        merchant: tx.merchant || tx.description || 'Unknown merchant',
        category: tx.category || 'Other',
        amount: Number(tx.amount || 0),
        flagged: Boolean(tx.flagged),
        flag_reason: tx.flag_reason || '',
        created_at: tx.created_at,
        date: tx.date || null,
        pending: Boolean(tx.pending),
        description: tx.description || '',
        subtotal: tx.subtotal ?? null,
        tax_amount: tx.tax_amount ?? null,
        tax_percent: tx.tax_percent ?? null,
        total_amount: tx.total_amount ?? null,
      }))

      const rawPacts = Array.isArray(pactsData)
        ? pactsData
        : Array.isArray(pactsData?.results)
          ? pactsData.results
          : Array.isArray(pactsData?.pacts)
            ? pactsData.pacts
            : []

      const normalizedPacts = rawPacts
        .map((pact) => ({
          id: pact.id,
          user_id: pact.user_id,
          preset_category: pact.preset_category || null,
          custom_category: pact.custom_category || null,
          category:
            pact.category ||
            pact.custom_category ||
            pact.preset_category ||
            'Uncategorized',
          status: pact.status || 'active',
        }))
        .sort((a, b) => String(a.category).localeCompare(String(b.category)))

      const accountabilityPairs = await Promise.all(
        normalizedPacts.map(async (pact) => {
          try {
            const settings = await apiRequest(
              `/api/accountability-settings/${pact.id}`,
              { token }
            )
            return [pact.id, settings]
          } catch {
            return [pact.id, null]
          }
        })
      )

      const accountabilityMap = Object.fromEntries(accountabilityPairs)

      setSimulatedSavings({
        enabled: Boolean(savingsPayload?.simulated_transfers_enabled),
        totalRecorded: Number(savingsPayload?.total_recorded || 0),
        transfers: Array.isArray(savingsPayload?.transfers) ? savingsPayload.transfers : [],
      })

      setTransactions(sortTransactionsByActivityDate(normalizedTransactions))
      setPacts(normalizedPacts)
      setPlaidItems(Array.isArray(plaidItemsData) ? plaidItemsData : [])
      setAccountabilityByPact(accountabilityMap)
    } catch (err) {
      setError(err.message || 'Something went wrong.')
    } finally {
      if (!silent) {
        setLoading(false)
      }
    }
  }, [token])

  useEffect(() => {
    if (location.pathname !== '/dashboard') {
      return
    }
    if (!token || !user?.id) {
      return
    }
    loadDashboardData()
  }, [location.pathname, location.key, token, user?.id, loadDashboardData])

  useEffect(() => {
    if (location.pathname !== '/dashboard') {
      return undefined
    }
    function refetchWhenVisible() {
      if (document.visibilityState !== 'visible') {
        return
      }
      void loadDashboardData({ silent: true })
      void refreshUser(token).catch(() => {})
    }
    document.addEventListener('visibilitychange', refetchWhenVisible)
    return () => document.removeEventListener('visibilitychange', refetchWhenVisible)
  }, [location.pathname, loadDashboardData, refreshUser, token])

  const handlePlaidConnected = useCallback(async () => {
    await loadDashboardData()
    try {
      await refreshUser(token)
    } catch {
      /* ignore */
    }
    dispatchTransactionsUpdated()
  }, [loadDashboardData, refreshUser, token])

  const handleSyncAll = useCallback(async () => {
    if (!token || plaidItems.length === 0) return

    try {
      setSyncing(true)
      setError(null)

      await Promise.all(
        plaidItems.map((item) => syncPlaidItem({ itemId: item.id, token }))
      )

      await loadDashboardData()
      try {
        await refreshUser(token)
      } catch {
        /* ignore */
      }
      dispatchTransactionsUpdated()
    } catch (err) {
      setError(err.message || 'Failed to sync Plaid transactions.')
    } finally {
      setSyncing(false)
    }
  }, [plaidItems, token, loadDashboardData, refreshUser])

  const activePacts = useMemo(
    () => pacts.filter((pact) => String(pact.status).toLowerCase() === 'active'),
    [pacts]
  )

  const disciplineWindowTransactions = useMemo(
    () => filterTransactionsForDisciplineWindow(transactions, user?.discipline_score_started_at),
    [transactions, user?.discipline_score_started_at]
  )

  const flaggedTransactions = useMemo(
    () => disciplineWindowTransactions.filter((t) => t.flagged),
    [disciplineWindowTransactions]
  )

  /** All-time flagged purchases — discipline window only affects score/insight, not $ pact savings. */
  const allTimeFlaggedTransactions = useMemo(
    () => transactions.filter((t) => t.flagged),
    [transactions]
  )

  const flaggedCount = flaggedTransactions.length

  const disciplineScore = useMemo(() => {
    if (
      user?.discipline_score !== undefined &&
      user?.discipline_score !== null &&
      !Number.isNaN(Number(user.discipline_score))
    ) {
      return Math.max(0, Math.min(100, Math.round(Number(user.discipline_score))))
    }
    if (disciplineWindowTransactions.length === 0) return null
    return Math.max(
      0,
      Math.min(100, Math.round(100 - (flaggedCount / disciplineWindowTransactions.length) * 100))
    )
  }, [user?.discipline_score, disciplineWindowTransactions.length, flaggedCount])

  const flaggedSharePercent =
    disciplineWindowTransactions.length === 0
      ? null
      : Math.max(
          0,
          Math.min(100, Math.round((flaggedCount / disciplineWindowTransactions.length) * 100))
        )

  const greeting = useMemo(() => {
    if (bg === 'red') {
      return {
        title: `We need to talk, ${firstName} 🚨`,
        subtitle:
          'A large share of your tracked spending is hitting pact rules—your discipline score is under heavy pressure.',
      }
    }
    if (bg === 'stormy') {
      return {
        title: `Heads up, ${firstName} 🌧️`,
        subtitle:
          'Flagged purchases are a growing slice of activity—tighten focus before the score slips further.',
      }
    }
    if (bg === 'sunny') {
      return {
        title: `Keep it up, ${firstName} ☀️`,
        subtitle:
          'Most of your tracked purchases are staying within your rules—discipline score is in a strong range.',
      }
    }
    if (bg === 'money') {
      return {
        title: `Nice work, ${firstName} 💰`,
        subtitle:
          "You're in a solid range—keep shaving down the flagged share of spending to push the score higher.",
      }
    }
    return {
      title: `Welcome back, ${firstName} 👋`,
      subtitle: "You're on track to build better financial habits.",
    }
  }, [bg, firstName])

  /** Simulated savings rows keyed by source transaction (for sub-lines under purchases). */
  const savingsTransfersBySourceTxId = useMemo(() => {
    const map = {}
    for (const tr of simulatedSavings.transfers) {
      const sid = tr.source_transaction_id
      if (sid == null) continue
      const key = String(sid)
      if (!map[key]) map[key] = []
      map[key].push(tr)
    }
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => {
        const tb = new Date(b.created_at).getTime()
        const ta = new Date(a.created_at).getTime()
        return tb - ta
      })
    }
    return map
  }, [simulatedSavings.transfers])

  // Purchases only (do not merge savings into the same sort/slice — transfers were crowding out normal txns).
  const recentPurchases = useMemo(
    () => sortTransactionsByActivityDate(transactions).slice(0, 6),
    [transactions]
  )

  const bankConnected = plaidItems.length > 0

  const monthPurchaseTransactions = useMemo(
    () => filterPurchasesInCurrentMonth(transactions),
    [transactions]
  )

  const monthCategorySpending = useMemo(
    () => buildDisciplineSpendingBreakdown(monthPurchaseTransactions, normalizeCategory),
    [monthPurchaseTransactions]
  )

  const monthSpendingTotal = monthCategorySpending.total
  const monthSpendChartDenominator = monthSpendingTotal > 0 ? monthSpendingTotal : 1
  const categoryBreakdown = monthCategorySpending.items

  const monthlySpendingData = useMemo(
    () => buildMonthlySpendingData(transactions, 6),
    [transactions]
  )

  const disciplineWindowSpendTotal = useMemo(
    () =>
      disciplineWindowTransactions.reduce((sum, tx) => {
        const amt = Number(tx.amount || 0)
        return sum + (Number.isFinite(amt) && amt > 0 ? amt : 0)
      }, 0),
    [disciplineWindowTransactions]
  )

  const disciplineWindowCategorySpending = useMemo(
    () =>
      buildDisciplineSpendingBreakdown(
        disciplineWindowTransactions.filter((tx) => Number(tx.amount || 0) > 0),
        normalizeCategory
      ),
    [disciplineWindowTransactions]
  )

  const calendarMonthLabel = new Date().toLocaleString('default', {
    month: 'long',
    year: 'numeric',
  })

  const monthSpendAriaLabel =
    categoryBreakdown.length === 0
      ? `No category spending recorded for ${calendarMonthLabel}`
      : `Spending this month (${calendarMonthLabel}): ${categoryBreakdown
          .map((row) => `${row.category} ${formatCurrency(row.amount)}, ${row.percent} percent`)
          .join('; ')}`

  const pactSavingsFromRules = useMemo(() => {
    return computePactSavings({
      flaggedTransactions: allTimeFlaggedTransactions,
      activePacts,
      accountabilityByPact,
      transactionMatchesPact,
      debug: Boolean(import.meta.env.DEV),
    })
  }, [allTimeFlaggedTransactions, activePacts, accountabilityByPact])

  // Simulated ledger can lag (e.g. settings saved after txn, or migration not run). Never show $0
  // when rules say savings apply — max() keeps the card aligned with “broke pact → $ to savings”.
  const pactSavingsDisplay = simulatedSavings.enabled
    ? Math.max(simulatedSavings.totalRecorded, pactSavingsFromRules)
    : pactSavingsFromRules

  const activeRuleCards = useMemo(() => {
    return activePacts.map((pact) => {
      const settings = accountabilityByPact[pact.id]

      return {
        id: pact.id,
        title: normalizeCategory(
          pact.custom_category || pact.category || pact.preset_category
        ),
        subtitle: settings
          ? accountabilityLabel(
              settings.accountability_type,
              settings.discipline_savings_percentage
            )
          : 'No accountability settings saved',
        note: '',
        enabled: String(pact.status).toLowerCase() === 'active',
      }
    })
  }, [activePacts, accountabilityByPact])

  const insightText = useMemo(() => {
    if (transactions.length === 0) {
      return {
        headline: 'No transaction activity yet.',
        suggestion: bankConnected
          ? 'Your bank is connected. Run a sync to pull the latest sandbox transactions.'
          : 'Connect your bank when ready to start tracking spending patterns and pact performance.',
      }
    }

    if (disciplineWindowTransactions.length === 0) {
      return {
        headline: 'Discipline window is empty so far.',
        suggestion:
          'Your score only looks at purchases from your current discipline start time. Sync new activity to build the window; full history stays visible below.',
      }
    }

    if (flaggedCount > 0) {
      const topFlaggedCategory = flaggedTransactions.reduce((acc, tx) => {
        const key = normalizeCategory(tx.category)
        acc[key] = (acc[key] || 0) + 1
        return acc
      }, {})

      const [topCategory] =
        Object.entries(topFlaggedCategory).sort((a, b) => b[1] - a[1])[0] || []

      return {
        headline: `You have ${flaggedCount} flagged purchase${flaggedCount === 1 ? '' : 's'}${
          topCategory ? `, mostly in ${topCategory}` : ''
        }.`,
        suggestion:
          'Review the flagged categories and keep your active pact rules focused on those spending habits.',
      }
    }

    if (activePacts.length > 0) {
      return {
        headline: `No flagged purchases in your discipline window across ${disciplineWindowTransactions.length} transaction${
          disciplineWindowTransactions.length === 1 ? '' : 's'
        }.`,
        suggestion: `Your ${activePacts.length} active pact rule${
          activePacts.length === 1 ? '' : 's'
        } look good for new spending. Stay consistent.`,
      }
    }

    return {
      headline: 'No flagged purchases in your discipline window.',
      suggestion:
        'Add pact rules so new purchases are evaluated against your goals.',
    }
  }, [
    transactions.length,
    disciplineWindowTransactions.length,
    flaggedCount,
    flaggedTransactions,
    activePacts.length,
    bankConnected,
  ])

  return (
    <div className="dashboard-shell">
      <DashboardTopbar navAriaLabel="Dashboard" />

      {user?.card_locked ? (
        <div className="dashboard-card-lock-banner" role="status">
          <strong>Card is locked.</strong> New purchases are blocked. Plaid-synced charges will be flagged.
          {' '}
          <Link to="/settings">Unlock in Settings</Link>
        </div>
      ) : null}

      {plaidItems.some((item) => item.needs_reauth) ? (
        <div className="dashboard-reauth-banner" role="alert">
          <strong>One of your banks needs re-authentication.</strong>{' '}
          Transaction syncing is paused for{' '}
          {plaidItems
            .filter((item) => item.needs_reauth)
            .map((item) => item.institution_name || 'a linked bank')
            .join(', ')}
          .{' '}
          <Link to="/settings">Reconnect in Settings →</Link>
        </div>
      ) : null}

      <section className="dashboard-hero">
        <div className="dashboard-hero-copy">
          <h1 className="dashboard-title">{greeting.title}</h1>
          <p className="dashboard-subtitle">{greeting.subtitle}</p>
        </div>

        <div className="dashboard-hero-actions">
          <div className="dashboard-pill">
            {loading
              ? 'Loading activity...'
              : `${disciplineWindowTransactions.length} in score window`}
          </div>

          {bankConnected ? (
            <button
              className="dashboard-pill dashboard-pill-action"
              type="button"
              onClick={handleSyncAll}
              disabled={syncing}
            >
              {syncing ? 'Syncing...' : 'Sync Bank →'}
            </button>
          ) : (
            <PlaidConnectButton
              token={token}
              onSuccess={handlePlaidConnected}
              className="dashboard-pill dashboard-pill-action"
            >
              Connect Bank →
            </PlaidConnectButton>
          )}
        </div>
      </section>

      <section className="dashboard-overview-shell">
        <section className="dashboard-top-grid">
          {!bankConnected ? (
            <div className="dashboard-card dashboard-card-wide dashboard-connect-card">
              <p className="dashboard-card-label">Connect your bank</p>
              <h3 className="dashboard-connect-title">
                Link your account to unlock live tracking
              </h3>
              <p className="dashboard-connect-copy">
                Sync checking and savings to view transactions, detect flagged purchases,
                and power your accountability rules.
              </p>
              <PlaidConnectButton token={token} onSuccess={handlePlaidConnected} />
            </div>
          ) : (
            <>
              <div className="dashboard-card">
                <p className="dashboard-card-label">Linked Banks</p>
                <p className="dashboard-stat">{plaidItems.length}</p>
              </div>

              <div className="dashboard-card">
                <p className="dashboard-card-label">Window Spending</p>
                <p className="dashboard-stat">{formatCurrency(disciplineWindowSpendTotal)}</p>
                <p className="dashboard-card-footnote">
                  {disciplineWindowTransactions.length} transaction{disciplineWindowTransactions.length === 1 ? '' : 's'} · discipline window
                </p>
              </div>
            </>
          )}

          <div className="dashboard-card">
            <p className="dashboard-card-label">Pact Savings</p>
            <p className="dashboard-stat">{formatCurrency(pactSavingsDisplay)}</p>
          </div>

          <div className="dashboard-card dashboard-score-card dashboard-card-hero-accent">
            <div>
              <p className="dashboard-card-label">Discipline Score</p>
              <p className="dashboard-score-copy">
                {flaggedSharePercent === null
                  ? 'No purchases in your discipline window yet — only new activity after your score start time counts.'
                  : `${flaggedSharePercent}% of window purchases flagged — score is the inverse (higher is better).`}
              </p>
              <details className="dashboard-score-explain">
                <summary>How is this calculated?</summary>
                <p>
                  We count only purchases made after your score start time
                  (reset anytime from Settings). The score is
                  100 × (1 − flagged ÷ total purchases), rounded to a whole
                  number. A purchase is flagged when it matches one of your
                  active pacts — either by merchant/description keywords or by
                  the classifier. New users start at 100 and the score falls
                  only as real flagged activity lands.
                </p>
              </details>
            </div>

            <div className="dashboard-score-meter">
              <p className="dashboard-score-meter-value">
                {loading || disciplineScore === null ? '—' : `${disciplineScore}%`}
              </p>
              <div className="dashboard-score-meter-track" aria-hidden="true">
                <div
                  className="dashboard-score-meter-fill"
                  style={{
                    width: loading || disciplineScore === null ? '0%' : `${disciplineScore}%`,
                  }}
                />
              </div>
            </div>
          </div>
        </section>

        <section className="dashboard-content-grid">
          <div className="dashboard-content-column dashboard-content-column--activity">
            <div className="dashboard-card dashboard-panel dashboard-panel-hero">
              <div className="dashboard-panel-header">
                <h2>This month&apos;s spending</h2>
                <span>
                  {calendarMonthLabel} · {formatCurrency(monthSpendingTotal)} total
                </span>
              </div>

              <div className="dashboard-analytics-card dashboard-analytics-card--discipline">
                {categoryBreakdown.length === 0 ? (
                  <div className="discipline-spend-empty">
                    <p className="dashboard-empty">
                      No purchases recorded for {calendarMonthLabel} yet (positive amounts, by bank date when
                      available).
                    </p>
                    <p className="discipline-spend-hint">
                      Connect and sync your bank, or add purchases dated this month, to see your category chart
                      here. Discipline score still uses your separate score window.
                    </p>
                    <Link className="discipline-spend-link" to="/analytics">
                      Open analytics →
                    </Link>
                  </div>
                ) : (
                  <>
                    <div className="discipline-spend-summary">
                      <div>
                        <p className="discipline-spend-kicker">{calendarMonthLabel}</p>
                        <p className="discipline-spend-total">{formatCurrency(monthSpendingTotal)}</p>
                        <p className="discipline-spend-sub">
                          {monthPurchaseTransactions.length} purchase
                          {monthPurchaseTransactions.length === 1 ? '' : 's'} · calendar month (local time)
                        </p>
                      </div>
                      <Link
                        className="discipline-spend-link discipline-spend-link--pill"
                        to="/analytics"
                      >
                        Details →
                      </Link>
                    </div>

                    <div className="discipline-spend-chart-block">
                      <div className="discipline-spend-mix-head">
                        <p className="discipline-spend-mix-label">Spending by category</p>
                        <span className="discipline-spend-mix-caption">Bar height = share of month</span>
                      </div>
                      <div
                        className="discipline-spend-chart"
                        role="img"
                        aria-label={monthSpendAriaLabel}
                      >
                        <div className="discipline-spend-chart-plot">
                          <div
                            className="discipline-spend-chart-grid"
                            style={{
                              minWidth: `max(100%, ${categoryBreakdown.length * 72 + Math.max(0, categoryBreakdown.length - 1) * 8}px)`,
                            }}
                          >
                            {categoryBreakdown.map((item) => {
                              const sharePct =
                                (item.amount / monthSpendChartDenominator) * 100
                              return (
                                <div key={item.category} className="discipline-spend-chart-col">
                                  <div className="discipline-spend-chart-track">
                                    <div
                                      className="discipline-spend-chart-bar"
                                      style={{
                                        height: `${sharePct}%`,
                                        backgroundColor: item.color,
                                      }}
                                      title={`${item.category}: ${formatCurrency(item.amount)} (${item.percent}% of month)`}
                                    />
                                  </div>
                                  <span className="discipline-spend-chart-value">
                                    {formatCurrency(item.amount)}
                                  </span>
                                  <span className="discipline-spend-chart-pct">{item.percent}%</span>
                                  <span className="discipline-spend-chart-label">{item.category}</span>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="dashboard-card dashboard-panel dashboard-window-spend-panel">
              <div className="dashboard-panel-header">
                <h2>Discipline Window Spending</h2>
                <span>{formatCurrency(disciplineWindowSpendTotal)} total</span>
              </div>

              {disciplineWindowTransactions.length === 0 ? (
                <p className="dashboard-empty">
                  No transactions in your discipline window yet. Spending is tracked from your score start date forward.
                </p>
              ) : (
                <div className="dashboard-window-spend-body">
                  <div className="dashboard-window-spend-stats">
                    <div className="dashboard-window-spend-stat">
                      <span className="dashboard-window-spend-stat-value">{formatCurrency(disciplineWindowSpendTotal)}</span>
                      <span className="dashboard-window-spend-stat-label">Total spend</span>
                    </div>
                    <div className="dashboard-window-spend-stat">
                      <span className="dashboard-window-spend-stat-value">{disciplineWindowTransactions.length}</span>
                      <span className="dashboard-window-spend-stat-label">Purchases</span>
                    </div>
                    <div className="dashboard-window-spend-stat">
                      <span className="dashboard-window-spend-stat-value is-flagged">{flaggedTransactions.length}</span>
                      <span className="dashboard-window-spend-stat-label">Flagged</span>
                    </div>
                    <div className="dashboard-window-spend-stat">
                      <span className="dashboard-window-spend-stat-value">
                        {disciplineWindowTransactions.length > 0
                          ? formatCurrency(disciplineWindowSpendTotal / disciplineWindowTransactions.length)
                          : '—'}
                      </span>
                      <span className="dashboard-window-spend-stat-label">Avg / purchase</span>
                    </div>
                  </div>

                  {disciplineWindowCategorySpending.items.length > 0 && (
                    <div className="dashboard-window-spend-categories">
                      <p className="dashboard-window-spend-cat-label">Breakdown by category</p>
                      {disciplineWindowCategorySpending.items.map((item) => (
                        <div key={item.category} className="dashboard-window-spend-cat-row">
                          <div className="dashboard-window-spend-cat-info">
                            <span
                              className="dashboard-window-spend-cat-dot"
                              style={{ background: item.color }}
                            />
                            <span className="dashboard-window-spend-cat-name">{item.category}</span>
                          </div>
                          <div className="dashboard-window-spend-cat-bar-wrap">
                            <div
                              className="dashboard-window-spend-cat-bar"
                              style={{ width: `${item.percent}%`, background: item.color }}
                            />
                          </div>
                          <span className="dashboard-window-spend-cat-amount">{formatCurrency(item.amount)}</span>
                          <span className="dashboard-window-spend-cat-pct">{item.percent}%</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="dashboard-card dashboard-panel">
              <div className="dashboard-panel-header">
                <h2>Recent Activity</h2>
                <Link className="dashboard-link-button" to="/transactions">
                  See All →
                </Link>
              </div>

              {loading && <p className="dashboard-empty">Loading transactions...</p>}
              {error && <p className="dashboard-error">{error}</p>}

              {!loading && !error && recentPurchases.length === 0 && (
                <p className="dashboard-empty">
                  {bankConnected
                    ? 'Your bank is connected, but no transactions have synced yet. Try Sync Bank.'
                    : 'No activity yet. Add a purchase or connect your bank to populate this feed.'}
                </p>
              )}

              {!loading && !error && recentPurchases.length > 0 && (
                <div className="dashboard-activity-list">
                  {recentPurchases.map((tx) => {
                    const sid = String(tx.id)
                    const savingsForTx = savingsTransfersBySourceTxId[sid] || []
                    return (
                      <div className="dashboard-activity-group" key={sid}>
                        <div className="dashboard-activity-row">
                          <div className="dashboard-activity-main">
                            <div className="dashboard-activity-merchant">{tx.merchant}</div>
                            <div className="dashboard-activity-meta">
                              {formatTransactionDate(tx)} ·{' '}
                              {formatTransactionCategory(tx.category)}
                            </div>

                            {tx.flagged && (
                              <div className="dashboard-activity-flag">
                                ⚠ {tx.flag_reason || 'Flagged purchase'}
                              </div>
                            )}

                            {!tx.flagged && tx.description && (
                              <div className="dashboard-activity-meta">{tx.description}</div>
                            )}
                          </div>

                          <div
                            className={`dashboard-activity-amount ${
                              tx.flagged ? 'is-flagged' : ''
                            }`}
                          >
                            {formatTransactionAmount(tx.amount)}
                          </div>
                        </div>

                        {savingsForTx.map((tr) => (
                          <div
                            className="dashboard-activity-row dashboard-activity-simulated-transfer dashboard-activity-savings-followup"
                            key={`sim-${tr.id}`}
                          >
                            <div className="dashboard-activity-main">
                              <div className="dashboard-activity-merchant">
                                {formatCurrency(tr.amount)} moved to savings (simulated)
                              </div>
                              <div className="dashboard-activity-meta">
                                From this purchase · your discipline savings % applied (simulated, not a bank
                                transfer)
                              </div>
                            </div>
                            <div className="dashboard-activity-amount is-simulated-savings">
                              {formatCurrency(tr.amount)}
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="dashboard-content-column dashboard-content-column--stack">
            <div className="dashboard-card dashboard-panel">
              <div className="dashboard-panel-header">
                <h2>Monthly Spending</h2>
                <span>Last 6 months</span>
              </div>
              {monthlySpendingData.every((m) => m.total === 0) ? (
                <p className="dashboard-empty">No spending data yet — sync your bank to populate this chart.</p>
              ) : (() => {
                const W = 260, H = 96
                const PAD_L = 38, PAD_R = 8, PAD_T = 8, PAD_B = 22
                const chartW = W - PAD_L - PAD_R
                const chartH = H - PAD_T - PAD_B
                const maxTotal = Math.max(...monthlySpendingData.map((d) => d.total), 1)
                const n = monthlySpendingData.length
                const pts = monthlySpendingData.map((d, i) => ({
                  ...d,
                  x: PAD_L + (n > 1 ? i / (n - 1) : 0.5) * chartW,
                  y: PAD_T + chartH - (d.total / maxTotal) * chartH,
                }))
                const lineStr = pts
                  .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
                  .join(' ')
                const areaStr =
                  lineStr +
                  ` L${pts[n - 1].x.toFixed(1)},${(PAD_T + chartH).toFixed(1)}` +
                  ` L${pts[0].x.toFixed(1)},${(PAD_T + chartH).toFixed(1)} Z`
                const fmtAxis = (v) =>
                  v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${Math.round(v)}`
                return (
                  <svg
                    viewBox={`0 0 ${W} ${H}`}
                    style={{ width: '100%', height: 'auto', overflow: 'visible', display: 'block', marginTop: '0.5rem' }}
                    aria-label={`Monthly spending chart: ${monthlySpendingData.map((m) => `${m.label} $${m.total.toFixed(2)}`).join(', ')}`}
                  >
                    <defs>
                      <linearGradient id="ms-area-grad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#d4a24c" stopOpacity="0.32" />
                        <stop offset="100%" stopColor="#d4a24c" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <text x={PAD_L - 5} y={PAD_T + 4} textAnchor="end" fontSize="7.5" fill="#8a828c">
                      {fmtAxis(maxTotal)}
                    </text>
                    <text x={PAD_L - 5} y={PAD_T + chartH} textAnchor="end" fontSize="7.5" fill="#8a828c">
                      $0
                    </text>
                    <line x1={PAD_L} y1={PAD_T} x2={PAD_L + chartW} y2={PAD_T} stroke="rgba(60,45,35,0.07)" strokeWidth="1" />
                    <line x1={PAD_L} y1={PAD_T + chartH} x2={PAD_L + chartW} y2={PAD_T + chartH} stroke="rgba(60,45,35,0.15)" strokeWidth="1.5" />
                    <path d={areaStr} fill="url(#ms-area-grad)" />
                    <path d={lineStr} fill="none" stroke="#c9963a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    {pts.map((p, i) => (
                      <g key={i}>
                        <circle cx={p.x} cy={p.y} r="3.2" fill="#c9963a" stroke="white" strokeWidth="1.5">
                          <title>{`${p.label}: $${p.total.toFixed(2)}`}</title>
                        </circle>
                        <text x={p.x} y={H - 2} textAnchor="middle" fontSize="7.5" fill="#6d6670">
                          {p.label}
                        </text>
                      </g>
                    ))}
                  </svg>
                )
              })()}
            </div>

            <div className="dashboard-card dashboard-panel">
              <div className="dashboard-panel-header">
                <h2>Your Pact Rules</h2>
              </div>

              {loading && <p className="dashboard-empty">Loading pact rules...</p>}

              {!loading && activeRuleCards.length === 0 && (
                <p className="dashboard-empty">No active pact rules yet.</p>
              )}

              {!loading &&
                activeRuleCards.length > 0 &&
                activeRuleCards.map((rule) => (
                  <div className="dashboard-rule-card" key={rule.id}>
                    <div>
                      <h3>{rule.title}</h3>
                      <p>{rule.subtitle}</p>
                      {rule.note ? <p>{rule.note}</p> : null}
                    </div>
                    <button
                      className={`dashboard-toggle ${rule.enabled ? 'is-on' : ''}`}
                      aria-label="Rule status"
                      type="button"
                    />
                  </div>
                ))}

              <Link className="dashboard-link-button" to="/pacts">
                Manage Rules →
              </Link>
            </div>

            <div className="dashboard-card dashboard-panel dashboard-panel-insight">
              <div className="dashboard-panel-header">
                <h2>Insight</h2>
              </div>

              <div className="dashboard-insight-card">
                <p className="dashboard-insight-headline">
                  <strong>{insightText.headline}</strong>
                </p>
                <div className="dashboard-insight-suggestion-block">
                  <p className="dashboard-insight-suggestion-label">Suggestion</p>
                  <p className="dashboard-insight-suggestion-body">{insightText.suggestion}</p>
                </div>
                <div className="dashboard-insight-chart" aria-hidden="true">
                  <div className="dashboard-insight-line" />
                </div>
              </div>
            </div>
          </div>
        </section>
      </section>
    </div>
  )
}
