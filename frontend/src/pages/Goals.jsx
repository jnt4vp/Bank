import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../features/auth/context'
import { fetchGoalSpendingBreakdown, localCalendarMonthBounds } from '../features/goals/api'
import { useTransactions } from '../features/transactions/useTransactions'
import DashboardTopbar from '../components/DashboardTopbar'
import '../dashboard.css'
import '../goals.css'

const GOALS_KEY = 'pactbank_goals'

function parseSignalLines(raw) {
  if (!raw || typeof raw !== 'string') return []
  return raw
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function normalizeStoredGoal(raw) {
  if (!raw || typeof raw !== 'object') return null
  const category = String(raw.category || '').trim()
  if (!category) return null
  const limit = Number(raw.limit)
  if (!Number.isFinite(limit) || limit <= 0) return null
  const arr = (v) => (Array.isArray(v) ? v.map(String).filter(Boolean) : [])
  return {
    id: raw.id || crypto.randomUUID(),
    category,
    limit,
    keywords: arr(raw.keywords),
    merchants: arr(raw.merchants),
    subcategories: arr(raw.subcategories),
  }
}

function loadGoals() {
  try {
    const parsed = JSON.parse(localStorage.getItem(GOALS_KEY) || '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.map(normalizeStoredGoal).filter(Boolean)
  } catch {
    return []
  }
}

function persist(goals) {
  localStorage.setItem(GOALS_KEY, JSON.stringify(goals))
}

function formatSignalSummary(goal) {
  const k = (goal.keywords || []).length
  const m = (goal.merchants || []).length
  const s = (goal.subcategories || []).length
  const parts = []
  if (k) parts.push(`${k} keyword${k === 1 ? '' : 's'}`)
  if (m) parts.push(`${m} merchant${m === 1 ? '' : 's'}`)
  if (s) parts.push(`${s} theme${s === 1 ? '' : 's'}`)
  return parts.length ? parts.join(' · ') : 'Name-only (add signals below for better matching)'
}

export default function Goals() {
  const { token } = useAuth()
  const { key: navigationKey } = useLocation()
  const { loading: txLoading } = useTransactions(token, navigationKey)
  const [goals, setGoals] = useState(loadGoals)
  const [category, setCategory] = useState('')
  const [limit, setLimit] = useState('')
  const [keywordsDraft, setKeywordsDraft] = useState('')
  const [merchantsDraft, setMerchantsDraft] = useState('')
  const [subcategoriesDraft, setSubcategoriesDraft] = useState('')
  const [formError, setFormError] = useState('')
  const [spentByGoal, setSpentByGoal] = useState({})
  const [attributionLoading, setAttributionLoading] = useState(false)
  const [attributionError, setAttributionError] = useState(null)
  const [attributionMeta, setAttributionMeta] = useState(null)

  const goalsSignature = useMemo(
    () =>
      JSON.stringify(
        goals.map((g) => ({
          id: g.id,
          category: g.category,
          limit: g.limit,
          keywords: g.keywords || [],
          merchants: g.merchants || [],
          subcategories: g.subcategories || [],
        }))
      ),
    [goals]
  )

  const hasGoalsToFetch = Boolean(token && goals.length > 0)
  const displaySpentByGoal = hasGoalsToFetch ? spentByGoal : {}
  const showAttributionError = hasGoalsToFetch ? attributionError : null
  const showAttributionMeta = hasGoalsToFetch ? attributionMeta : null
  const attributionLoadingUi = hasGoalsToFetch && attributionLoading

  useEffect(() => {
    if (!hasGoalsToFetch) {
      return undefined
    }

    let cancelled = false
    const { period_start, period_end } = localCalendarMonthBounds()
    const payload = {
      goals: goals.map((g) => ({
        category: g.category,
        keywords: g.keywords || [],
        merchants: g.merchants || [],
        subcategories: g.subcategories || [],
      })),
      period_start,
      period_end,
    }

    void (async () => {
      await Promise.resolve()
      if (cancelled) return
      setAttributionLoading(true)
      setAttributionError(null)
      try {
        const data = await fetchGoalSpendingBreakdown(token, payload)
        if (cancelled) return
        setSpentByGoal(data.spent_by_goal || {})
        setAttributionMeta({
          method: data.method,
          llm_assigned_count: data.llm_assigned_count ?? 0,
        })
      } catch (err) {
        if (cancelled) return
        setSpentByGoal({})
        setAttributionMeta(null)
        setAttributionError(err.message || 'Could not load goal spending.')
      } finally {
        if (!cancelled) setAttributionLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
    // goalsSignature tracks goal rows + signals (replaces listing `goals` in deps)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, goalsSignature, navigationKey, hasGoalsToFetch])

  const onTrack = goals.filter(
    (g) => (displaySpentByGoal[g.category.toLowerCase()] || 0) <= g.limit
  ).length

  function addGoal(e) {
    e.preventDefault()
    const trimmed = category.trim()
    const limitNum = parseFloat(limit)
    if (!trimmed) {
      setFormError('Enter a category name.')
      return
    }
    if (!limitNum || limitNum <= 0) {
      setFormError('Enter a valid dollar limit.')
      return
    }
    if (goals.find((g) => g.category.toLowerCase() === trimmed.toLowerCase())) {
      setFormError('A goal for that category already exists.')
      return
    }
    const updated = [
      ...goals,
      {
        id: crypto.randomUUID(),
        category: trimmed,
        limit: limitNum,
        keywords: parseSignalLines(keywordsDraft),
        merchants: parseSignalLines(merchantsDraft),
        subcategories: parseSignalLines(subcategoriesDraft),
      },
    ]
    setGoals(updated)
    persist(updated)
    setCategory('')
    setLimit('')
    setKeywordsDraft('')
    setMerchantsDraft('')
    setSubcategoriesDraft('')
    setFormError('')
  }

  function removeGoal(id) {
    const updated = goals.filter((g) => g.id !== id)
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
              ? 'Set monthly spending caps and tie each goal to keywords, merchants, or themes.'
              : txLoading || attributionLoadingUi
                ? 'Loading your progress...'
                : `${onTrack} of ${goals.length} goals on track in ${monthLabel}.`}
          </p>
        </div>
      </section>

      <section className="dashboard-overview-shell">
        <section className="goals-grid">
          <div className="dashboard-card dashboard-panel goals-list-panel">
            <div className="dashboard-panel-header">
              <h2>{monthLabel}</h2>
              {goals.length > 0 && <span>{onTrack}/{goals.length} on track</span>}
            </div>

            {goals.length === 0 ? (
              <p className="dashboard-empty">No goals yet. Add one to get started.</p>
            ) : (
              <div className="goals-list">
                {showAttributionError && (
                  <p className="dashboard-error" role="alert">
                    {showAttributionError}
                  </p>
                )}
                {goals.map((goal) => {
                  const spent = displaySpentByGoal[goal.category.toLowerCase()] || 0
                  const pct = Math.min((spent / goal.limit) * 100, 100)
                  const over = spent > goal.limit
                  const remaining = goal.limit - spent

                  return (
                    <div key={goal.id} className={`goals-card ${over ? 'is-over' : ''}`}>
                      <div className="goals-card-top">
                        <div>
                          <p className="goals-card-category">{goal.category}</p>
                          <p className="goals-card-signals">{formatSignalSummary(goal)}</p>
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
                            type="button"
                            className="goals-delete"
                            onClick={() => removeGoal(goal.id)}
                            aria-label={`Remove ${goal.category} goal`}
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                      <div className="goals-bar-track">
                        <div
                          className={`goals-bar-fill ${over ? 'is-over' : ''}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <p className="goals-card-limit">Limit: ${goal.limit.toFixed(0)} / mo</p>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="dashboard-card dashboard-panel goals-form-panel">
            <div className="dashboard-panel-header">
              <h2>New Goal</h2>
            </div>

            <form className="goals-form" onSubmit={addGoal}>
              <label className="pacts-field">
                <span>Category name</span>
                <input
                  className="pacts-input"
                  type="text"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="e.g. Fun, Coffee, Beauty"
                />
              </label>
              <label className="pacts-field">
                <span>Monthly limit ($)</span>
                <input
                  className="pacts-input"
                  type="number"
                  min={1}
                  value={limit}
                  onChange={(e) => setLimit(e.target.value)}
                  placeholder="200"
                />
              </label>

              <label className="pacts-field">
                <span>Keywords (optional)</span>
                <textarea
                  className="pacts-input goals-textarea"
                  value={keywordsDraft}
                  onChange={(e) => setKeywordsDraft(e.target.value)}
                  placeholder="Comma or line: ticketmaster, arcade, concert, steam"
                  rows={2}
                />
              </label>
              <label className="pacts-field">
                <span>Merchants (optional)</span>
                <textarea
                  className="pacts-input goals-textarea"
                  value={merchantsDraft}
                  onChange={(e) => setMerchantsDraft(e.target.value)}
                  placeholder="Substring match on merchant: dave and buster, amc, sephora"
                  rows={2}
                />
              </label>
              <label className="pacts-field">
                <span>Themes / subcategories (optional)</span>
                <textarea
                  className="pacts-input goals-textarea"
                  value={subcategoriesDraft}
                  onChange={(e) => setSubcategoriesDraft(e.target.value)}
                  placeholder={
                    'For abstract goals — match bank text & map AI labels.\n' +
                    'e.g. entertainment, shopping, gaming, nightlife'
                  }
                  rows={2}
                />
              </label>

              {formError && <p className="dashboard-error">{formError}</p>}
              <button type="submit" className="dashboard-button">
                Add Goal
              </button>
            </form>

            <p className="goals-hint">
              Rules run first (keywords, merchants, themes, then preset lists like fast food). If Ollama
              is enabled, we classify into broad themes (entertainment, shopping, …) and map them using
              your theme list, then use a second pass with full context for anything still unclear.
            </p>
            {showAttributionMeta?.method === 'rules+llm' &&
            showAttributionMeta.llm_assigned_count > 0 ? (
              <p className="goals-hint">
                AI matched {showAttributionMeta.llm_assigned_count} transaction
                {showAttributionMeta.llm_assigned_count === 1 ? '' : 's'} this month (Ollama).
              </p>
            ) : null}
          </div>
        </section>
      </section>
    </div>
  )
}
