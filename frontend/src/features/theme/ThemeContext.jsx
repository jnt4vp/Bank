import { useEffect, useState } from 'react'
import { apiRequest } from '../../lib/api'

import { DEV_MODES } from './themeConstants'
import { ThemeContext } from './themeContextValue.js'

function usePactBackground(token, userId) {
  const [bg, setBg] = useState('sky')

  useEffect(() => {
    if (!token || !userId) return

    Promise.all([
      apiRequest('/api/transactions/', { token }),
      apiRequest(`/api/pacts/user/${userId}`, { token }),
    ])
      .then(([txData, pactsData]) => {
        const transactions = Array.isArray(txData)
          ? txData
          : Array.isArray(txData?.results)
            ? txData.results
            : []

        const pacts = Array.isArray(pactsData)
          ? pactsData
          : Array.isArray(pactsData?.pacts)
            ? pactsData.pacts
            : Array.isArray(pactsData?.results)
              ? pactsData.results
              : []

        const flaggedCount = transactions.filter((tx) => tx.flagged).length
        const activePacts = pacts.filter(
          (p) => String(p.status || 'active').toLowerCase() === 'active'
        )

        if (flaggedCount >= 2) setBg('red')
        else if (flaggedCount === 1) setBg('stormy')
        else if (activePacts.length >= 2) setBg('sunny')
        else if (activePacts.length === 1) setBg('money')
        else setBg('sky')
      })
      .catch(() => setBg('sky'))
  }, [token, userId])

  return bg
}

export function ThemeProvider({ token, userId, children }) {
  const realBg = usePactBackground(token, userId)
  const [devOverride, setDevOverride] = useState(null)
  const bg = devOverride ?? realBg

  return (
    <ThemeContext.Provider value={{ bg, devOverride, setDevOverride, DEV_MODES }}>
      {children}
    </ThemeContext.Provider>
  )
}
