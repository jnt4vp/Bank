import { useEffect, useMemo, useState } from 'react'
import { usePlaidLink } from 'react-plaid-link'
import {
  createLinkToken,
  exchangePublicToken,
} from './api'
import {
  PLAID_BROWSER_TAB_ERROR,
  isEmbeddedBrowserContext,
} from './browserContext'

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
  const [launchRequested, setLaunchRequested] = useState(false)
  const embeddedBrowser = isEmbeddedBrowserContext()

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
        setLaunchRequested(false)

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
      setLaunchRequested(false)
      if (err) {
        setError(err.display_message || err.error_message || 'Plaid was closed before completion.')
      }
    },
  }), [linkToken, onSuccess, token])

  const { open, ready } = usePlaidLink(plaidConfig)

  useEffect(() => {
    if (!launchRequested || embeddedBrowser || !linkToken || !ready) {
      return
    }

    setLaunchRequested(false)
    open()
  }, [embeddedBrowser, launchRequested, linkToken, open, ready])

  return (
    <div>
      <button
        type="button"
        className={className}
        onClick={async () => {
          if (embeddedBrowser) {
            setError(PLAID_BROWSER_TAB_ERROR)
            return
          }

          if (!linkToken) {
            try {
              setLoading(true)
              setError(null)
              setLaunchRequested(true)
              const data = await createLinkToken(token)
              setLinkToken(data.link_token)
            } catch (err) {
              setLaunchRequested(false)
              setError(err.message || 'Failed to initialize Plaid.')
            } finally {
              setLoading(false)
            }
            return
          }

          open()
        }}
        disabled={disabled || embeddedBrowser || loading || (!linkToken && !error) || (Boolean(linkToken) && !ready)}
      >
        {loading ? 'Connecting...' : children}
      </button>

      {embeddedBrowser ? (
        <p className="dashboard-error">{PLAID_BROWSER_TAB_ERROR}</p>
      ) : error ? (
        <p className="dashboard-error">{error}</p>
      ) : null}
    </div>
  )
}
