import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../features/auth/context'
import { apiRequest } from '../lib/api'
import { getDisciplineUiState } from '../features/pacts/disciplineState'
import {
  getAccountabilitySettings,
  saveAccountabilitySettings,
} from '../features/accountability/api'
import {
  createAccountabilityPartner,
  deleteAccountabilityPartner,
  listAccountabilityPartners,
  updateAccountabilityPartner,
} from '../features/accountability-partners/api'
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

/** Who gets pact-break alerts only — savings % is a separate field below. */
const ACCOUNTABILITY_TYPES = [
  { value: 'email', label: 'Email yourself' },
  { value: 'friend', label: 'Accountability partner' },
  { value: 'none', label: 'None' },
]

const AUTO_LOCK_DELAY_MS = 5 * 60 * 1000

const ALERT_RECIPIENT_TYPES = new Set(['email', 'friend', 'none'])

function normalizeAlertRecipientType(raw) {
  const t = String(raw || 'email').toLowerCase()
  return ALERT_RECIPIENT_TYPES.has(t) ? t : 'email'
}

function normalizeCategory(category) {
  if (!category) return 'Other'
  return String(category)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function formatAccountabilityType(type) {
  switch (type) {
    case 'email':
      return 'Email yourself'
    case 'friend':
      return 'Accountability partner'
    case 'none':
      return 'None'
    case 'savings_percentage':
      return 'Savings only (legacy)'
    case 'both':
      return 'Email + savings (legacy)'
    default:
      return type || '—'
  }
}

const PACTS_SKIP_INTRO_KEY = 'pactbank.pacts.skipIntro'

export default function Pacts() {
  const { user, token, refreshUser } = useAuth()
  const firstName = user?.name?.split(' ')[0] || 'there'

  const [pacts, setPacts] = useState([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [editingPactId, setEditingPactId] = useState(null)
  const [editingValues, setEditingValues] = useState({})
  const [libraryPactSaving, setLibraryPactSaving] = useState(null)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState('')
  const [now, setNow] = useState(new Date())

  const [selectedPreset, setSelectedPreset] = useState('')
  const [customCategory, setCustomCategory] = useState('')
  const [lockDays, setLockDays] = useState(0)
  const [newAccountabilityType, setNewAccountabilityType] = useState('email')
  const [newDisciplineSavingsPercentage, setNewDisciplineSavingsPercentage] = useState(0)

  const [settingsFormState, setSettingsFormState] = useState({})
  const [settingsLoading, setSettingsLoading] = useState({})
  const [settingsError, setSettingsError] = useState({})
  const [partners, setPartners] = useState([])
  const [partnersLoading, setPartnersLoading] = useState(false)
  const [partnerSaving, setPartnerSaving] = useState(false)
  const [partnerForm, setPartnerForm] = useState({
    partner_name: '',
    partner_email: '',
    relationship_label: '',
    is_active: true,
  })
  const [editingPartnerId, setEditingPartnerId] = useState(null)

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
            accountability_type: normalizeAlertRecipientType(settings.accountability_type),
            discipline_savings_percentage: settings.discipline_savings_percentage || 0,
          },
        }))
      } catch (err) {
        if (err?.status === 404) {
          setSettingsFormState((prev) => ({
            ...prev,
            [pactId]: {
              accountability_type: 'email',
              discipline_savings_percentage: 0,
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

  useEffect(() => {
    if (!token) return
    refreshUser(token).catch(() => {})
  }, [token, refreshUser])

  const loadPartners = useCallback(async () => {
    if (!token) return
    try {
      setPartnersLoading(true)
      const data = await listAccountabilityPartners(token)
      setPartners(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(err?.message || 'Failed to load accountability partners.')
    } finally {
      setPartnersLoading(false)
    }
  }, [token])

  useEffect(() => {
    loadPartners()
  }, [loadPartners])

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
            accountability_note: null,
          },
          token
        )
      }

      setSelectedPreset('')
      setCustomCategory('')
      setLockDays(0)
      setNewAccountabilityType('email')
      setNewDisciplineSavingsPercentage(0)
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
      setSettingsError((prev) => {
        const next = { ...prev }
        delete next[pactId]
        return next
      })

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

  function resetPartnerForm() {
    setEditingPartnerId(null)
    setPartnerForm({
      partner_name: '',
      partner_email: '',
      relationship_label: '',
      is_active: true,
    })
  }

  function validatePartnerForm() {
    if (!partnerForm.partner_email?.trim()) return 'Partner email is required.'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(partnerForm.partner_email.trim())) {
      return 'Enter a valid partner email.'
    }
    return null
  }

  async function handleSavePartner() {
    const validationError = validatePartnerForm()
    if (validationError) {
      setError(validationError)
      return
    }

    setPartnerSaving(true)
    setError(null)
    setSuccess('')
    const payload = {
      partner_name: partnerForm.partner_name?.trim() || null,
      partner_email: partnerForm.partner_email.trim().toLowerCase(),
      relationship_label: partnerForm.relationship_label?.trim() || null,
      is_active: Boolean(partnerForm.is_active),
    }

    try {
      if (editingPartnerId) {
        const updated = await updateAccountabilityPartner(editingPartnerId, payload, token)
        setPartners((prev) => prev.map((partner) => (partner.id === editingPartnerId ? updated : partner)))
        setSuccess('Accountability partner updated.')
      } else {
        const created = await createAccountabilityPartner(payload, token)
        setPartners((prev) => [created, ...prev])
        setSuccess('Accountability partner added.')
      }
      resetPartnerForm()
    } catch (err) {
      setError(err?.message || 'Failed to save accountability partner.')
    } finally {
      setPartnerSaving(false)
    }
  }

  async function handleDeletePartner(partnerId) {
    const confirmed = window.confirm('Remove this accountability partner?')
    if (!confirmed) return

    try {
      await deleteAccountabilityPartner(partnerId, token)
      setPartners((prev) => prev.filter((partner) => partner.id !== partnerId))
      if (editingPartnerId === partnerId) resetPartnerForm()
      setSuccess('Accountability partner removed.')
    } catch (err) {
      setError(err?.message || 'Failed to remove accountability partner.')
    }
  }

  function beginEditPartner(partner) {
    setEditingPartnerId(partner.id)
    setPartnerForm({
      partner_name: partner.partner_name || '',
      partner_email: partner.partner_email || '',
      relationship_label: partner.relationship_label || '',
      is_active: Boolean(partner.is_active),
    })
  }

  const handleSavePact = async (pact) => {
    setError(null)
    setSuccess('')
    setLibraryPactSaving(pact.id)
    setSettingsError((prev) => ({ ...prev, [pact.id]: null }))

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

      const formState = settingsFormState[pact.id]
      if (formState) {
        const settingsPayload = {
          pact_id: pact.id,
          accountability_type: formState.accountability_type,
          discipline_savings_percentage: Number(formState.discipline_savings_percentage) || 0,
          accountability_note: null,
        }
        const updated = await saveAccountabilitySettings(settingsPayload, token)
        setSettingsFormState((prev) => ({
          ...prev,
          [pact.id]: {
            accountability_type: updated.accountability_type || 'email',
            discipline_savings_percentage: updated.discipline_savings_percentage || 0,
          },
        }))
      }

      cancelEditing()
      await loadPacts()
      setSuccess('Pact saved.')

      await lockPact({
        id: pact.id,
        locked_until,
      })
    } catch (err) {
      const message = err?.message || 'Failed to save pact.'
      setError(message)
      setSettingsError((prev) => ({
        ...prev,
        [pact.id]: message,
      }))
    } finally {
      setLibraryPactSaving(null)
    }
  }

  const [showDashboard, setShowDashboard] = useState(() => {
    if (typeof window === 'undefined') return true
    const v = window.localStorage.getItem(PACTS_SKIP_INTRO_KEY)
    if (v === '0') return false
    return true
  })
  const disciplineModeEnabled = (user?.discipline_ui_mode || 'discipline') === 'discipline'
  const disciplineScore = Number(user?.discipline_score ?? 100)
  const disciplineUiState = getDisciplineUiState(disciplineScore)

  function openPactsMain() {
    try {
      window.localStorage.setItem(PACTS_SKIP_INTRO_KEY, '1')
    } catch {
      /* ignore */
    }
    setShowDashboard(true)
  }

  function showPactsIntro() {
    try {
      window.localStorage.setItem(PACTS_SKIP_INTRO_KEY, '0')
    } catch {
      /* ignore */
    }
    setShowDashboard(false)
  }

  if (!showDashboard) {
    return (
      <div className="dashboard-shell">
        <DashboardTopbar navAriaLabel="Dashboard" />
        <div className="pacts-intro">
          <div className="pacts-intro-box">
            <h1 className="pacts-intro-title">What's a Pact?</h1>
            <p className="pacts-intro-desc">
              A pact is a spending rule you commit to. You pick a category — like dining out or online shopping — and PactBank watches your transactions. If you break it, you get held accountable: an alert goes out, and a percentage of that purchase can be automatically moved into savings. It's a way to put real consequences behind your financial goals.
            </p>
            {disciplineModeEnabled ? (
              <p className="pacts-intro-discipline-hint" role="status">
                <strong>{disciplineUiState.label}</strong>
                <span> · Score {disciplineScore}/100</span>
                <span className="pacts-intro-discipline-note">
                  {' '}
                  Open My Pacts below to manage rules, partners, and discipline settings.
                </span>
              </p>
            ) : null}
            <button type="button" className="dashboard-button pacts-intro-btn" onClick={openPactsMain}>
              Create Pact / See Pacts →
            </button>
            <button type="button" className="pacts-intro-skip" onClick={openPactsMain}>
              Skip intro — go straight to My Pacts
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className={`dashboard-shell ${
        disciplineModeEnabled ? `pacts-discipline-${disciplineUiState.key}` : 'pacts-classic-mode'
      }`}
    >
      <DashboardTopbar navAriaLabel="Dashboard" />

      <section className="dashboard-hero">
        <div className="dashboard-hero-copy">
          <h1 className="dashboard-title">
            Manage your pacts, {firstName} </h1>
          <p className="dashboard-subtitle">
            Add, organize, and remove accountability rules that shape how your spending is tracked.
          </p>
          {disciplineModeEnabled ? (
            <div className="pacts-discipline-banner" role="status" aria-live="polite">
              <strong>{disciplineUiState.label}</strong>
              <span>Score: {disciplineScore}/100</span>
              <p>{disciplineUiState.tone}</p>
            </div>
          ) : null}
        </div>

        <div className="dashboard-hero-actions">
          <div className="dashboard-pill">
            {loading ? 'Loading pacts...' : `${activePacts.length} Active Pacts`}
          </div>
          <button type="button" className="pacts-intro-link" onClick={showPactsIntro}>
            What is a Pact?
          </button>
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
            <p className="dashboard-card-label">
              {disciplineModeEnabled ? 'Discipline State' : 'Status'}
            </p>
            <p className="dashboard-stat">
              {disciplineModeEnabled
                ? disciplineUiState.label
                : activePacts.length === pacts.length
                  ? 'Stable'
                  : 'Mixed'}
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
                <span>Who gets alerts if you break this pact?</span>
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

              {newAccountabilityType === 'friend' && (
                <div className="pacts-helper-card">
                  <h3>Accountability partner</h3>
                  <p>
                    Partner emails are sent when a flagged purchase breaks one of your active pact categories.
                  </p>
                  <div className="pacts-partner-grid">
                    <label className="pacts-field">
                      <span>Partner name</span>
                      <input
                        type="text"
                        className="pacts-input"
                        value={partnerForm.partner_name}
                        onChange={(event) =>
                          setPartnerForm((prev) => ({ ...prev, partner_name: event.target.value }))
                        }
                        placeholder="Alex"
                      />
                    </label>
                    <label className="pacts-field">
                      <span>Partner email</span>
                      <input
                        type="email"
                        className="pacts-input"
                        value={partnerForm.partner_email}
                        onChange={(event) =>
                          setPartnerForm((prev) => ({ ...prev, partner_email: event.target.value }))
                        }
                        placeholder="alex@example.com"
                      />
                    </label>
                    <label className="pacts-field">
                      <span>Relationship</span>
                      <input
                        type="text"
                        className="pacts-input"
                        value={partnerForm.relationship_label}
                        onChange={(event) =>
                          setPartnerForm((prev) => ({ ...prev, relationship_label: event.target.value }))
                        }
                        placeholder="Friend, parent, coach"
                      />
                    </label>
                  </div>
                  <div className="pacts-partner-actions">
                    <button
                      type="button"
                      className="pacts-secondary-button"
                      onClick={handleSavePartner}
                      disabled={partnerSaving}
                    >
                      {partnerSaving ? 'Saving partner...' : editingPartnerId ? 'Update partner' : 'Add partner'}
                    </button>
                    {editingPartnerId ? (
                      <button type="button" className="pacts-secondary-button" onClick={resetPartnerForm}>
                        Cancel edit
                      </button>
                    ) : null}
                  </div>
                </div>
              )}

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
                  When a purchase breaks this pact, this percent of the amount is simulated as moved to
                  savings (demo—not a real transfer). Works with any alert type if the % is above 0.
                </p>
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

                  const formState = settingsFormState[pact.id] || {
                    accountability_type: 'email',
                    discipline_savings_percentage: 0,
                  }

                  const isSettingsLoading = settingsLoading[pact.id]
                  const pactSettingsError = settingsError[pact.id]
                  const primaryPartner = partners.find((partner) => partner.is_active) || partners[0]

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
                        <p className="pacts-card-mini-summary">
                          {primaryPartner
                            ? `${primaryPartner.partner_name || 'Partner'} (${primaryPartner.partner_email})`
                            : 'No accountability partner set'}
                        </p>
                      </div>

                      {editingPactId !== pact.id && (
                        <div className="pacts-card-compact-actions">
                          <button
                            type="button"
                            className="pacts-secondary-button"
                            onClick={() => startEditingPact(pact)}
                            disabled={isLocked}
                            title={isLocked ? 'This pact is locked until the lock expires.' : ''}
                          >
                            Edit
                          </button>
                        </div>
                      )}

                      {editingPactId === pact.id && (
                        <div className="pacts-card-expanded">
                          <h4 className="pacts-edit-title">Edit pact</h4>

                          {isSettingsLoading ? (
                            <p className="pacts-accountability-loading">Loading settings…</p>
                          ) : (
                            <>
                              {pactSettingsError && (
                                <p className="dashboard-error">{pactSettingsError}</p>
                              )}

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
                                    disabled={isLocked}
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
                                    disabled={isLocked}
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

                              <h4 className="pacts-edit-title pacts-edit-title-sub">Accountability</h4>

                              <label className="pacts-field">
                                <span>Who gets alerts if you break this pact?</span>
                                <select
                                  value={normalizeAlertRecipientType(formState.accountability_type)}
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
                                  When you break this pact, this percent of the purchase amount is
                                  simulated as moved to savings (demo—not a real bank transfer).
                                </p>
                              </label>

                              {formState.accountability_type === 'friend' && (
                                <div className="pacts-helper-card">
                                  <h4>Accountability partner</h4>
                                  <p className="pacts-field-note pacts-helper-card-lead">
                                    Add or manage who receives alerts when this pact is broken.
                                  </p>
                                  <div className="pacts-partner-grid">
                                    <label className="pacts-field">
                                      <span>Partner name</span>
                                      <input
                                        type="text"
                                        className="pacts-input"
                                        value={partnerForm.partner_name}
                                        onChange={(event) =>
                                          setPartnerForm((prev) => ({ ...prev, partner_name: event.target.value }))
                                        }
                                        placeholder="Alex"
                                        disabled={isLocked}
                                      />
                                    </label>
                                    <label className="pacts-field">
                                      <span>Partner email</span>
                                      <input
                                        type="email"
                                        className="pacts-input"
                                        value={partnerForm.partner_email}
                                        onChange={(event) =>
                                          setPartnerForm((prev) => ({ ...prev, partner_email: event.target.value }))
                                        }
                                        placeholder="alex@example.com"
                                        disabled={isLocked}
                                      />
                                    </label>
                                    <label className="pacts-field">
                                      <span>Relationship</span>
                                      <input
                                        type="text"
                                        className="pacts-input"
                                        value={partnerForm.relationship_label}
                                        onChange={(event) =>
                                          setPartnerForm((prev) => ({
                                            ...prev,
                                            relationship_label: event.target.value,
                                          }))
                                        }
                                        placeholder="Friend, parent, coach"
                                        disabled={isLocked}
                                      />
                                    </label>
                                  </div>
                                  <div className="pacts-partner-actions">
                                    <button
                                      type="button"
                                      className="pacts-secondary-button"
                                      onClick={handleSavePartner}
                                      disabled={partnerSaving || isLocked}
                                    >
                                      {partnerSaving
                                        ? 'Saving…'
                                        : editingPartnerId
                                          ? 'Update partner'
                                          : 'Add partner'}
                                    </button>
                                    {editingPartnerId ? (
                                      <button
                                        type="button"
                                        className="pacts-secondary-button"
                                        onClick={resetPartnerForm}
                                        disabled={isLocked}
                                      >
                                        Cancel edit
                                      </button>
                                    ) : null}
                                  </div>
                                  {partnersLoading ? (
                                    <p className="pacts-accountability-loading">Loading partners…</p>
                                  ) : partners.length === 0 ? (
                                    <p className="pacts-empty">No partners saved yet.</p>
                                  ) : (
                                    <div className="pacts-partner-list">
                                      {partners.map((partner) => (
                                        <div className="pacts-partner-row" key={partner.id}>
                                          <div>
                                            <strong>{partner.partner_name || 'Unnamed partner'}</strong>
                                            <p>{partner.partner_email}</p>
                                            {partner.relationship_label ? (
                                              <p>{partner.relationship_label}</p>
                                            ) : null}
                                          </div>
                                          <div className="pacts-partner-row-actions">
                                            <button
                                              type="button"
                                              className="pacts-secondary-button"
                                              onClick={() => beginEditPartner(partner)}
                                              disabled={isLocked}
                                            >
                                              Edit
                                            </button>
                                            <button
                                              type="button"
                                              className="pacts-danger-button"
                                              onClick={() => handleDeletePartner(partner.id)}
                                              disabled={isLocked}
                                            >
                                              Remove
                                            </button>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}

                              <div className="pacts-card-actions">
                                <button
                                  type="button"
                                  className="dashboard-button"
                                  disabled={libraryPactSaving === pact.id || isLocked}
                                  onClick={() => handleSavePact(pact)}
                                >
                                  {libraryPactSaving === pact.id ? 'Saving…' : 'Save'}
                                </button>
                                <button
                                  type="button"
                                  className="pacts-secondary-button"
                                  onClick={cancelEditing}
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  className="pacts-danger-button"
                                  disabled={deletingId === pact.id || isLocked}
                                  onClick={() => handleDeletePact(pact.id, isLocked)}
                                  title={isLocked ? 'This pact cannot be deleted until the lock expires.' : ''}
                                >
                                  {deletingId === pact.id ? 'Deleting…' : 'Delete pact'}
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
                <h3>Who gets alerts</h3>
                <p>
                  Pick email yourself, an accountability partner, or none. Discipline savings % is
                  separate. Partner fields only appear when you choose accountability partner.
                </p>
              </div>

              <div className="pacts-info-item">
                <h3>Discipline savings</h3>
                <p>
                  A violating purchase can simulate moving your chosen percentage of that purchase into
                  savings. This is in-app only until a real transfer integration exists.
                </p>
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
