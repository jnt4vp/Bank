import { useCallback, useEffect, useState } from 'react'
import { usePlaidLink } from 'react-plaid-link'
import {
  createUpdateLinkToken,
  getPlaidItems,
  markPlaidItemReconnected,
  removePlaidItem,
  syncPlaidItem,
} from './api'

function formatSynced(value) {
  if (!value) return 'Never synced'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return 'Never synced'
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(parsed)
}

function ReauthButton({ item, token, onReauthComplete }) {
  const [linkToken, setLinkToken] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [launchRequested, setLaunchRequested] = useState(false)

  const onSuccess = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      await markPlaidItemReconnected({ itemId: item.id, token })
      await onReauthComplete()
    } catch (err) {
      setError(err?.message || 'Could not finish reconnect.')
    } finally {
      setLoading(false)
      setLinkToken(null)
    }
  }, [item.id, onReauthComplete, token])

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess,
    onExit: (err) => {
      setLaunchRequested(false)
      if (err) {
        setError(err.display_message || err.error_message || 'Reconnect was cancelled.')
      }
      setLinkToken(null)
    },
  })

  useEffect(() => {
    if (launchRequested && linkToken && ready) {
      setLaunchRequested(false)
      open()
    }
  }, [launchRequested, linkToken, open, ready])

  async function handleClick() {
    if (!token || loading) return
    setError('')
    setLoading(true)
    try {
      const { link_token } = await createUpdateLinkToken({ itemId: item.id, token })
      setLinkToken(link_token)
      setLaunchRequested(true)
    } catch (err) {
      setError(err?.message || 'Could not start reconnect.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        type="button"
        className="settings-primary-button"
        onClick={handleClick}
        disabled={loading}
      >
        {loading ? 'Starting…' : 'Reconnect'}
      </button>
      {error ? <p className="settings-inline-note is-error">{error}</p> : null}
    </>
  )
}

export default function PlaidItemsSection({ token }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [pendingAction, setPendingAction] = useState(null)
  const [removeCandidate, setRemoveCandidate] = useState(null)

  const refresh = useCallback(async () => {
    if (!token) {
      setItems([])
      setLoading(false)
      return
    }
    try {
      const data = await getPlaidItems(token)
      setItems(Array.isArray(data) ? data : [])
      setError('')
    } catch (err) {
      setError(err?.message || 'Could not load connected banks.')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function handleSync(item) {
    if (!token || pendingAction) return
    setPendingAction({ id: item.id, kind: 'sync' })
    setError('')
    try {
      await syncPlaidItem({ itemId: item.id, token })
      await refresh()
    } catch (err) {
      setError(err?.message || 'Sync failed.')
    } finally {
      setPendingAction(null)
    }
  }

  async function handleRemove() {
    const item = removeCandidate
    if (!token || !item?.id) return
    setRemoveCandidate(null)
    setPendingAction({ id: item.id, kind: 'remove' })
    setError('')
    try {
      await removePlaidItem({ itemId: item.id, token })
      await refresh()
    } catch (err) {
      setError(err?.message || 'Could not disconnect bank.')
    } finally {
      setPendingAction(null)
    }
  }

  if (loading) {
    return <p className="settings-support-lede">Loading connected banks…</p>
  }

  if (items.length === 0) {
    return (
      <p className="settings-support-lede">
        No banks connected yet. Connect one from your Dashboard to start syncing transactions.
      </p>
    )
  }

  return (
    <div className="settings-control-stack" style={{ paddingTop: 0 }}>
      {items.map((item) => {
        const isBusy = pendingAction?.id === item.id
        const label = item.institution_name || 'Connected bank'
        return (
          <div key={item.id} className="settings-partner-card">
            <div className="settings-row-copy">
              <h3 style={{ fontSize: '1.05rem' }}>{label}</h3>
              <p className="settings-support-lede" style={{ marginTop: '0.25rem' }}>
                Last synced: {formatSynced(item.last_synced_at)}
              </p>
              {item.needs_reauth ? (
                <span className="settings-partner-badge" style={{ background: '#fdecea', color: '#a33a2c' }}>
                  Needs re-authentication
                </span>
              ) : (
                <span className="settings-partner-badge">Connected</span>
              )}
            </div>
            <div className="settings-partner-actions" style={{ marginTop: '0.75rem' }}>
              {item.needs_reauth ? (
                <ReauthButton item={item} token={token} onReauthComplete={refresh} />
              ) : (
                <button
                  type="button"
                  className="settings-ghost-button"
                  disabled={Boolean(pendingAction)}
                  onClick={() => handleSync(item)}
                >
                  {isBusy && pendingAction?.kind === 'sync' ? 'Syncing…' : 'Sync now'}
                </button>
              )}
              <button
                type="button"
                className="settings-button-danger"
                disabled={Boolean(pendingAction)}
                onClick={() => setRemoveCandidate(item)}
              >
                {isBusy && pendingAction?.kind === 'remove' ? 'Removing…' : 'Disconnect'}
              </button>
            </div>
          </div>
        )
      })}

      {error ? <p className="settings-form-feedback is-error">{error}</p> : null}

      {removeCandidate ? (
        <div
          className="settings-modal-overlay"
          role="presentation"
          onClick={() => setRemoveCandidate(null)}
        >
          <div
            className="settings-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="plaid-remove-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="plaid-remove-title" className="settings-modal-title">
              Disconnect bank?
            </h3>
            <p className="settings-support-lede">
              Disconnect <strong>{removeCandidate.institution_name || 'this bank'}</strong>{' '}
              from PactBank. Transactions already synced will remain in your history,
              but future transactions won’t sync until you reconnect.
            </p>
            <div className="settings-form-actions" style={{ marginTop: '1rem' }}>
              <button
                type="button"
                className="settings-ghost-button"
                onClick={() => setRemoveCandidate(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="settings-button-danger"
                onClick={handleRemove}
              >
                Disconnect
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
