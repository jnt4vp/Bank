import { useEffect, useState } from 'react'

import { apiRequest } from '../../lib/api/client'
import { sortTransactionsByActivityDate } from './formatters'

function normalizeTransactions(data) {
  if (Array.isArray(data)) {
    return data
  }

  return Array.isArray(data?.results) ? data.results : []
}

export function useTransactions(token) {
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

        setTransactions(sortTransactionsByActivityDate(normalizeTransactions(data)))
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
  }, [token])

  if (!token) {
    return { transactions: [], loading: false, error: null }
  }

  return { transactions, loading, error }
}
