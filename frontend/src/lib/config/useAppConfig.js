import { useEffect, useState } from 'react'
import { apiRequest } from '../api/client'

const DEFAULT_CONFIG = {
  plaid_env: 'sandbox',
  simulated_transfers_enabled: true,
  app_version: null,
}

let cachedConfig = null
let inflight = null

async function loadAppConfig() {
  if (cachedConfig) return cachedConfig
  if (!inflight) {
    inflight = apiRequest('/api/config')
      .then((data) => {
        cachedConfig = { ...DEFAULT_CONFIG, ...(data || {}) }
        return cachedConfig
      })
      .catch(() => {
        cachedConfig = { ...DEFAULT_CONFIG }
        return cachedConfig
      })
      .finally(() => {
        inflight = null
      })
  }
  return inflight
}

export function useAppConfig() {
  const [config, setConfig] = useState(cachedConfig || DEFAULT_CONFIG)
  const [ready, setReady] = useState(Boolean(cachedConfig))

  useEffect(() => {
    let cancelled = false
    loadAppConfig().then((value) => {
      if (!cancelled) {
        setConfig(value)
        setReady(true)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  return { config, ready, isSandbox: config.plaid_env === 'sandbox' }
}
