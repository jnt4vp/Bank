import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTheme } from '../features/theme/useTheme.js'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../features/auth/context'
import {
  formatTransactionAmount,
  formatTransactionCategory,
  formatTransactionDate,
  normalizeTransactionsResponse,
  sortTransactionsByActivityDate,
} from '../features/transactions/formatters'
import { apiRequest } from '../lib/api'
import PlaidConnectButton from '../features/plaid/PlaidConnectButton'
import { getPlaidItems, syncPlaidItem } from '../features/plaid/api'
import { filterTransactionsForDisciplineWindow } from '../features/pacts/disciplineState'
import { computePactSavings } from '../features/pacts/savings'
import DashboardTopbar from '../components/DashboardTopbar'
import '../dashboard.css'

const CATEGORY_STYLES = {
  food: 'dot-food',
  dining: 'dot-food',
  restaurant: 'dot-food',
  groceries: 'dot-food',
  shopping: 'dot-shopping',
  retail: 'dot-shopping',
  subscriptions: 'dot-subscriptions',
  subscription: 'dot-subscriptions',
  entertainment: 'dot-subscriptions',
  other: 'dot-other',
}

function formatCurrency(value) {
  return `$${Number(value || 0).toFixed(2)}`
}

function normalizeCategory(category) {
  if (!category) return 'Other'
  return String(category)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function getCategoryDotClass(category) {
  const key = String(category || '').toLowerCase()
  return CATEGORY_STYLES[key] || 'dot-other'
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
  const { user, token } = useAuth()
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

  const loadDashboardData = useCallback(async (opts = {}) => {
    const silent = opts.silent === true
    if (!token || !user?.id) {
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
        apiRequest(`/api/pacts/user/${user.id}`, { token }),
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
  }, [token, user?.id])

  useEffect(() => {
    if (location.pathname !== '/dashboard') {
      return
    }
    loadDashboardData()
  }, [location.pathname, location.key, loadDashboardData])

  useEffect(() => {
    if (location.pathname !== '/dashboard') {
      return undefined
    }
    function refetchWhenVisible() {
      if (document.visibilityState !== 'visible') {
        return
      }
      loadDashboardData({ silent: true })
    }
    document.addEventListener('visibilitychange', refetchWhenVisible)
    return () => document.removeEventListener('visibilitychange', refetchWhenVisible)
  }, [location.pathname, loadDashboardData])

  const handlePlaidConnected = useCallback(async () => {
    await loadDashboardData()
  }, [loadDashboardData])

  const handleSyncAll = useCallback(async () => {
    if (!token || plaidItems.length === 0) return

    try {
      setSyncing(true)
      setError(null)

      await Promise.all(
        plaidItems.map((item) => syncPlaidItem({ itemId: item.id, token }))
      )

      await loadDashboardData()
    } catch (err) {
      setError(err.message || 'Failed to sync Plaid transactions.')
    } finally {
      setSyncing(false)
    }
  }, [plaidItems, token, loadDashboardData])

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

  const windowSpendingTotal = useMemo(
    () => disciplineWindowTransactions.reduce((sum, tx) => sum + tx.amount, 0),
    [disciplineWindowTransactions]
  )

  const categoryBreakdown = useMemo(() => {
    if (disciplineWindowTransactions.length === 0) return []

    const totals = disciplineWindowTransactions.reduce((acc, tx) => {
      const category = normalizeCategory(tx.category)
      acc[category] = (acc[category] || 0) + tx.amount
      return acc
    }, {})

    return Object.entries(totals)
      .map(([category, amount]) => ({
        category,
        amount,
        percent: windowSpendingTotal > 0 ? Math.round((amount / windowSpendingTotal) * 100) : 0,
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 4)
  }, [disciplineWindowTransactions, windowSpendingTotal])

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
                <p className="dashboard-card-label">Transactions (window)</p>
                <p className="dashboard-stat">{disciplineWindowTransactions.length}</p>
              </div>
            </>
          )}

          <div className="dashboard-card">
            <p className="dashboard-card-label">Pact Savings</p>
            <p className="dashboard-stat">{formatCurrency(pactSavingsDisplay)}</p>
            {simulatedSavings.enabled ? (
              <p className="dashboard-card-footnote">Simulated transfers (demo — not a real bank move)</p>
            ) : null}
          </div>

          <div className="dashboard-card dashboard-score-card dashboard-card-hero-accent">
            <div>
              <p className="dashboard-card-label">Discipline Score</p>
              <p className="dashboard-score-copy">
                {flaggedSharePercent === null
                  ? 'No purchases in your discipline window yet — only new activity after your score start time counts.'
                  : `${flaggedSharePercent}% of window purchases flagged — score is the inverse (higher is better).`}
              </p>
            </div>

            <div className="dashboard-score-ring">
              <div className="dashboard-score-ring-inner">
                {loading || disciplineScore === null ? '—' : `${disciplineScore}%`}
              </div>
            </div>
          </div>
        </section>

        <section className="dashboard-content-grid">
          <div className="dashboard-card dashboard-panel dashboard-panel-hero">
            <div className="dashboard-panel-header">
              <h2>Discipline window spending</h2>
              <span>{formatCurrency(windowSpendingTotal)} total</span>
            </div>

            <div className="dashboard-analytics-card">
              <div className="dashboard-donut-wrap">
                <div className="dashboard-donut">
                  <div className="dashboard-donut-center">{formatCurrency(windowSpendingTotal)}</div>
                </div>
              </div>

              <div className="dashboard-category-list">
                {categoryBreakdown.length === 0 ? (
                  <p className="dashboard-empty">
                    No purchases in your discipline window yet — same window as your score and analytics.
                  </p>
                ) : (
                  categoryBreakdown.map((item) => (
                    <div key={item.category}>
                      <div className="dashboard-category-row">
                        <span>
                          <i className={`dot ${getCategoryDotClass(item.category)}`} />
                          {item.category}
                        </span>
                        <strong>{item.percent}%</strong>
                      </div>
                      <div className="dashboard-category-bar">
                        <span style={{ width: `${item.percent}%` }} />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
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
        </section>
      </section>
    </div>
  )
}
