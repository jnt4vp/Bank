import { useEffect, useState } from 'react'
import { apiRequest } from '../../lib/api'
import { normalizeTransactionsResponse } from '../transactions/formatters'
import {
  computeDisciplineScoreFromFlagged,
  filterTransactionsForDisciplineWindow,
  getDisciplineUiState,
  themeBackgroundKeyFromDisciplineScore,
} from '../pacts/disciplineState'

import { DEV_MODES } from './themeConstants'
import { ThemeContext } from './themeContextValue.js'

function useDisciplineTheme(
  token,
  userId,
  dashboardForceSky,
  disciplineScoreStartedAt,
  apiDisciplineScore
) {
  const [bg, setBg] = useState('sky')
  const [disciplineTierKey, setDisciplineTierKey] = useState(null)

  useEffect(() => {
    if (!token || !userId) {
      queueMicrotask(() => {
        setBg('sky')
        setDisciplineTierKey(null)
      })
      return
    }

    apiRequest('/api/transactions/', { token })
      .then((txData) => {
        const transactions = normalizeTransactionsResponse(txData)

        const windowed = filterTransactionsForDisciplineWindow(
          transactions,
          disciplineScoreStartedAt
        )
        const flaggedCount = windowed.filter((tx) => tx.flagged).length
        const computed = computeDisciplineScoreFromFlagged(windowed.length, flaggedCount)
        const score =
          apiDisciplineScore !== undefined &&
          apiDisciplineScore !== null &&
          !Number.isNaN(Number(apiDisciplineScore))
            ? Math.max(0, Math.min(100, Math.round(Number(apiDisciplineScore))))
            : computed
        const tier = score === null ? null : getDisciplineUiState(score).key
        setDisciplineTierKey(tier)
        if (dashboardForceSky) {
          setBg('sky')
        } else {
          setBg(themeBackgroundKeyFromDisciplineScore(score))
        }
      })
      .catch(() => {
        setBg('sky')
        setDisciplineTierKey(null)
      })
  }, [token, userId, dashboardForceSky, disciplineScoreStartedAt, apiDisciplineScore])

  return { bg, disciplineTierKey }
}

export function ThemeProvider({
  token,
  userId,
  dashboardForceSky = false,
  disciplineScoreStartedAt,
  disciplineScore: apiDisciplineScore,
  children,
}) {
  const { bg: realBg, disciplineTierKey } = useDisciplineTheme(
    token,
    userId,
    dashboardForceSky,
    disciplineScoreStartedAt,
    apiDisciplineScore
  )
  const [devOverride, setDevOverride] = useState(null)
  const bg = devOverride ?? realBg

  return (
    <ThemeContext.Provider
      value={{ bg, disciplineTierKey, devOverride, setDevOverride, DEV_MODES }}
    >
      {children}
    </ThemeContext.Provider>
  )
}
