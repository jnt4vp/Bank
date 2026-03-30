import { useMemo } from 'react'
import { useAuth } from '../features/auth/context'
import { useTransactions } from '../features/transactions/useTransactions'
import DashboardTopbar from '../components/DashboardTopbar'
import '../dashboard.css'
import '../analytics.css'

function dollars(value) {
  return '$' + Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })
}

function normalizeCategory(cat) {
  if (!cat) return 'Other'
  return String(cat).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

export default function Analytics() {
  const { token } = useAuth()
  const { transactions, loading } = useTransactions(token)

  const totalSpent = useMemo(
    () => transactions.reduce((s, t) => s + t.amount, 0),
    [transactions]
  )

  const flaggedAmount = useMemo(
    () => transactions.filter(t => t.flagged).reduce((s, t) => s + t.amount, 0),
    [transactions]
  )

  const flaggedCount = transactions.filter(t => t.flagged).length

  const disciplineScore = useMemo(() => {
    if (!transactions.length) return null
    return Math.round(100 - (flaggedCount / transactions.length) * 100)
  }, [transactions, flaggedCount])

  const categoryBreakdown = useMemo(() => {
    const totals = {}
    transactions.forEach(t => {
      const cat = normalizeCategory(t.category)
      totals[cat] = (totals[cat] || 0) + t.amount
    })
    const max = Math.max(...Object.values(totals), 1)
    return Object.entries(totals)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 7)
      .map(([category, amount]) => ({ category, amount, barPercent: (amount / max) * 100 }))
  }, [transactions])

  const topMerchants = useMemo(() => {
    const totals = {}
    transactions.forEach(t => {
      const m = t.merchant || t.description || 'Unknown'
      totals[m] = (totals[m] || 0) + t.amount
    })
    return Object.entries(totals)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 6)
      .map(([merchant, amount]) => ({ merchant, amount }))
  }, [transactions])

  const monthlySpending = useMemo(() => {
    const months = {}
    transactions.forEach(t => {
      const d = new Date(t.date || t.created_at)
      if (isNaN(d)) return
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      months[key] = (months[key] || 0) + t.amount
    })
    const sorted = Object.entries(months).sort().slice(-6)
    const max = Math.max(...sorted.map(([, v]) => v), 1)
    return sorted.map(([key, amount]) => {
      const [year, month] = key.split('-')
      const label = new Date(Number(year), Number(month) - 1).toLocaleString('default', { month: 'short' })
      return { label, amount, barPercent: (amount / max) * 100 }
    })
  }, [transactions])

  const empty = !loading && transactions.length === 0

  return (
    <div className="dashboard-shell">
      <DashboardTopbar navAriaLabel="Analytics" />

      <section className="dashboard-hero">
        <div className="dashboard-hero-copy">
          <h1 className="dashboard-title">Analytics</h1>
          <p className="dashboard-subtitle">Where your money went, and whether it should have.</p>
        </div>
      </section>

      <section className="dashboard-overview-shell">

        <section className="dashboard-top-grid">
          <div className="dashboard-card">
            <p className="dashboard-card-label">Total Spent</p>
            <p className="dashboard-stat">{loading ? '—' : dollars(totalSpent)}</p>
          </div>
          <div className="dashboard-card">
            <p className="dashboard-card-label">Flagged Spend</p>
            <p className="dashboard-stat">{loading ? '—' : dollars(flaggedAmount)}</p>
          </div>
          <div className="dashboard-card">
            <p className="dashboard-card-label">Transactions</p>
            <p className="dashboard-stat">{loading ? '—' : transactions.length}</p>
          </div>
          <div className="dashboard-card dashboard-card-hero-accent">
            <p className="dashboard-card-label">Discipline Score</p>
            <p className="dashboard-stat">
              {loading ? '—' : disciplineScore === null ? '—' : `${disciplineScore}%`}
            </p>
          </div>
        </section>

        {empty ? (
          <div className="dashboard-card analytics-empty">
            <p>Connect your bank to see your analytics.</p>
          </div>
        ) : (
          <section className="dashboard-content-grid">

            {/* Spending by category */}
            <div className="dashboard-card dashboard-panel">
              <div className="dashboard-panel-header">
                <h2>By Category</h2>
                <span>{dollars(totalSpent)} total</span>
              </div>
              <div className="analytics-category-list">
                {categoryBreakdown.map(({ category, amount, barPercent }) => (
                  <div key={category} className="analytics-category-row">
                    <div className="analytics-category-top">
                      <span>{category}</span>
                      <span className="analytics-category-amount">{dollars(amount)}</span>
                    </div>
                    <div className="analytics-bar-track">
                      <div className="analytics-bar-fill" style={{ width: `${barPercent}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Top merchants */}
            <div className="dashboard-card dashboard-panel">
              <div className="dashboard-panel-header">
                <h2>Top Merchants</h2>
              </div>
              <div className="analytics-merchant-list">
                {topMerchants.map(({ merchant, amount }, i) => (
                  <div key={merchant} className="analytics-merchant-row">
                    <span className="analytics-rank">{i + 1}</span>
                    <span className="analytics-merchant-name">{merchant}</span>
                    <span className="analytics-merchant-amount">{dollars(amount)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Monthly trend */}
            {monthlySpending.length > 0 && (
              <div className="dashboard-card dashboard-panel dashboard-card-wide">
                <div className="dashboard-panel-header">
                  <h2>Monthly Spending</h2>
                </div>
                <div className="analytics-monthly-chart">
                  {monthlySpending.map(({ label, amount, barPercent }) => (
                    <div key={label} className="analytics-monthly-col">
                      <span className="analytics-monthly-amount">{dollars(amount)}</span>
                      <div className="analytics-monthly-track">
                        <div className="analytics-monthly-bar" style={{ height: `${barPercent}%` }} />
                      </div>
                      <span className="analytics-monthly-label">{label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </section>
        )}
      </section>
    </div>
  )
}
