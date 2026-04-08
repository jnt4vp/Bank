import { useEffect, useState } from 'react'

import { apiRequest } from '../../lib/api/client'
import { normalizeTransactionsResponse, sortTransactionsByActivityDate } from './formatters'

/**
 * @param {string | null | undefined} token
 * @param {string | number | undefined} navigationKey - pass `useLocation().key` so each visit refetches
 */
export function useTransactions(token, navigationKey) {
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!token) {
      return undefined
    }

    let cancelled = false

    apiRequest('/api/transactions/', {
      token,
    })
      .then((data) => {
        if (cancelled) {
          return
        }

        setTransactions(sortTransactionsByActivityDate(normalizeTransactionsResponse(data)))
      })
      .catch((err) => {
        if (cancelled) {
          return
        }

        setError(err.message || 'Something went wrong.')
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [token, navigationKey])

  if (!token) {
    return { transactions: [], loading: false, error: null }
  }

  return { transactions, loading, error }
}
