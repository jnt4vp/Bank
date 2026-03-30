import { useMemo, useState } from 'react'
import { useAuth } from '../features/auth/context'
import { useTransactions } from '../features/transactions/useTransactions'
import DashboardTopbar from '../components/DashboardTopbar'
import '../dashboard.css'
import '../goals.css'

const GOALS_KEY = 'pactbank_goals'

function loadGoals() {
  try { return JSON.parse(localStorage.getItem(GOALS_KEY) || '[]') }
  catch { return [] }
}

function persist(goals) {
  localStorage.setItem(GOALS_KEY, JSON.stringify(goals))
}

function getMonthStart() {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

export default function Goals() {
  const { token } = useAuth()
  const { transactions, loading } = useTransactions(token)
  const [goals, setGoals] = useState(loadGoals)
  const [category, setCategory] = useState('')
  const [limit, setLimit] = useState('')
  const [formError, setFormError] = useState('')

  const monthStart = useMemo(() => getMonthStart(), [])

  const monthlySpending = useMemo(() => {
    const totals = {}
    transactions
      .filter(t => new Date(t.date || t.created_at) >= monthStart)
      .forEach(t => {
        const key = (t.category || 'Other').toLowerCase()
        totals[key] = (totals[key] || 0) + t.amount
      })
    return totals
  }, [transactions, monthStart])

  const onTrack = goals.filter(g => (monthlySpending[g.category.toLowerCase()] || 0) <= g.limit).length

  function addGoal(e) {
    e.preventDefault()
    const trimmed = category.trim()
    const limitNum = parseFloat(limit)
    if (!trimmed) { setFormError('Enter a category.'); return }
    if (!limitNum || limitNum <= 0) { setFormError('Enter a valid dollar limit.'); return }
    if (goals.find(g => g.category.toLowerCase() === trimmed.toLowerCase())) {
      setFormError('A goal for that category already exists.'); return
    }
    const updated = [...goals, { id: crypto.randomUUID(), category: trimmed, limit: limitNum }]
    setGoals(updated)
    persist(updated)
    setCategory('')
    setLimit('')
    setFormError('')
  }

  function removeGoal(id) {
    const updated = goals.filter(g => g.id !== id)
    setGoals(updated)
    persist(updated)
  }

  const monthLabel = new Date().toLocaleString('default', { month: 'long', year: 'numeric' })

  return (
    <div className="dashboard-shell">
      <DashboardTopbar navAriaLabel="Goals" />

      <section className="dashboard-hero">
        <div className="dashboard-hero-copy">
          <h1 className="dashboard-title">Goals</h1>
          <p className="dashboard-subtitle">
            {goals.length === 0
              ? 'Set monthly spending caps and watch your habits in real time.'
              : loading
                ? 'Loading your progress...'
                : `${onTrack} of ${goals.length} goals on track in ${monthLabel}.`}
          </p>
        </div>
      </section>

      <section className="dashboard-overview-shell">
        <section className="goals-grid">

          {/* Goals list */}
          <div className="dashboard-card dashboard-panel goals-list-panel">
            <div className="dashboard-panel-header">
              <h2>{monthLabel}</h2>
              {goals.length > 0 && (
                <span>{onTrack}/{goals.length} on track</span>
              )}
            </div>

            {goals.length === 0 ? (
              <p className="dashboard-empty">No goals yet. Add one to get started.</p>
            ) : (
              <div className="goals-list">
                {goals.map(goal => {
                  const spent = monthlySpending[goal.category.toLowerCase()] || 0
                  const pct = Math.min((spent / goal.limit) * 100, 100)
                  const over = spent > goal.limit
                  const remaining = goal.limit - spent

                  return (
                    <div key={goal.id} className={`goals-card ${over ? 'is-over' : ''}`}>
                      <div className="goals-card-top">
                        <div>
                          <p className="goals-card-category">{goal.category}</p>
                          <p className="goals-card-meta">
                            ${spent.toFixed(0)} spent
                            {over
                              ? ` — $${Math.abs(remaining).toFixed(0)} over`
                              : ` — $${remaining.toFixed(0)} left`}
                          </p>
                        </div>
                        <div className="goals-card-right">
                          <span className={`goals-badge ${over ? 'is-over' : 'is-ok'}`}>
                            {over ? `Over by $${(spent - goal.limit).toFixed(0)}` : 'On track'}
                          </span>
                          <button
                            className="goals-delete"
                            onClick={() => removeGoal(goal.id)}
                            aria-label={`Remove ${goal.category} goal`}
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                      <div className="goals-bar-track">
                        <div className={`goals-bar-fill ${over ? 'is-over' : ''}`} style={{ width: `${pct}%` }} />
                      </div>
                      <p className="goals-card-limit">Limit: ${goal.limit.toFixed(0)} / mo</p>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Add goal */}
          <div className="dashboard-card dashboard-panel goals-form-panel">
            <div className="dashboard-panel-header">
              <h2>New Goal</h2>
            </div>

            <form className="goals-form" onSubmit={addGoal}>
              <label className="pacts-field">
                <span>Category</span>
                <input
                  className="pacts-input"
                  type="text"
                  value={category}
                  onChange={e => setCategory(e.target.value)}
                  placeholder="e.g. Dining Out, Shopping"
                />
              </label>
              <label className="pacts-field">
                <span>Monthly limit ($)</span>
                <input
                  className="pacts-input"
                  type="number"
                  min={1}
                  value={limit}
                  onChange={e => setLimit(e.target.value)}
                  placeholder="200"
                />
              </label>
              {formError && <p className="dashboard-error">{formError}</p>}
              <button type="submit" className="dashboard-button">Add Goal</button>
            </form>

            <p className="goals-hint">
              Goals track spending from your linked bank transactions and reset at the start of each month.
            </p>
          </div>

        </section>
      </section>
    </div>
  )
}
