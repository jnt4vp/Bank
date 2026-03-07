import { useEffect, useState } from 'react'

import { fetchCounterValue, incrementCounterValue } from './api'

export function useCounter() {
  const [count, setCount] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let isActive = true

    async function loadCounter() {
      try {
        const data = await fetchCounterValue()
        if (!isActive) {
          return
        }

        setCount(data.value)
        setError(null)
      } catch (err) {
        if (!isActive) {
          return
        }

        setError(err.message)
      }
    }

    loadCounter()

    return () => {
      isActive = false
    }
  }, [])

  async function increment() {
    setLoading(true)

    try {
      const data = await incrementCounterValue()
      setCount(data.value)
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return {
    count,
    error,
    loading,
    increment,
  }
}
