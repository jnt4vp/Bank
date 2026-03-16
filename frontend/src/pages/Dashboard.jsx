import { useEffect, useMemo, useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { useAuth } from '../features/auth/context'
import { apiRequest } from '../lib/api/client'
import '../dashboard.css'

const primaryNavItems = [
  { label: 'Dashboard', to: '/dashboard', disabled: false },
  { label: 'Goals', to: '#', disabled: true },
  { label: 'Rules', to: '#', disabled: true },
  { label: 'Analytics', to: '#', disabled: true },
]

const CATEGORY_STYLES = {
  food: 'dot-food',
  dining: 'dot-food',
  restaurant: 'dot-food',
  groceries: 'dot-food',
  shopping: 'dot-shopping',
  retail: 'dot-shopping',
  subscriptions: 'dot-subscriptions',
  subscription: 'dot-subscriptions',
  other: 'dot-other',
}

function formatCurrency(value) {
  return `$${Number(value || 0).toFixed(2)}`
}

function isToday(dateString) {
  if (!dateString) return false
  const date = new Date(dateString)
  const now = new Date()

  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  )
}

function normalizeCategory(category) {
  if (!category) return 'Other'
  return category
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function getCategoryDotClass(category) {
  const key = String(category || '').toLowerCase()
  return CATEGORY_STYLES[key] || 'dot-other'
}

export default function Dashboard() {
  const { user, token, logout } = useAuth()
  const firstName = user?.name?.split(' ')[0] || 'there'
  const userLabel = user?.name || user?.email || 'User'

  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    if (!token) {
      setLoading(false)
      return
    }

    let cancelled = false

    async function loadTransactions() {
      try {
        setLoading(true)
        setError(null)

        const data = await apiRequest('/api/transactions/', { token })

        const rawTransactions = Array.isArray(data)
          ? data
          : Array.isArray(data?.results)
            ? data.results
            : Array.isArray(data?.transactions)
              ? data.transactions
              : []

        const normalizedTransactions = rawTransactions
          .map((tx) => ({
            id: tx.id,
            user_id: tx.user_id,
            merchant: tx.merchant || tx.description || 'Unknown merchant',
            category: tx.category || 'Other',
            amount: Number(tx.amount || 0),
            flagged: Boolean(tx.flagged),
            flag_reason: tx.flag_reason || '',
            created_at: tx.created_at,
            description: tx.description || '',
          }))
          .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

        if (!cancelled) {
          setTransactions(normalizedTransactions)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Something went wrong.')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadTransactions()

    return () => {
      cancelled = true
    }
  }, [token])

  useEffect(() => {
    function handlePointerDown(event) {
      if (!event.target.closest('.dashboard-profile-menu')) {
        setMenuOpen(false)
      }
    }

    function handleEscape(event) {
      if (event.key === 'Escape') {
        setMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [])

  const flaggedCount = useMemo(
    () => transactions.filter((t) => t.flagged).length,
    [transactions]
  )

  const disciplineScore = useMemo(() => {
    if (transactions.length === 0) return null
    return Math.max(
      0,
      Math.round(100 - (flaggedCount / transactions.length) * 100)
    )
  }, [transactions, flaggedCount])

  const recentTransactions = useMemo(
    () => transactions.slice(0, 4),
    [transactions]
  )

  const bankConnected = transactions.length > 0

  const todayTransactions = useMemo(
    () => transactions.filter((tx) => isToday(tx.created_at)),
    [transactions]
  )

  const todayTotal = useMemo(
    () => todayTransactions.reduce((sum, tx) => sum + tx.amount, 0),
    [todayTransactions]
  )

  const categoryBreakdown = useMemo(() => {
    if (todayTransactions.length === 0) return []

    const totals = todayTransactions.reduce((acc, tx) => {
      const category = normalizeCategory(tx.category)
      acc[category] = (acc[category] || 0) + tx.amount
      return acc
    }, {})

    return Object.entries(totals)
      .map(([category, amount]) => ({
        category,
        amount,
        percent: todayTotal > 0 ? Math.round((amount / todayTotal) * 100) : 0,
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 4)
  }, [todayTransactions, todayTotal])

  return (
    <div className="dashboard-shell">
      <header className="dashboard-topbar">
        <div className="dashboard-brand">
          <div className="dashboard-brand-row">
            <svg width="44" height="44" viewBox="0 0 44 44" fill="none" aria-hidden="true">
              <path
                d="M14 32C14 32 14 24 22 24C30 24 30 18 30 18"
                stroke="#6b4f1d"
                strokeWidth="4"
                strokeLinecap="round"
              />
              <path
                d="M14 26C14 26 14 18 22 18C30 18 30 12 30 12"
                stroke="#a0813a"
                strokeWidth="3"
                strokeLinecap="round"
                opacity="0.7"
              />
            </svg>
            <span className="dashboard-brand-text">PactBank</span>
          </div>
          <div className="dashboard-brand-copy">
            <p className="dashboard-brand-subtitle">Accountability Banking</p>
          </div>
        </div>

        <nav className="dashboard-nav" aria-label="Dashboard">
          {primaryNavItems.map((item) => (
            item.disabled ? (
              <button key={item.label} type="button" className="dashboard-nav-link dashboard-nav-link-disabled">
                {item.label}
              </button>
            ) : (
              <NavLink
                key={item.label}
                to={item.to}
                className={({ isActive }) =>
                  `dashboard-nav-link ${isActive ? 'dashboard-nav-link-active' : ''}`
                }
              >
                {item.label}
              </NavLink>
            )
          ))}
        </nav>

        <div className="dashboard-topbar-actions">
          <button type="button" className="dashboard-icon-button" aria-label="Notifications">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M15 17H9M18 17V11C18 7.68629 15.3137 5 12 5C8.68629 5 6 7.68629 6 11V17L4 19H20L18 17Z"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>

          <div className="dashboard-profile-menu">
            <button
              type="button"
              className="dashboard-profile-trigger"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <span className="dashboard-avatar">{userLabel.charAt(0).toUpperCase()}</span>
              <span className="dashboard-profile-name">{userLabel}</span>
              <span className={`dashboard-profile-chevron ${menuOpen ? 'is-open' : ''}`}>⌄</span>
            </button>

            {menuOpen && (
              <div className="dashboard-profile-dropdown">
                <Link to="/settings" className="dashboard-profile-item" onClick={() => setMenuOpen(false)}>
                  Settings
                </Link>
                <button type="button" className="dashboard-profile-item" onClick={logout}>
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <section className="dashboard-hero">
        <div className="dashboard-hero-copy">
          <h1 className="dashboard-title">
            Welcome back, {firstName} <span className="dashboard-wave">👋</span>
          </h1>
          <p className="dashboard-subtitle">
            You&apos;re on track to build better financial habits.
          </p>
        </div>

        <div className="dashboard-hero-actions">
          <div className="dashboard-pill">
            {loading ? 'Loading activity...' : `${transactions.length} Transactions`}
          </div>
          <button className="dashboard-pill dashboard-pill-action" type="button">
            View Insights →
          </button>
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
              <button className="dashboard-button" type="button">Connect with Plaid</button>
            </div>
          ) : (
            <>
              <div className="dashboard-card">
                <p className="dashboard-card-label">Transactions</p>
                <p className="dashboard-stat">{transactions.length}</p>
              </div>

              <div className="dashboard-card">
                <p className="dashboard-card-label">Flagged Purchases</p>
                <p className="dashboard-stat">{flaggedCount}</p>
              </div>
            </>
          )}

          <div className="dashboard-card">
            <p className="dashboard-card-label">Pact Savings</p>
            <p className="dashboard-stat">$145.00</p>
          </div>

          <div className="dashboard-card dashboard-score-card dashboard-card-hero-accent">
            <div>
              <p className="dashboard-card-label">Discipline Score</p>
              <p className="dashboard-score-copy">
                {flaggedCount} flagged of {transactions.length} total
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
              <h2>Today</h2>
              <span>{formatCurrency(todayTotal)} total</span>
            </div>

            <div className="dashboard-analytics-card">
              <div className="dashboard-donut-wrap">
                <div className="dashboard-donut">
                  <div className="dashboard-donut-center">
                    {formatCurrency(todayTotal)}
                  </div>
                </div>
              </div>

              <div className="dashboard-category-list">
                {categoryBreakdown.length === 0 ? (
                  <p className="dashboard-empty">No transactions for today yet.</p>
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

            <div className="dashboard-rule-card">
              <div>
                <h3>No takeout on weekdays</h3>
                <p>$10 penalty</p>
              </div>
              <button className="dashboard-toggle is-on" aria-label="Toggle rule" type="button" />
            </div>

            <div className="dashboard-rule-card">
              <div>
                <h3>$5 auto-save daily</h3>
                <p>145 / 300 saved</p>
              </div>
              <button className="dashboard-toggle is-on" aria-label="Toggle rule" type="button" />
            </div>

            <button className="dashboard-link-button" type="button">Manage Rules →</button>
          </div>

          <div className="dashboard-card dashboard-panel">
            <div className="dashboard-panel-header">
              <h2>Recent Activity</h2>
              <button className="dashboard-link-button" type="button">See All →</button>
            </div>

            {loading && <p className="dashboard-empty">Loading transactions...</p>}
            {error && <p className="dashboard-error">{error}</p>}

            {!loading && !error && recentTransactions.length === 0 && (
              <p className="dashboard-empty">
                No transactions yet. Connect your bank account to start syncing activity.
              </p>
            )}

            {!loading && !error && recentTransactions.length > 0 && (
              <div className="dashboard-activity-list">
                {recentTransactions.map((tx) => (
                  <div className="dashboard-activity-row" key={tx.id}>
                    <div className="dashboard-activity-main">
                      <div className="dashboard-activity-merchant">{tx.merchant}</div>
                      <div className="dashboard-activity-meta">
                        {tx.created_at
                          ? new Date(tx.created_at).toLocaleDateString()
                          : '—'}{' '}
                        · {normalizeCategory(tx.category)}
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

                    <div className={`dashboard-activity-amount ${tx.flagged ? 'is-flagged' : ''}`}>
                      {formatCurrency(tx.amount)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="dashboard-card dashboard-panel">
            <div className="dashboard-panel-header">
              <h2>Insight</h2>
            </div>

            <div className="dashboard-insight-card">
              <p className="dashboard-insight-copy">
                {flaggedCount > 0 ? (
                  <>
                    You have <strong>{flaggedCount} flagged purchase{flaggedCount === 1 ? '' : 's'}</strong> in your recent activity.
                  </>
                ) : (
                  <>
                    No flagged purchases detected <strong>in your recent activity.</strong>
                  </>
                )}
              </p>
              <p className="dashboard-insight-suggestion">Suggestion:</p>
              <p className="dashboard-insight-copy">
                {flaggedCount > 0
                  ? 'Review the flagged categories and tighten your pact rules around those purchases.'
                  : 'Keep going. Your current transactions are staying within your pact more consistently.'}
              </p>

              <div className="dashboard-insight-chart">
                <div className="dashboard-insight-line" />
              </div>
            </div>
          </div>
        </section>
      </section>
    </div>
  )
}