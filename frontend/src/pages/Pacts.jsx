import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../features/auth/context'
import { apiRequest } from '../lib/api'
import {
  getAccountabilitySettings,
  saveAccountabilitySettings,
} from '../features/accountability/api'
import DashboardTopbar from '../components/DashboardTopbar'
import '../dashboard.css'
import '../pacts.css'

const PRESET_OPTIONS = [
  'Coffee Shops',
  'Dining Out',
  'Fast Food',
  'Online Shopping',
  'Ride Services',
  'Alcohol',
  'Subscriptions',
  'TikTok Shop',
]

const ACCOUNTABILITY_TYPES = [
  { value: 'email', label: 'Email me' },
  { value: 'friend', label: 'Accountability partner' },
]

const AUTO_LOCK_DELAY_MS = 5 * 60 * 1000

function normalizeCategory(category) {
  if (!category) return 'Other'
  return String(category)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function formatAccountabilityType(type) {
  switch (type) {
    case 'email':
      return 'Email me'
    case 'friend':
      return 'Accountability partner'
    default:
      return type || '—'
  }
}

export default function Pacts() {
  const { user, token } = useAuth()
  const firstName = user?.name?.split(' ')[0] || 'there'

  const [pacts, setPacts] = useState([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [editingPactId, setEditingPactId] = useState(null)
  const [editingValues, setEditingValues] = useState({})
  const [expandedPactId, setExpandedPactId] = useState(null)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState('')
  const [now, setNow] = useState(new Date())

  const [selectedPreset, setSelectedPreset] = useState('')
  const [customCategory, setCustomCategory] = useState('')
  const [lockDays, setLockDays] = useState(0)
  const [newAccountabilityType, setNewAccountabilityType] = useState('email')
  const [newDisciplineSavingsPercentage, setNewDisciplineSavingsPercentage] = useState(0)
  const [newAccountabilityNote, setNewAccountabilityNote] = useState('')

  const [settingsFormState, setSettingsFormState] = useState({})
  const [settingsLoading, setSettingsLoading] = useState({})
  const [settingsSaving, setSettingsSaving] = useState({})
  const [settingsError, setSettingsError] = useState({})

  const getLockDays = (lockedUntil) => {
    if (!lockedUntil) return 0
    const ms = new Date(lockedUntil).getTime() - Date.now()
    if (ms <= 0) return 0
    return Math.ceil(ms / (1000 * 60 * 60 * 24))
  }

  const formatRemaining = (ms) => {
    if (ms <= 0) return 'Expired'

    const totalSeconds = Math.floor(ms / 1000)
    const days = Math.floor(totalSeconds / 86400)
    const hours = Math.floor((totalSeconds % 86400) / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = totalSeconds % 60

    const parts = []
    if (days) parts.push(`${days}d`)
    if (hours) parts.push(`${hours}h`)
    if (minutes) parts.push(`${minutes}m`)
    if (seconds && !days) parts.push(`${seconds}s`)

    return parts.join(' ') || '0s'
  }

  const normalizePacts = (rawPacts) =>
    rawPacts
      .map((pact) => ({
        id: pact.id,
        user_id: pact.user_id,
        preset_category: pact.preset_category || null,
        custom_category: pact.custom_category || null,
        category:
          pact.category || pact.custom_category || pact.preset_category || 'Uncategorized',
        status: pact.status || 'active',
        locked_until: pact.locked_until ? new Date(pact.locked_until) : null,
        created_at: pact.created_at || null,
      }))
      .sort((a, b) => String(a.category).localeCompare(String(b.category)))

  const startEditingPact = (pact) => {
    const pactLockDays = getLockDays(pact.locked_until)

    setExpandedPactId(null)
    setEditingPactId(pact.id)
    setEditingValues({
      preset_category: pact.preset_category || '',
      custom_category: pact.custom_category || '',
      lockDays: pactLockDays,
    })
  }

  const cancelEditing = () => {
    setEditingPactId(null)
    setEditingValues({})
  }

  const updateFormState = (pactId, updates) => {
    setSettingsFormState((prev) => ({
      ...prev,
      [pactId]: {
        ...(prev[pactId] || {
          accountability_type: 'email',
          discipline_savings_percentage: 0,
          accountability_note: '',
        }),
        ...updates,
      },
    }))
  }

  const loadAccountabilitySettings = useCallback(
    async (pactId) => {
      if (!token) return

      setSettingsLoading((prev) => ({ ...prev, [pactId]: true }))
      setSettingsError((prev) => ({ ...prev, [pactId]: null }))

      try {
        const settings = await getAccountabilitySettings(pactId, token)

        setSettingsFormState((prev) => ({
          ...prev,
          [pactId]: {
            accountability_type: settings.accountability_type || 'email',
            discipline_savings_percentage: settings.discipline_savings_percentage || 0,
            accountability_note: settings.accountability_note || '',
          },
        }))
      } catch (err) {
        if (err?.status === 404) {
          setSettingsFormState((prev) => ({
            ...prev,
            [pactId]: {
              accountability_type: 'email',
              discipline_savings_percentage: 0,
              accountability_note: '',
            },
          }))
        } else {
          setSettingsError((prev) => ({
            ...prev,
            [pactId]: err?.message || 'Failed to load settings.',
          }))
        }
      } finally {
        setSettingsLoading((prev) => ({ ...prev, [pactId]: false }))
      }
    },
    [token]
  )

  const loadPacts = useCallback(async () => {
    if (!token || !user?.id) {
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setError(null)

      const pactsData = await apiRequest(`/api/pacts/user/${user.id}`, { token })

      const rawPacts = Array.isArray(pactsData)
        ? pactsData
        : Array.isArray(pactsData?.results)
          ? pactsData.results
          : Array.isArray(pactsData?.pacts)
            ? pactsData.pacts
            : []

      const normalizedPacts = normalizePacts(rawPacts)
      setPacts(normalizedPacts)

      await Promise.all(normalizedPacts.map((pact) => loadAccountabilitySettings(pact.id)))
    } catch (err) {
      setError(err?.message || 'Failed to load pacts.')
    } finally {
      setLoading(false)
    }
  }, [loadAccountabilitySettings, token, user?.id])

  useEffect(() => {
    loadPacts()
  }, [loadPacts])

  const lockPact = useCallback(
    async (pact) => {
      if (!token || !pact?.id) return

      const lockedUntil = pact.locked_until ? new Date(pact.locked_until) : null
      if (lockedUntil && lockedUntil > new Date()) return

      const newLockedUntil = new Date(Date.now() + AUTO_LOCK_DELAY_MS).toISOString()

      try {
        await apiRequest(`/api/pacts/${pact.id}`, {
          method: 'PUT',
          token,
          body: { locked_until: newLockedUntil },
        })
        await loadPacts()
      } catch (err) {
        console.warn('Failed to lock pact', err)
      }
    },
    [token, loadPacts]
  )

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const activePacts = useMemo(
    () => pacts.filter((pact) => String(pact.status).toLowerCase() === 'active'),
    [pacts]
  )

  const presetPactCount = useMemo(
    () => pacts.filter((pact) => pact.preset_category).length,
    [pacts]
  )

  const customPactCount = useMemo(
    () => pacts.filter((pact) => pact.custom_category).length,
    [pacts]
  )

  async function handleCreatePact(event) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    setSuccess('')

    const trimmedCustom = customCategory.trim()

    try {
      if (!selectedPreset && !trimmedCustom) {
        throw new Error('Choose a preset pact or enter a custom pact.')
      }

      if (selectedPreset && trimmedCustom) {
        throw new Error('Add one pact at a time. Use either preset or custom.')
      }

      const lockDaysInt = Number(lockDays) || 0
      const locked_until =
        lockDaysInt > 0
          ? new Date(Date.now() + lockDaysInt * 24 * 60 * 60 * 1000).toISOString()
          : null

      const pactBody = {
        preset_category: selectedPreset || null,
        custom_category: trimmedCustom || null,
        status: 'active',
        locked_until,
      }

      const createdPact = await apiRequest('/api/pacts', {
        method: 'POST',
        token,
        body: pactBody,
      })

      const createdPactId = createdPact?.id || createdPact?.pact?.id

      if (createdPactId) {
        await saveAccountabilitySettings(
          {
            pact_id: createdPactId,
            accountability_type: newAccountabilityType,
            discipline_savings_percentage: Number(newDisciplineSavingsPercentage) || 0,
            accountability_note: newAccountabilityNote.trim() || null,
          },
          token
        )
      }

      setSelectedPreset('')
      setCustomCategory('')
      setLockDays(0)
      setNewAccountabilityType('email')
      setNewDisciplineSavingsPercentage(0)
      setNewAccountabilityNote('')
      setSuccess('Pact added.')
      await loadPacts()
    } catch (err) {
      setError(err?.message || 'Failed to create pact.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDeletePact(pactId, isLocked) {
    if (isLocked) return

    try {
      setDeletingId(pactId)
      setError(null)
      setSuccess('')

      await apiRequest(`/api/pacts/${pactId}`, {
        method: 'DELETE',
        token,
      })

      setPacts((prev) => prev.filter((p) => p.id !== pactId))
      setSettingsFormState((prev) => {
        const next = { ...prev }
        delete next[pactId]
        return next
      })
      setSettingsLoading((prev) => {
        const next = { ...prev }
        delete next[pactId]
        return next
      })
      setSettingsSaving((prev) => {
        const next = { ...prev }
        delete next[pactId]
        return next
      })
      setSettingsError((prev) => {
        const next = { ...prev }
        delete next[pactId]
        return next
      })

      if (expandedPactId === pactId) {
        setExpandedPactId(null)
      }
      if (editingPactId === pactId) {
        cancelEditing()
      }

      setSuccess('Pact deleted.')
    } catch (err) {
      setError(err?.message || 'Failed to delete pact.')
    } finally {
      setDeletingId(null)
    }
  }

  const handleSavePact = async (pact) => {
    setError(null)
    setSuccess('')

    const lockDaysInt = Number(editingValues.lockDays) || 0
    const locked_until =
      lockDaysInt > 0
        ? new Date(Date.now() + lockDaysInt * 24 * 60 * 60 * 1000).toISOString()
        : null

    const payload = { locked_until }

    if (pact.preset_category) {
      payload.preset_category = editingValues.preset_category || pact.preset_category
    } else {
      payload.custom_category = editingValues.custom_category || pact.custom_category
    }

    try {
      await apiRequest(`/api/pacts/${pact.id}`, {
        method: 'PUT',
        token,
        body: payload,
      })

      cancelEditing()
      await loadPacts()
      setSuccess('Pact updated.')
    } catch (err) {
      setError(err?.message || 'Failed to update pact.')
    }
  }

  const handleSaveSettings = async (pactId) => {
    const formState = settingsFormState[pactId]
    if (!formState) return

    setSettingsSaving((prev) => ({ ...prev, [pactId]: true }))
    setSettingsError((prev) => ({ ...prev, [pactId]: null }))

    try {
      const payload = {
        pact_id: pactId,
        accountability_type: formState.accountability_type,
        discipline_savings_percentage: Number(formState.discipline_savings_percentage) || 0,
        accountability_note: formState.accountability_note?.trim() || null,
      }

      const updated = await saveAccountabilitySettings(payload, token)

      setSettingsFormState((prev) => ({
        ...prev,
        [pactId]: {
          accountability_type: updated.accountability_type || 'email',
          discipline_savings_percentage: updated.discipline_savings_percentage || 0,
          accountability_note: updated.accountability_note || '',
        },
      }))

      setExpandedPactId(null)
      setSuccess('Settings saved.')

      const pact = pacts.find((p) => p.id === pactId)
      if (pact) {
        await lockPact(pact)
      }
    } catch (err) {
      setSettingsError((prev) => ({
        ...prev,
        [pactId]: err?.message || 'Failed to save settings.',
      }))
    } finally {
      setSettingsSaving((prev) => ({ ...prev, [pactId]: false }))
    }
  }

  return (
    <div className="dashboard-shell">
      <DashboardTopbar navAriaLabel="Dashboard" />

      <section className="dashboard-hero">
        <div className="dashboard-hero-copy">
          <h1 className="dashboard-title">
            Manage your pacts, {firstName} </h1>
          <p className="dashboard-subtitle">
            Add, organize, and remove accountability rules that shape how your spending is tracked.
          </p>
        </div>

        <div className="dashboard-hero-actions">
          <div className="dashboard-pill">
            {loading ? 'Loading pacts...' : `${activePacts.length} Active Pacts`}
          </div>
          <Link className="dashboard-pill dashboard-pill-action" to="/dashboard">
            Back to Dashboard →
          </Link>
        </div>
      </section>

      <section className="dashboard-overview-shell">
        <section className="dashboard-top-grid">
          <div className="dashboard-card">
            <p className="dashboard-card-label">Total Pacts</p>
            <p className="dashboard-stat">{pacts.length}</p>
          </div>

          <div className="dashboard-card">
            <p className="dashboard-card-label">Preset Pacts</p>
            <p className="dashboard-stat">{presetPactCount}</p>
          </div>

          <div className="dashboard-card">
            <p className="dashboard-card-label">Custom Pacts</p>
            <p className="dashboard-stat">{customPactCount}</p>
          </div>

          <div className="dashboard-card dashboard-card-hero-accent">
            <p className="dashboard-card-label">Status</p>
            <p className="dashboard-stat">
              {activePacts.length === pacts.length ? 'Stable' : 'Mixed'}
            </p>
          </div>
        </section>

        <section className="pacts-grid">
          <div className="dashboard-card dashboard-panel pacts-form-panel">
            <div className="dashboard-panel-header">
              <h2>Add New Pact</h2>
            </div>

            <form className="pacts-form" onSubmit={handleCreatePact}>
              <label className="pacts-field">
                <span>Preset category</span>
                <select
                  value={selectedPreset}
                  onChange={(event) => setSelectedPreset(event.target.value)}
                  className="pacts-input"
                >
                  <option value="">Select a preset pact</option>
                  {PRESET_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <div className="pacts-divider">
                <span>or</span>
              </div>

              <label className="pacts-field">
                <span>Custom category</span>
                <input
                  type="text"
                  value={customCategory}
                  onChange={(event) => setCustomCategory(event.target.value)}
                  placeholder="Ex: Target, Uber, Sephora"
                  className="pacts-input"
                />
              </label>

              <label className="pacts-field">
                <span>Alert recipient</span>
                <select
                  value={newAccountabilityType}
                  onChange={(event) => setNewAccountabilityType(event.target.value)}
                  className="pacts-input"
                >
                  {ACCOUNTABILITY_TYPES.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="pacts-field">
                <span>Discipline savings target (%)</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={newDisciplineSavingsPercentage}
                  onChange={(event) => setNewDisciplineSavingsPercentage(event.target.value)}
                  className="pacts-input"
                />
                <p className="pacts-field-note">
                  When a purchase breaks this pact, this percentage can be redirected into savings.
                </p>
              </label>

              <label className="pacts-field">
                <span>Accountability note</span>
                <textarea
                  value={newAccountabilityNote}
                  onChange={(event) => setNewAccountabilityNote(event.target.value)}
                  placeholder="Optional reminder or message for the alert."
                  className="pacts-textarea"
                />
              </label>

              <label className="pacts-field">
                <span>Lock duration</span>
                <select
                  value={lockDays}
                  onChange={(event) => setLockDays(Number(event.target.value))}
                  className="pacts-input"
                >
                  <option value={0}>No lock</option>
                  <option value={1}>1 day</option>
                  <option value={7}>1 week</option>
                  <option value={30}>30 days</option>
                </select>
                <p className="pacts-field-note">
                  Saving settings starts a 5 minute safety window before the pact locks.
                </p>
              </label>

              {error ? <p className="dashboard-error">{error}</p> : null}
              {success ? <p className="pacts-success">{success}</p> : null}

              <button type="submit" className="dashboard-button" disabled={submitting}>
                {submitting ? 'Adding...' : 'Add Pact'}
              </button>
            </form>
          </div>

          <div className="dashboard-card dashboard-panel pacts-list-panel">
            <div className="dashboard-panel-header">
              <h2>Your Pact Library</h2>
              <span>{pacts.length} total</span>
            </div>

            {loading && <p className="dashboard-empty">Loading pacts...</p>}

            {!loading && pacts.length === 0 && (
              <p className="dashboard-empty">
                No pacts yet. Add your first pact to start tracking a habit.
              </p>
            )}

            {!loading && pacts.length > 0 && (
              <div className="pacts-list">
                {pacts.map((pact) => {
                  const isPreset = Boolean(pact.preset_category)
                  const pactName = normalizeCategory(
                    pact.custom_category || pact.category || pact.preset_category
                  )
                  const lockedUntil = pact.locked_until ? new Date(pact.locked_until) : null
                  const isLocked = lockedUntil ? lockedUntil > now : false
                  const remainingMs = lockedUntil ? lockedUntil.getTime() - now.getTime() : 0
                  const remainingLabel = lockedUntil ? formatRemaining(remainingMs) : null
                  const isExpanded = expandedPactId === pact.id

                  const formState = settingsFormState[pact.id] || {
                    accountability_type: 'email',
                    discipline_savings_percentage: 0,
                    accountability_note: '',
                  }

                  const isSettingsLoading = settingsLoading[pact.id]
                  const isSettingsSaving = settingsSaving[pact.id]
                  const pactSettingsError = settingsError[pact.id]

                  return (
                    <div className="pacts-card pacts-card-compact" key={pact.id}>
                      <div className="pacts-card-compact-main">
                        <div className="pacts-card-topline">
                          <h3>{pactName}</h3>
                          <span className={`pacts-badge ${isPreset ? 'is-preset' : 'is-custom'}`}>
                            {isPreset ? 'Preset' : 'Custom'}
                          </span>
                        </div>

                        <p className="pacts-card-meta">
                          {isLocked ? `Locked — ${remainingLabel} remaining` : 'Unlocked'}
                        </p>

                        <p className="pacts-card-mini-summary">
                          {formatAccountabilityType(formState.accountability_type)} ·{' '}
                          {Number(formState.discipline_savings_percentage) || 0}% savings
                        </p>
                      </div>

                      <div className="pacts-card-compact-actions">
                        <button
                          type="button"
                          className="pacts-secondary-button"
                          onClick={() => {
                            cancelEditing()
                            setExpandedPactId(isExpanded ? null : pact.id)
                          }}
                        >
                          {isExpanded ? 'Close' : 'Settings'}
                        </button>

                        <button
                          type="button"
                          className="pacts-secondary-button"
                          onClick={() => startEditingPact(pact)}
                          disabled={isLocked}
                        >
                          Edit
                        </button>

                        <button
                          type="button"
                          className="pacts-danger-button"
                          disabled={deletingId === pact.id || isLocked}
                          onClick={() => handleDeletePact(pact.id, isLocked)}
                          title={isLocked ? 'This pact cannot be deleted until the lock expires.' : ''}
                        >
                          {deletingId === pact.id ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>

                      {editingPactId === pact.id && (
                        <div className="pacts-card-expanded">
                          <h4 className="pacts-edit-title">Edit pact</h4>

                          {isPreset ? (
                            <label className="pacts-field">
                              <span>Preset category</span>
                              <select
                                value={editingValues.preset_category}
                                onChange={(event) =>
                                  setEditingValues((prev) => ({
                                    ...prev,
                                    preset_category: event.target.value,
                                  }))
                                }
                                className="pacts-input"
                              >
                                {PRESET_OPTIONS.map((option) => (
                                  <option key={option} value={option}>
                                    {option}
                                  </option>
                                ))}
                              </select>
                            </label>
                          ) : (
                            <label className="pacts-field">
                              <span>Custom category</span>
                              <input
                                type="text"
                                value={editingValues.custom_category}
                                onChange={(event) =>
                                  setEditingValues((prev) => ({
                                    ...prev,
                                    custom_category: event.target.value,
                                  }))
                                }
                                className="pacts-input"
                              />
                            </label>
                          )}

                          <label className="pacts-field">
                            <span>Lock duration</span>
                            <select
                              value={editingValues.lockDays}
                              onChange={(event) =>
                                setEditingValues((prev) => ({
                                  ...prev,
                                  lockDays: Number(event.target.value),
                                }))
                              }
                              className="pacts-input"
                              disabled={isLocked}
                            >
                              <option value={0}>No lock</option>
                              <option value={1}>1 day</option>
                              <option value={7}>1 week</option>
                              <option value={30}>30 days</option>
                            </select>
                          </label>

                          <div className="pacts-card-actions">
                            <button
                              type="button"
                              className="dashboard-button"
                              disabled={isLocked}
                              onClick={() => handleSavePact(pact)}
                            >
                              Save changes
                            </button>
                            <button
                              type="button"
                              className="pacts-secondary-button"
                              onClick={cancelEditing}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}

                      {isExpanded && editingPactId !== pact.id && (
                        <div className="pacts-card-expanded">
                          {isSettingsLoading ? (
                            <p className="pacts-accountability-loading">Loading settings…</p>
                          ) : (
                            <>
                              {pactSettingsError && (
                                <p className="dashboard-error">{pactSettingsError}</p>
                              )}

                              <label className="pacts-field">
                                <span>Alert recipient</span>
                                <select
                                  value={formState.accountability_type}
                                  onChange={(event) =>
                                    updateFormState(pact.id, {
                                      accountability_type: event.target.value,
                                    })
                                  }
                                  className="pacts-input"
                                  disabled={isLocked}
                                >
                                  {ACCOUNTABILITY_TYPES.map((option) => (
                                    <option key={option.value} value={option.value}>
                                      {option.label}
                                    </option>
                                  ))}
                                </select>
                              </label>

                              <label className="pacts-field">
                                <span>Discipline savings target (%)</span>
                                <input
                                  type="number"
                                  min={0}
                                  max={100}
                                  value={formState.discipline_savings_percentage}
                                  onChange={(event) =>
                                    updateFormState(pact.id, {
                                      discipline_savings_percentage: event.target.value,
                                    })
                                  }
                                  className="pacts-input"
                                  disabled={isLocked}
                                />
                                <p className="pacts-field-note">
                                  This is the percentage to move into savings when the pact is broken.
                                </p>
                              </label>

                              <label className="pacts-field">
                                <span>Accountability note</span>
                                <textarea
                                  value={formState.accountability_note}
                                  onChange={(event) =>
                                    updateFormState(pact.id, {
                                      accountability_note: event.target.value,
                                    })
                                  }
                                  placeholder="Optional reminder or message for the alert."
                                  className="pacts-textarea"
                                  disabled={isLocked}
                                />
                              </label>

                              <div className="pacts-card-actions">
                                <button
                                  type="button"
                                  className="dashboard-button"
                                  disabled={isSettingsSaving || isLocked}
                                  onClick={() => handleSaveSettings(pact.id)}
                                >
                                  {isSettingsSaving ? 'Saving…' : 'Save settings'}
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="dashboard-card dashboard-panel pacts-info-panel">
            <div className="dashboard-panel-header">
              <h2>How Pacts Work</h2>
            </div>

            <div className="pacts-info-list">
              <div className="pacts-info-item">
                <h3>Compact library</h3>
                <p>Each pact stays small by default, and only one settings panel opens at a time.</p>
              </div>

              <div className="pacts-info-item">
                <h3>Alert recipient</h3>
                <p>Choose whether pact alerts go to you or to your accountability partner.</p>
              </div>

              <div className="pacts-info-item">
                <h3>Discipline savings</h3>
                <p>A broken pact can move part of the purchase amount into savings based on your chosen percentage.</p>
              </div>

              <div className="pacts-info-item">
                <h3>Safety lock</h3>
                <p>After settings are saved, a short safety window starts before the pact locks and deletion is disabled.</p>
              </div>
            </div>
          </div>

          <div className="dashboard-card dashboard-panel pacts-info-panel">
            <div className="dashboard-panel-header">
              <h2>Quick Links</h2>
            </div>

            <div className="pacts-quick-links">
              <Link className="dashboard-link-button" to="/dashboard">
                Return to Dashboard →
              </Link>
              <Link className="dashboard-link-button" to="/transactions">
                Review Transactions →
              </Link>
              <Link className="dashboard-link-button" to="/settings">
                Open Settings →
              </Link>
            </div>
          </div>
        </section>
      </section>
    </div>
  )
}
