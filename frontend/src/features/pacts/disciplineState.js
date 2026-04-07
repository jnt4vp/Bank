/**
 * Transactions on or after discipline_score_started_at count toward discipline score / theme.
 * When startedAt is null/undefined, the scoring window is not open yet — no rows count
 * (neutral sky / 100% until the first post-onboarding transaction).
 */
export function filterTransactionsForDisciplineWindow(transactions, startedAtIso) {
  if (!Array.isArray(transactions) || transactions.length === 0) return []
  if (!startedAtIso) return []
  const startMs = new Date(startedAtIso).getTime()
  if (Number.isNaN(startMs)) return transactions
  return transactions.filter((tx) => {
    const raw = tx.created_at
    if (!raw) return false
    const t = new Date(raw).getTime()
    return !Number.isNaN(t) && t >= startMs
  })
}

/** Same formula as backend `calculate_discipline_score`. Returns null when there is no activity yet. */
export function computeDisciplineScoreFromFlagged(totalCount, flaggedCount) {
  const total = Math.max(0, Math.floor(Number(totalCount) || 0))
  const flagged = Math.max(0, Math.floor(Number(flaggedCount) || 0))
  if (total <= 0) return null
  const ratio = Math.max(0, Math.min(1, flagged / total))
  return Math.max(0, Math.min(100, Math.round(100 - ratio * 100)))
}

/**
 * Score → full-motion dashboard themes (when sky is not forced).
 * Bands align with getDisciplineUiState:
 * 75–100 Strong | 50–74 Slipping | 25–49 At Risk | 0–24 Broken
 */
export function themeBackgroundKeyFromDisciplineScore(score) {
  if (score === null || score === undefined || Number.isNaN(Number(score))) return 'sky'
  const s = Math.max(0, Math.min(100, Number(score)))
  if (s < 25) return 'red'
  if (s < 50) return 'stormy'
  if (s < 75) return 'money'
  return 'sunny'
}

export function getDisciplineUiState(score) {
  const normalized = Math.max(0, Math.min(100, Number(score || 0)))

  if (normalized >= 75) {
    return {
      key: 'strong',
      label: 'Strong Discipline',
      tone: 'Clean streak: most tracked spending is respecting your pact rules.',
    }
  }
  if (normalized >= 50) {
    return {
      key: 'slipping',
      label: 'Stable but Slipping',
      tone: 'Still manageable—flagged purchases are a growing share of activity.',
    }
  }
  if (normalized >= 25) {
    return {
      key: 'risk',
      label: 'At Risk',
      tone: 'A large share of spending is hitting pact rules—tighten before the score drops further.',
    }
  }
  return {
    key: 'broken',
    label: 'Broken Discipline',
    tone: 'Flagged spending dominates your recent activity—reset with smaller, clearer limits.',
  }
}
