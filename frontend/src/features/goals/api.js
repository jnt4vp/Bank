import { apiRequest } from '../../lib/api/client'

/**
 * @param {string} token
 * @param {{
 *   goals: Array<{ category: string, keywords?: string[], merchants?: string[], subcategories?: string[] }>,
 *   period_start: string,
 *   period_end: string,
 *   goal_categories?: string[],
 * }} body
 */
export function fetchGoalSpendingBreakdown(token, body) {
  return apiRequest('/api/goals/spending-breakdown', {
    method: 'POST',
    token,
    body,
  })
}

/** Local calendar month bounds as YYYY-MM-DD (browser local timezone). */
export function localCalendarMonthBounds(date = new Date()) {
  const y = date.getFullYear()
  const m = date.getMonth()
  const pad = (n) => String(n).padStart(2, '0')
  const period_start = `${y}-${pad(m + 1)}-01`
  const lastDay = new Date(y, m + 1, 0).getDate()
  const period_end = `${y}-${pad(m + 1)}-${pad(lastDay)}`
  return { period_start, period_end }
}
