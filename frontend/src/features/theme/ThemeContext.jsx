import { useEffect, useState } from 'react'
import { apiRequest } from '../../lib/api'
import {
  computeDisciplineScoreFromFlagged,
  filterTransactionsForDisciplineWindow,
  getDisciplineUiState,
  themeBackgroundKeyFromDisciplineScore,
} from '../pacts/disciplineState'

import { DEV_MODES } from './themeConstants'
import { ThemeContext } from './themeContextValue.js'

function useDisciplineTheme(token, userId, dashboardForceSky, disciplineScoreStartedAt) {
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
        const transactions = Array.isArray(txData)
          ? txData
          : Array.isArray(txData?.results)
            ? txData.results
            : []

        const windowed = filterTransactionsForDisciplineWindow(
          transactions,
          disciplineScoreStartedAt
        )
        const flaggedCount = windowed.filter((tx) => tx.flagged).length
        const score = computeDisciplineScoreFromFlagged(windowed.length, flaggedCount)
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
  }, [token, userId, dashboardForceSky, disciplineScoreStartedAt])

  return { bg, disciplineTierKey }
}

export function ThemeProvider({
  token,
  userId,
  dashboardForceSky = false,
  disciplineScoreStartedAt,
  children,
}) {
  const { bg: realBg, disciplineTierKey } = useDisciplineTheme(
    token,
    userId,
    dashboardForceSky,
    disciplineScoreStartedAt
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
