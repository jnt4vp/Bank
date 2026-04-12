import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../features/auth/context'
import { fetchGoalSpendingBreakdown, localCalendarMonthBounds } from '../features/goals/api'
import { TRANSACTIONS_UPDATED_EVENT } from '../lib/transactionsEvents'
import { formatTransactionAmount } from '../features/transactions/formatters'
import DashboardTopbar from '../components/DashboardTopbar'
import '../dashboard.css'
import '../goals.css'

const GOALS_KEY = 'pactbank_goals'

function normalizeStoredGoal(raw) {
  if (!raw || typeof raw !== 'object') return null
  const category = String(raw.category || '').trim()
  if (!category) return null
  const limit = parseFloat(raw.limit)
  if (!Number.isFinite(limit) || limit <= 0) return null
  return {
    id: raw.id || crypto.randomUUID(),
    category,
    limit,
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

/** Case-insensitive lookup — API keys are lowercase goal names. */
function spentForGoal(spentByGoal, category) {
  const want = String(category || '').toLowerCase().trim()
  if (!want) return 0
  const map = spentByGoal && typeof spentByGoal === 'object' ? spentByGoal : {}
  let n = 0
  if (Object.prototype.hasOwnProperty.call(map, want)) {
    n = Number(map[want])
  } else {
    for (const [k, v] of Object.entries(map)) {
      if (String(k).toLowerCase().trim() === want) {
        n = Number(v)
        break
      }
    }
  }
  if (!Number.isFinite(n)) return 0
  return Math.max(0, n)
}

function goalSpendZone(spent, limit) {
  const lim = Number(limit) || 0
  if (lim <= 0) return 'good'
  const ratio = spent / lim
  if (ratio > 1) return 'over'
  if (ratio >= 0.8) return 'warn'
  return 'good'
}

function goalToApiPayload(g) {
  return {
    category: g.category,
    keywords: [],
    merchants: [],
    subcategories: [],
  }
}

export default function Goals() {
  const { token } = useAuth()
  const { key: navigationKey } = useLocation()
  const [goals, setGoals] = useState(loadGoals)
  const [goalName, setGoalName] = useState('')
  const [monthlyLimit, setMonthlyLimit] = useState('')
  const [formError, setFormError] = useState('')
  const [spentByGoal, setSpentByGoal] = useState({})
  const [attributionLoading, setAttributionLoading] = useState(false)
  const [attributionError, setAttributionError] = useState(null)
  const [attributionMeta, setAttributionMeta] = useState(null)

  /** Only goal names drive attribution; changing limits does not refetch or re-run Ollama. */
  const goalsAttributionSignature = useMemo(
    () =>
      JSON.stringify(
        goals.map((g) => ({
          category: g.category,
        }))
      ),
    [goals]
  )

  const hasGoalsToFetch = Boolean(token && goals.length > 0)
  const displaySpentByGoal = hasGoalsToFetch ? spentByGoal : {}
  const showAttributionError = hasGoalsToFetch ? attributionError : null
  const showAttributionMeta = hasGoalsToFetch ? attributionMeta : null
  const attributionLoadingUi = hasGoalsToFetch && attributionLoading

  const goalsRef = useRef(goals)
  goalsRef.current = goals

  const attributionRequestIdRef = useRef(0)

  const loadGoalSpending = useCallback(
    async (opts = {}) => {
      const silent = opts.silent === true
      const g = goalsRef.current
      if (!token || g.length === 0) return

      const requestId = ++attributionRequestIdRef.current
      if (!silent) {
        setAttributionLoading(true)
        setAttributionError(null)
      }

      const { period_start, period_end } = localCalendarMonthBounds()
      const payload = {
        goals: g.map(goalToApiPayload),
        period_start,
        period_end,
      }

      try {
        const data = await fetchGoalSpendingBreakdown(token, payload)
        if (requestId !== attributionRequestIdRef.current) return
        const raw = data?.spent_by_goal
        const normalized = {}
        if (raw && typeof raw === 'object') {
          for (const [k, v] of Object.entries(raw)) {
            const key = String(k).toLowerCase().trim()
            const n = Number(v)
            if (!key || !Number.isFinite(n)) continue
            normalized[key] = (normalized[key] || 0) + n
          }
        }
        setSpentByGoal(normalized)
        setAttributionMeta({
          method: data?.method,
          llm_assigned_count: data?.llm_assigned_count ?? 0,
        })
      } catch (err) {
        if (requestId !== attributionRequestIdRef.current) return
        if (!silent) {
          setSpentByGoal({})
          setAttributionMeta(null)
          setAttributionError(err?.message || 'Could not load goal spending.')
        }
      } finally {
        if (requestId === attributionRequestIdRef.current && !silent) {
          setAttributionLoading(false)
        }
      }
    },
    [token]
  )

  useEffect(() => {
    if (!hasGoalsToFetch) return undefined
    void loadGoalSpending({ silent: false })
    return undefined
  }, [hasGoalsToFetch, goalsAttributionSignature, navigationKey, loadGoalSpending])

  useEffect(() => {
    if (!hasGoalsToFetch) return undefined

    function refetchWhenFresh() {
      void loadGoalSpending({ silent: true })
    }

    function onVisible() {
      if (document.visibilityState === 'visible') {
        refetchWhenFresh()
      }
    }

    window.addEventListener(TRANSACTIONS_UPDATED_EVENT, refetchWhenFresh)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener(TRANSACTIONS_UPDATED_EVENT, refetchWhenFresh)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [hasGoalsToFetch, loadGoalSpending])

  const onTrack = goals.filter((g) => {
    const spent = spentForGoal(displaySpentByGoal, g.category)
    return goalSpendZone(spent, g.limit) !== 'over'
  }).length

  function addGoal(e) {
    e.preventDefault()
    const trimmed = goalName.trim()
    const limitNum = parseFloat(monthlyLimit)
    if (!trimmed) {
      setFormError('Enter a goal name.')
      return
    }
    if (!Number.isFinite(limitNum) || limitNum <= 0) {
      setFormError('Enter a valid monthly limit.')
      return
    }
    if (goals.some((g) => g.category.toLowerCase() === trimmed.toLowerCase())) {
      setFormError('You already have a goal with that name.')
      return
    }
    const updated = [
      ...goals,
      {
        id: crypto.randomUUID(),
        category: trimmed,
        limit: limitNum,
      },
    ]
    setGoals(updated)
    persist(updated)
    setGoalName('')
    setMonthlyLimit('')
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
              ? 'Name what you want to cap and set a monthly dollar limit. We match spending from your linked accounts.'
              : attributionLoadingUi
                ? 'Loading your progress…'
                : `${onTrack} of ${goals.length} on track in ${monthLabel}.`}
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
              <p className="dashboard-empty">No goals yet. Add one on the right.</p>
            ) : (
              <div className="goals-list">
                {showAttributionError && (
                  <p className="dashboard-error" role="alert">
                    {showAttributionError}
                  </p>
                )}
                {goals.map((goal) => {
                  const spent = spentForGoal(displaySpentByGoal, goal.category)
                  const limit = Number(goal.limit) || 0
                  const ratio = limit > 0 ? spent / limit : 0
                  const pctDisplay = Math.min(ratio * 100, 100)
                  const zone = goalSpendZone(spent, limit)
                  const over = zone === 'over'
                  const remaining = limit - spent

                  const badgeLabel =
                    zone === 'over'
                      ? `Over by ${formatTransactionAmount(Math.max(0, spent - limit))}`
                      : zone === 'warn'
                        ? 'Close to limit'
                        : 'On track'

                  return (
                    <div
                      key={goal.id}
                      className={`goals-card goals-card--zone-${zone}`}
                    >
                      <div className="goals-card-top">
                        <div>
                          <p className="goals-card-category">{goal.category}</p>
                          <p className="goals-card-meta">
                            <strong>{formatTransactionAmount(spent)}</strong> spent this month
                            {over
                              ? ` — ${formatTransactionAmount(Math.abs(remaining))} over limit`
                              : ` — ${formatTransactionAmount(Math.max(0, remaining))} left`}
                          </p>
                        </div>
                        <div className="goals-card-right">
                          <span className={`goals-badge goals-badge--${zone}`}>
                            {badgeLabel}
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
                      <div
                        className={`goals-bar-track goals-bar-track--${zone}`}
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={Math.round(Math.min(ratio * 100, 100))}
                        aria-valuetext={
                          zone === 'over'
                            ? `${Math.round(ratio * 100)}% of limit, over budget`
                            : `${Math.round(ratio * 100)}% of monthly limit used`
                        }
                        aria-label={`${goal.category}: ${zone === 'good' ? 'on track' : zone === 'warn' ? 'close to limit' : 'over limit'}`}
                      >
                        <div
                          className={`goals-bar-fill goals-bar-fill--${zone}`}
                          style={{ width: `${pctDisplay}%` }}
                        />
                      </div>
                      <p className="goals-card-limit">
                        Limit: {formatTransactionAmount(limit)} / mo
                      </p>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="dashboard-card dashboard-panel goals-form-panel">
            <div className="dashboard-panel-header">
              <h2>Add goal</h2>
            </div>

            <form className="goals-form" onSubmit={addGoal}>
              <label className="pacts-field">
                <span>Goal</span>
                <input
                  className="pacts-input"
                  type="text"
                  value={goalName}
                  onChange={(e) => setGoalName(e.target.value)}
                  placeholder="e.g. Coffee, Dining out"
                  autoComplete="off"
                />
              </label>
              <label className="pacts-field">
                <span>Monthly limit ($)</span>
                <input
                  className="pacts-input"
                  type="number"
                  min={0.01}
                  step="0.01"
                  inputMode="decimal"
                  value={monthlyLimit}
                  onChange={(e) => setMonthlyLimit(e.target.value)}
                  placeholder="200"
                />
              </label>

              {formError && <p className="dashboard-error">{formError}</p>}
              <button type="submit" className="dashboard-button">
                Save goal
              </button>
            </form>

            <p className="goals-hint goals-hint--short">
              Totals use transactions in the current calendar month.
              {showAttributionMeta?.method === 'rules+llm' &&
              showAttributionMeta.llm_assigned_count > 0
                ? ` AI helped match ${showAttributionMeta.llm_assigned_count} transaction${showAttributionMeta.llm_assigned_count === 1 ? '' : 's'}.`
                : null}
            </p>
          </div>
        </section>
      </section>
    </div>
  )
}
