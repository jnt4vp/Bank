import { useEffect, useMemo, useState } from 'react'
import { usePlaidLink } from 'react-plaid-link'
import {
  createLinkToken,
  exchangePublicToken,
} from './api'

export default function PlaidConnectButton({
  token,
  disabled = false,
  onSuccess,
  className = 'dashboard-button',
  children = 'Connect with Plaid',
}) {
  const [linkToken, setLinkToken] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function loadLinkToken() {
      if (!token) return

      try {
        setLoading(true)
        setError(null)
        const data = await createLinkToken(token)

        if (!cancelled) {
          setLinkToken(data.link_token)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Failed to initialize Plaid.')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadLinkToken()

    return () => {
      cancelled = true
    }
  }, [token])

  const plaidConfig = useMemo(() => ({
    token: linkToken,
    onSuccess: async (publicToken, metadata) => {
      try {
        setLoading(true)
        setError(null)

        await exchangePublicToken({
          publicToken,
          institutionName: metadata?.institution?.name || null,
          token,
        })

        const next = await createLinkToken(token)
        setLinkToken(next.link_token)

        if (onSuccess) {
          await onSuccess()
        }
      } catch (err) {
        setError(err.message || 'Failed to connect bank account.')
      } finally {
        setLoading(false)
      }
    },
    onExit: (err) => {
      if (err) {
        setError(err.display_message || err.error_message || 'Plaid was closed before completion.')
      }
    },
  }), [linkToken, onSuccess, token])

  const { open, ready } = usePlaidLink(plaidConfig)

  return (
    <div>
      <button
        type="button"
        className={className}
        onClick={() => open()}
        disabled={disabled || !ready || !linkToken || loading}
      >
        {loading ? 'Connecting...' : children}
      </button>

      {error ? <p className="dashboard-error">{error}</p> : null}
    </div>
  )
}