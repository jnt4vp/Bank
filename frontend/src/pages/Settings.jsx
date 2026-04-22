import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../features/auth/context'
import { apiRequest } from '../lib/api/client'
import { useAppConfig } from '../lib/config/useAppConfig'
import DashboardTopbar from '../components/DashboardTopbar'
import PlaidItemsSection from '../features/plaid/PlaidItemsSection'
import {
  createAccountabilityPartner,
  deleteAccountabilityPartner,
  listAccountabilityPartners,
  updateAccountabilityPartner,
} from '../features/accountability-partners/api'
import '../dashboard.css'
import '../settings.css'

const securityRows = [
  {
    label: 'Change password',
    detail: 'Request a reset link sent to your email to choose a new password.',
    badge: 'Recommended',
    to: '/forgot-password',
  },
  {
    label: 'Two-factor authentication',
    detail: 'Add another layer of protection to sign-in.',
    badge: 'Coming soon',
    disabled: true,
  },
  {
    label: 'Login activity',
    detail: 'Review recent sign-ins across your devices and sessions.',
    badge: 'Coming soon',
    disabled: true,
  },
]

const SUPPORT_EMAIL =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPPORT_EMAIL) ||
  'support@pactbank.example'

function formatMemberSince(value) {
  if (!value) return 'Recently joined'

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return 'Recently joined'

  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
  }).format(parsed)
}



function RowAction({
  label,
  detail,
  badge,
  danger = false,
  chevron = true,
  to,
  href,
  onClick,
  disabled = false,
}) {
  const className = `settings-row settings-action-row ${danger ? 'is-danger' : ''}`
  const inner = (
    <>
      <div className="settings-row-copy">
        <h3>{label}</h3>
        {detail ? <p>{detail}</p> : null}
      </div>

      <div className="settings-row-meta">
        {badge ? <span className="settings-inline-badge">{badge}</span> : null}
        {chevron ? (
          <span className="settings-row-arrow" aria-hidden="true">
            →
          </span>
        ) : null}
      </div>
    </>
  )

  if (to) {
    return (
      <Link to={to} className={className}>
        {inner}
      </Link>
    )
  }

  if (href) {
    return (
      <a className={className} href={href} target="_blank" rel="noreferrer">
        {inner}
      </a>
    )
  }

  return (
    <button type="button" className={className} onClick={onClick} disabled={disabled}>
      {inner}
    </button>
  )
}

function ToggleRow({ label, description, checked, onChange }) {
  return (
    <div className="settings-row settings-toggle-row">
      <div className="settings-row-copy">
        <h3>{label}</h3>
        <p>{description}</p>
      </div>

      <button
        type="button"
        className={`settings-toggle ${checked ? 'is-on' : ''}`}
        aria-label={label}
        aria-pressed={checked}
        onClick={onChange}
      />
    </div>
  )
}

function SegmentedControl({ label, value, options, onChange }) {
  return (
    <div className="settings-control-group">
      <div className="settings-control-label-row">
        <span className="settings-control-label">{label}</span>
      </div>

      <div className="settings-segmented-control" role="tablist" aria-label={label}>
        {options.map((option) => (
          <button
            key={option}
            type="button"
            className={`settings-segment ${value === option ? 'is-active' : ''}`}
            aria-pressed={value === option}
            onClick={() => onChange(option)}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function Settings() {
  const { user, token, refreshUser } = useAuth()
  const { config: appConfig, isSandbox } = useAppConfig()

  const [isEditingProfile, setIsEditingProfile] = useState(false)
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileError, setProfileError] = useState('')
  const [profileSuccess, setProfileSuccess] = useState('')
  const [disciplineResetConfirmOpen, setDisciplineResetConfirmOpen] = useState(false)

  const [profileForm, setProfileForm] = useState({
    name: '',
    email: '',
    phone: '',
  })

  const [_activeTab, _setActiveTab] = useState('Profile')
  const [theme, setTheme] = useState('System')
  const [density, setDensity] = useState('Comfortable')
  const [dateFormat, setDateFormat] = useState('Month / Day / Year')
  const [currency, setCurrency] = useState('USD ($)')
  const [disciplineUiModeSaving, setDisciplineUiModeSaving] = useState(false)
  const [dashboardSkySaving, setDashboardSkySaving] = useState(false)
  const [resetDisciplineSaving, setResetDisciplineSaving] = useState(false)
  const [uiPrefsMessage, setUiPrefsMessage] = useState({ type: '', text: '' })
  const [cardLockSaving, setCardLockSaving] = useState(false)
  const [cardLockError, setCardLockError] = useState('')

  async function handleToggleCardLock() {
    if (!token || cardLockSaving) return
    setCardLockSaving(true)
    setCardLockError('')
    try {
      await apiRequest('/api/auth/me', {
        method: 'PATCH',
        token,
        body: { card_locked: !user?.card_locked },
      })
      await refreshUser(token)
    } catch (err) {
      setCardLockError(err?.message || 'Could not update card lock.')
    } finally {
      setCardLockSaving(false)
    }
  }
  const [partners, setPartners] = useState([])
  const [partnerForm, setPartnerForm] = useState({
    partner_name: '',
    partner_email: '',
    relationship_label: '',
    is_active: true,
  })
  const [editingPartnerId, setEditingPartnerId] = useState(null)
  const [partnerSaving, setPartnerSaving] = useState(false)
  const [deletingPartnerId, setDeletingPartnerId] = useState(null)
  const [partnerPendingDelete, setPartnerPendingDelete] = useState(null)
  const [partnerError, setPartnerError] = useState('')
  const [partnerSuccess, setPartnerSuccess] = useState('')


  const userLabel = user?.name || user?.email || 'User'
  const firstInitial = userLabel.charAt(0).toUpperCase()

  useEffect(() => {
    if (token) {
      refreshUser(token)
    }
  }, [refreshUser, token])

  useEffect(() => {
    if (!partnerPendingDelete) return undefined
    function onKeyDown(e) {
      if (e.key === 'Escape') setPartnerPendingDelete(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [partnerPendingDelete])

  useEffect(() => {
    async function loadAccountabilityPartners() {
      if (!token) {
        setPartners([])
        return
      }
      try {
        const partnersResult = await listAccountabilityPartners(token)
        setPartners(partnersResult || [])
      } catch {
        setPartnerError('Failed to load accountability partners.')
      }
    }
    loadAccountabilityPartners()
  }, [token])

  function resetPartnerForm() {
    setEditingPartnerId(null)
    setPartnerForm({
      partner_name: '',
      partner_email: '',
      relationship_label: '',
      is_active: true,
    })
  }

  function beginEditPartner(partner) {
    setEditingPartnerId(partner.id)
    setPartnerError('')
    setPartnerSuccess('')
    setPartnerForm({
      partner_name: partner.partner_name || '',
      partner_email: partner.partner_email || '',
      relationship_label: partner.relationship_label || '',
      is_active: partner.is_active !== false,
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
      setPartnerError(validationError)
      setPartnerSuccess('')
      return
    }

    setPartnerSaving(true)
    setPartnerError('')
    setPartnerSuccess('')

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
        setPartnerSuccess('Partner updated.')
      } else {
        const created = await createAccountabilityPartner(payload, token)
        setPartners((prev) => [created, ...prev])
        setPartnerSuccess('Partner added.')
      }
      resetPartnerForm()
    } catch (error) {
      setPartnerError(error?.message || 'Could not save partner.')
    } finally {
      setPartnerSaving(false)
    }
  }

  function requestDeletePartner(partner) {
    if (!partner?.id) return
    setPartnerError('')
    setPartnerSuccess('')
    setPartnerPendingDelete(partner)
  }

  function cancelDeletePartner() {
    setPartnerPendingDelete(null)
  }

  async function confirmDeletePartner() {
    const partner = partnerPendingDelete
    if (!token || !partner?.id) return
    setPartnerPendingDelete(null)
    setPartnerError('')
    setPartnerSuccess('')
    setDeletingPartnerId(partner.id)
    try {
      await deleteAccountabilityPartner(partner.id, token)
      setPartners((prev) => prev.filter((p) => p.id !== partner.id))
      setPartnerSuccess('Partner removed.')
    } catch (error) {
      setPartnerError(error?.message || 'Could not remove partner.')
    } finally {
      setDeletingPartnerId(null)
    }
  }

  function clearUiPrefsMessageSoon() {
    window.setTimeout(() => setUiPrefsMessage({ type: '', text: '' }), 4500)
  }

  async function handleDisciplineUiModeChange(nextMode) {
    if (!token || disciplineUiModeSaving) return
    setUiPrefsMessage({ type: '', text: '' })
    try {
      setDisciplineUiModeSaving(true)
      await apiRequest('/api/auth/me', {
        method: 'PATCH',
        token,
        body: { discipline_ui_mode: nextMode },
      })
      await refreshUser(token)
      setUiPrefsMessage({ type: 'success', text: 'Pacts appearance updated.' })
      clearUiPrefsMessageSoon()
    } catch (error) {
      setUiPrefsMessage({
        type: 'error',
        text: error?.message || 'Could not update Pacts UI mode.',
      })
    } finally {
      setDisciplineUiModeSaving(false)
    }
  }

  async function handleDashboardForceSkyChange(forceSky) {
    if (!token || dashboardSkySaving) return
    setUiPrefsMessage({ type: '', text: '' })
    try {
      setDashboardSkySaving(true)
      await apiRequest('/api/auth/me', {
        method: 'PATCH',
        token,
        body: { dashboard_force_sky: forceSky },
      })
      await refreshUser(token)
      setUiPrefsMessage({
        type: 'success',
        text: forceSky
          ? 'Dashboard will use the calm sky background. Discipline tier still tints cards.'
          : 'Dashboard background will follow your discipline score again.',
      })
      clearUiPrefsMessageSoon()
    } catch (error) {
      setUiPrefsMessage({
        type: 'error',
        text: error?.message || 'Could not update dashboard background preference.',
      })
    } finally {
      setDashboardSkySaving(false)
    }
  }

  function requestResetDisciplineWindow() {
    if (!token || resetDisciplineSaving) return
    setDisciplineResetConfirmOpen(true)
  }

  async function confirmResetDisciplineWindow() {
    if (!token || resetDisciplineSaving) return
    setDisciplineResetConfirmOpen(false)
    setUiPrefsMessage({ type: '', text: '' })
    try {
      setResetDisciplineSaving(true)
      await apiRequest('/api/auth/me', {
        method: 'PATCH',
        token,
        body: { reset_discipline_window: true },
      })
      await refreshUser(token)
      setUiPrefsMessage({
        type: 'success',
        text: 'Discipline window reset. Only new purchases from this point count toward your score.',
      })
      clearUiPrefsMessageSoon()
    } catch (error) {
      setUiPrefsMessage({
        type: 'error',
        text: error?.message || 'Could not reset discipline window.',
      })
    } finally {
      setResetDisciplineSaving(false)
    }
  }

  function handleContactSupport() {
    const subject = encodeURIComponent('PactBank support request')
    const body = encodeURIComponent(
      `Hi PactBank support,\n\nAccount email: ${user?.email || '(not signed in)'}\n\nDescribe your issue:\n\n`
    )
    window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`
  }

  function handleProfileChange(event) {
    const { name, value } = event.target

    setProfileForm((prev) => ({
      ...prev,
      [name]: value,
    }))
  }

  function handleEditProfile() {
    setProfileForm({
      name: user?.name || '',
      email: user?.email || '',
      phone: user?.phone || '',
    })
    setProfileError('')
    setProfileSuccess('')
    setIsEditingProfile(true)
  }

  function handleCancelEdit() {
    setProfileForm({
      name: user?.name || '',
      email: user?.email || '',
      phone: user?.phone || '',
    })
    setProfileError('')
    setProfileSuccess('')
    setIsEditingProfile(false)
  }
  async function handleSaveProfile() {
    if (!token || profileSaving) return

    const nextName = profileForm.name.trim()
    const nextEmail = profileForm.email.trim().toLowerCase()
    const nextPhone = profileForm.phone.trim()

    if (!nextName) {
      setProfileError('Name is required.')
      setProfileSuccess('')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) {
      setProfileError('Enter a valid email address.')
      setProfileSuccess('')
      return
    }

    const body = {}
    if (nextName !== (user?.name || '')) body.name = nextName
    if (nextEmail !== (user?.email || '').toLowerCase()) body.email = nextEmail
    if (nextPhone !== (user?.phone || '')) body.phone = nextPhone

    if (Object.keys(body).length === 0) {
      setIsEditingProfile(false)
      setProfileError('')
      setProfileSuccess('')
      return
    }

    setProfileSaving(true)
    setProfileError('')
    setProfileSuccess('')
    try {
      await apiRequest('/api/auth/me', { method: 'PATCH', token, body })
      await refreshUser(token)
      setProfileSuccess('Profile updated.')
      setIsEditingProfile(false)
    } catch (error) {
      setProfileError(error?.message || 'Could not update profile.')
    } finally {
      setProfileSaving(false)
    }
  }

  return (
    <div className="dashboard-shell settings-shell">
      <DashboardTopbar navAriaLabel="Primary" />

      <section className="dashboard-hero settings-hero">
        <div className="dashboard-hero-copy settings-hero-copy">
  
          <h1 className="dashboard-title settings-title">Settings</h1>
          <p className="dashboard-subtitle settings-subtitle">
            Profile, notifications, accountability partners, app preferences, and account shortcuts.
          </p>

        </div>
      </section>

      <section className="settings-overview">
        <div className="settings-grid">
          <section className="dashboard-card settings-card settings-card-account">
            <div className="settings-section-header">
              <div>
                <p className="settings-section-kicker">Profile</p>
                <h2>Personal account</h2>
              </div>
              <button 
                type="button" 
                className="settings-ghost-button"
                onClick={handleEditProfile}
                >
                  
                Edit profile
              </button>
            </div>

            <div className="settings-profile-panel">
              <div className="settings-profile-avatar" aria-hidden="true">
                {firstInitial}
              </div>

              <div className="settings-profile-copy">
                <h3>{user?.name || 'PactBank member'}</h3>
                <p>{user?.email || 'No email on file'}</p>
                <span className="settings-profile-meta">Personal account</span>
              </div>
            </div>

            {isEditingProfile ? (
              <div className="settings-profile-form">
                <label className="settings-field">
                  <span>Name</span>
                  <input
                    className="settings-input"
                    name="name"
                    value={profileForm.name}
                    onChange={handleProfileChange}
                    placeholder="Your full name"
                  />
                </label>

                <label className="settings-field">
                  <span>Email</span>
                  <input
                    className="settings-input"
                    type="email"
                    name="email"
                    value={profileForm.email}
                    onChange={handleProfileChange}
                    placeholder="you@example.com"
                  />
                </label>

                <label className="settings-field">
                  <span>Phone number</span>
                  <input
                    className="settings-input"
                    name="phone"
                    value={profileForm.phone}
                    onChange={handleProfileChange}
                    placeholder="Add a phone number"
                  />
                </label>

                <div className="settings-form-actions">
                  <button
                    type="button"
                    className="settings-primary-button"
                    onClick={handleSaveProfile}
                    disabled={profileSaving}
                  >
                    {profileSaving ? 'Saving...' : 'Save changes'}
                  </button>

                  <button
                    type="button"
                    className="settings-ghost-button"
                    onClick={handleCancelEdit}
                  >
                    Cancel
                  </button>
                </div>

                {profileError ? (
                  <p className="settings-form-feedback is-error">{profileError}</p>
                ) : null}

                {profileSuccess ? (
                  <p className="settings-form-feedback is-success">{profileSuccess}</p>
                ) : null}
              </div>
            ) : (
              <div className="settings-list settings-detail-list">
                <div className="settings-detail-row">
                  <span>Name</span>
                  <strong>{user?.name || 'Not added'}</strong>
                </div>
                <div className="settings-detail-row">
                  <span>Email</span>
                  <strong>{user?.email || 'Not added'}</strong>
                </div>
                <div className="settings-detail-row">
                  <span>Phone number</span>
                  <strong>{user?.phone || 'Not added'}</strong>
                </div>
                <div className="settings-detail-row">
                  <span>Member since</span>
                  <strong>{formatMemberSince(user?.created_at)}</strong>
                </div>
              </div>
            )}
          </section>

          <section className="dashboard-card settings-card settings-card-prominent settings-card-notifications">
            <div className="settings-section-header">
              <div>
                <p className="settings-section-kicker">Notifications</p>
                <h2>Alerts and reports</h2>
              </div>
            </div>

            <div className="settings-list settings-stack">
              <p className="settings-support-lede">
                Accountability emails are active when you add a partner and break a pact.
                Additional notification preferences (discipline alerts, weekly overview,
                pact reminders, product updates) are coming soon.
              </p>
              <RowAction
                label="Accountability partner emails"
                detail="Active — configure partners under Accountability above."
                badge="Active"
                chevron={false}
                disabled
              />
              <RowAction
                label="More notification controls"
                detail="Discipline alerts, weekly overview, pact reminders, product updates."
                badge="Coming soon"
                chevron={false}
                disabled
              />
            </div>
          </section>

          <section className="dashboard-card settings-card settings-card-partners">
            <div className="settings-section-header">
              <div>
                <p className="settings-section-kicker">Accountability</p>
                <h2>Accountability partners</h2>
                <p className="settings-support-lede" style={{ marginTop: '0.5rem' }}>
                  People listed here may receive emails when a purchase breaks an active pact. You can remove a partner
                  anytime.
                </p>
              </div>
            </div>

            <div className="settings-control-stack" style={{ paddingTop: 0 }}>
              <div className="settings-control-group" style={{ marginBottom: '0.85rem' }}>
                <div className="settings-control-label-row" style={{ marginBottom: '0.85rem' }}>
                  <span className="settings-control-label">
                    {editingPartnerId ? 'Edit partner' : 'Add a partner'}
                  </span>
                </div>

                <div className="settings-profile-form" style={{ paddingTop: 0 }}>
                  <label className="settings-field">
                    <span>Partner name</span>
                    <input
                      className="settings-input"
                      value={partnerForm.partner_name}
                      onChange={(event) =>
                        setPartnerForm((prev) => ({ ...prev, partner_name: event.target.value }))
                      }
                      placeholder="Alex"
                    />
                  </label>

                  <label className="settings-field">
                    <span>Partner email</span>
                    <input
                      className="settings-input"
                      type="email"
                      value={partnerForm.partner_email}
                      onChange={(event) =>
                        setPartnerForm((prev) => ({ ...prev, partner_email: event.target.value }))
                      }
                      placeholder="alex@example.com"
                    />
                  </label>

                  <label className="settings-field">
                    <span>Relationship</span>
                    <input
                      className="settings-input"
                      value={partnerForm.relationship_label}
                      onChange={(event) =>
                        setPartnerForm((prev) => ({ ...prev, relationship_label: event.target.value }))
                      }
                      placeholder="Friend, sibling, coach"
                    />
                  </label>

                  <div className="settings-form-actions">
                    <button
                      type="button"
                      className="settings-primary-button"
                      onClick={handleSavePartner}
                      disabled={partnerSaving}
                    >
                      {partnerSaving ? 'Saving...' : editingPartnerId ? 'Save changes' : 'Add partner'}
                    </button>

                    {editingPartnerId ? (
                      <button type="button" className="settings-ghost-button" onClick={resetPartnerForm}>
                        Cancel
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>

              {partners.length === 0 ? (
                <p className="settings-support-lede">No accountability partners on file.</p>
              ) : (
                partners.map((partner) => {
                  const label = partner.partner_name || partner.partner_email || 'Partner'
                  return (
                    <div key={partner.id} className="settings-partner-card">
                      <div className="settings-row-copy">
                        <h3 style={{ fontSize: '1.05rem' }}>{label}</h3>
                        <p className="settings-support-lede" style={{ marginTop: '0.25rem' }}>
                          {partner.partner_email}
                          {partner.relationship_label ? ` · ${partner.relationship_label}` : ''}
                        </p>
                        {partner.is_active === false ? (
                          <span className="settings-partner-badge">Inactive</span>
                        ) : (
                          <span className="settings-partner-badge">Active</span>
                        )}
                      </div>
                      <div className="settings-partner-actions" style={{ marginTop: '0.75rem' }}>
                        <button
                          type="button"
                          className="settings-ghost-button"
                          disabled={Boolean(partnerPendingDelete)}
                          onClick={() => beginEditPartner(partner)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="settings-button-danger"
                          disabled={deletingPartnerId === partner.id || Boolean(partnerPendingDelete)}
                          onClick={() => requestDeletePartner(partner)}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  )
                })
              )}
              {partnerError ? <p className="settings-form-feedback is-error">{partnerError}</p> : null}
              {partnerSuccess ? <p className="settings-form-feedback is-success">{partnerSuccess}</p> : null}
            </div>

            {partnerPendingDelete ? (
              <div
                className="settings-modal-overlay"
                role="presentation"
                onClick={cancelDeletePartner}
              >
                <div
                  className="settings-modal"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="settings-remove-partner-title"
                  onClick={(e) => e.stopPropagation()}
                >
                  <h3 id="settings-remove-partner-title" className="settings-modal-title">
                    Remove partner?
                  </h3>
                  <p className="settings-support-lede">
                    Remove{' '}
                    <strong>
                      {partnerPendingDelete.partner_name || partnerPendingDelete.partner_email || 'this partner'}
                    </strong>{' '}
                    from accountability alert emails. You can add a partner again anytime from My Pacts.
                  </p>
                  <div className="settings-form-actions" style={{ marginTop: '1rem' }}>
                    <button type="button" className="settings-ghost-button" onClick={cancelDeletePartner}>
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="settings-button-danger"
                      disabled={deletingPartnerId !== null}
                      onClick={confirmDeletePartner}
                    >
                      {deletingPartnerId ? 'Removing…' : 'Remove partner'}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </section>

          <section className="dashboard-card settings-card settings-card-partners">
            <div className="settings-section-header">
              <div>
                <p className="settings-section-kicker">Bank connections</p>
                <h2>Connected banks</h2>
                <p className="settings-support-lede" style={{ marginTop: '0.5rem' }}>
                  Reconnect a bank when Plaid asks you to re-authenticate. Disconnecting
                  stops future syncs but keeps your existing transaction history.
                </p>
              </div>
            </div>
            <PlaidItemsSection token={token} />
          </section>

          <section className="dashboard-card settings-card settings-card-security">
            <div className="settings-section-header">
              <div>
                <p className="settings-section-kicker">Security</p>
                <h2>Login and protection</h2>
              </div>
            </div>

            <div className="settings-list settings-stack">
              <ToggleRow
                label={
                  user?.card_locked
                    ? 'Card is locked'
                    : isSandbox
                      ? 'Lock card (simulation)'
                      : 'Lock card'
                }
                description={
                  user?.card_locked
                    ? 'New purchases are blocked. Plaid-synced charges will be flagged with "card_was_locked".'
                    : isSandbox
                      ? 'Block new simulated purchases and flag any real Plaid charges while locked.'
                      : 'Block new purchases and flag any Plaid charges that arrive while locked.'
                }
                checked={Boolean(user?.card_locked)}
                onChange={handleToggleCardLock}
              />
              {cardLockSaving ? (
                <p className="settings-inline-note">Saving...</p>
              ) : null}
              {cardLockError ? (
                <p className="settings-inline-note is-error">{cardLockError}</p>
              ) : null}
              {securityRows.map((row) => (
                <RowAction
                  key={row.label}
                  label={row.label}
                  detail={row.detail}
                  badge={row.badge}
                  to={row.to}
                  disabled={row.disabled}
                  chevron={!row.disabled}
                />
              ))}
            </div>
          </section>

          <section className="dashboard-card settings-card settings-card-preferences">
            <div className="settings-section-header">
              <div>
                <p className="settings-section-kicker">Preferences</p>
                <h2>App experience</h2>
              </div>
            </div>

            <div className="settings-list settings-control-stack">
              <div className="settings-control-group" style={{ borderTop: 'none', paddingTop: 0 }}>
                <div className="settings-control-label-row">
                  <span className="settings-control-label">Go to</span>
                </div>
                <div className="settings-quick-links">
                  <Link className="settings-quick-link" to="/dashboard">
                    Dashboard →
                  </Link>
                  <Link className="settings-quick-link" to="/pacts">
                    My Pacts →
                  </Link>
                  <Link className="settings-quick-link" to="/transactions">
                    Transactions →
                  </Link>
                </div>
              </div>

              <div className="settings-control-group">
                <div className="settings-control-label-row">
                  <span className="settings-control-label">Pacts & discipline UI</span>
                </div>
                <p className="settings-support-lede">
                  Discipline mode shows score bands (Strong → Broken) on Pacts. Classic keeps the layout minimal.
                </p>
                <div className="settings-segmented-control" role="tablist" aria-label="Pacts UI mode">
                  <button
                    type="button"
                    className={`settings-segment ${user?.discipline_ui_mode !== 'classic' ? 'is-active' : ''}`}
                    aria-pressed={user?.discipline_ui_mode !== 'classic'}
                    disabled={disciplineUiModeSaving}
                    onClick={() => handleDisciplineUiModeChange('discipline')}
                  >
                    Discipline
                  </button>
                  <button
                    type="button"
                    className={`settings-segment ${user?.discipline_ui_mode === 'classic' ? 'is-active' : ''}`}
                    aria-pressed={user?.discipline_ui_mode === 'classic'}
                    disabled={disciplineUiModeSaving}
                    onClick={() => handleDisciplineUiModeChange('classic')}
                  >
                    Classic
                  </button>
                </div>
              </div>

              <div className="settings-control-group">
                <div className="settings-control-label-row">
                  <span className="settings-control-label">Dashboard video background</span>
                </div>
                <p className="settings-support-lede">
                  Dynamic follows your discipline score (sunny, stormy, etc.). Calm sky keeps the neutral video; tier
                  colors still tint cards when enabled.
                </p>
                <div className="settings-segmented-control" role="tablist" aria-label="Dashboard background">
                  <button
                    type="button"
                    className={`settings-segment ${!user?.dashboard_force_sky ? 'is-active' : ''}`}
                    aria-pressed={!user?.dashboard_force_sky}
                    disabled={dashboardSkySaving}
                    onClick={() => handleDashboardForceSkyChange(false)}
                  >
                    Dynamic
                  </button>
                  <button
                    type="button"
                    className={`settings-segment ${user?.dashboard_force_sky ? 'is-active' : ''}`}
                    aria-pressed={Boolean(user?.dashboard_force_sky)}
                    disabled={dashboardSkySaving}
                    onClick={() => handleDashboardForceSkyChange(true)}
                  >
                    Calm sky
                  </button>
                </div>
              </div>

              <div className="settings-control-group">
                <div className="settings-control-label-row">
                  <span className="settings-control-label">Reset discipline baseline</span>
                </div>
                <p className="settings-support-lede">
                  Moves your discipline start time to now. Your score recomputes from zero window purchases (usually
                  100 until new spending arrives). Transaction history is not deleted.
                </p>
                <button
                  type="button"
                  className="settings-button-danger"
                  style={{ width: 'fit-content' }}
                  disabled={resetDisciplineSaving}
                  onClick={requestResetDisciplineWindow}
                >
                  {resetDisciplineSaving ? 'Resetting…' : 'Reset discipline window'}
                </button>
              </div>

              <SegmentedControl
                label="Display theme (local)"
                value={theme}
                onChange={setTheme}
                options={['Light', 'Dark', 'System']}
              />

              <SegmentedControl
                label="Density (local)"
                value={density}
                onChange={setDensity}
                options={['Comfortable', 'Compact']}
              />

              <label className="settings-control-group">
                <div className="settings-control-label-row">
                  <span className="settings-control-label">Date format</span>
                </div>
                <select
                  className="settings-select"
                  value={dateFormat}
                  onChange={(event) => setDateFormat(event.target.value)}
                >
                  <option>Month / Day / Year</option>
                  <option>Day / Month / Year</option>
                  <option>Year / Month / Day</option>
                </select>
              </label>

              <label className="settings-control-group">
                <div className="settings-control-label-row">
                  <span className="settings-control-label">Currency</span>
                </div>
                <select
                  className="settings-select"
                  value={currency}
                  onChange={(event) => setCurrency(event.target.value)}
                >
                  <option>USD ($)</option>
                  <option>EUR (€)</option>
                  <option>GBP (£)</option>
                  <option>CAD (C$)</option>
                </select>
              </label>

              {uiPrefsMessage.text ? (
                <p
                  className={`settings-form-feedback ${uiPrefsMessage.type === 'error' ? 'is-error' : 'is-success'}`}
                >
                  {uiPrefsMessage.text}
                </p>
              ) : null}
            </div>
          </section>

          <section className="dashboard-card settings-card settings-card-privacy">
            <div className="settings-section-header">
              <div>
                <p className="settings-section-kicker">Privacy</p>
                <h2>Data and account controls</h2>
              </div>
            </div>

            <div className="settings-list settings-stack">
              <RowAction
                label="Download my data"
                detail="Export a copy of your personal account records."
              />
              <div className="settings-danger-block">
                <RowAction
                  label="Delete account"
                  detail="Permanently remove your account and profile information."
                  danger
                />
              </div>
            </div>
          </section>

          <section className="dashboard-card settings-card settings-card-support">
            <div className="settings-section-header">
              <div>
                <p className="settings-section-kicker">Support</p>
                <h2>Help &amp; product</h2>
              </div>
            </div>

            <div className="settings-support-actions">
              <p className="settings-support-lede">
                Need help with Plaid, accountability emails, or your account? Reach the team directly.
              </p>
              <button type="button" className="settings-primary-button" onClick={handleContactSupport}>
                Contact support
              </button>
              <p className="settings-form-feedback" style={{ color: '#6b6670', fontSize: '0.85rem' }}>
                Opens your email app — messages go to {SUPPORT_EMAIL}. Set <code>VITE_SUPPORT_EMAIL</code> in{' '}
                <code>frontend/.env</code> to customize.
              </p>
            </div>

            <div className="settings-list settings-stack">
              <RowAction
                label="PactBank for Web"
                detail={appConfig.app_version ? `Version ${appConfig.app_version}` : 'Version —'}
                chevron={false}
                disabled
              />
              <RowAction
                label="Terms of service"
                detail="Add your organization’s legal URL in deployment config when you ship publicly."
                chevron={false}
                disabled
              />
              <RowAction
                label="Privacy policy"
                detail="Document how you store Plaid and profile data for your users."
                chevron={false}
                disabled
              />
            </div>
          </section>
        </div>
      </section>

      {disciplineResetConfirmOpen ? (
        <div
          className="settings-modal-overlay"
          role="presentation"
          onClick={() => setDisciplineResetConfirmOpen(false)}
        >
          <div
            className="settings-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-discipline-reset-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="settings-discipline-reset-title" className="settings-modal-title">
              Reset discipline window?
            </h3>
            <p className="settings-support-lede">
              Start discipline scoring fresh from now. Purchases before this moment
              no longer affect your score. Transaction history is not deleted.
            </p>
            <div className="settings-form-actions" style={{ marginTop: '1rem' }}>
              <button
                type="button"
                className="settings-ghost-button"
                onClick={() => setDisciplineResetConfirmOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="settings-button-danger"
                disabled={resetDisciplineSaving}
                onClick={confirmResetDisciplineWindow}
              >
                {resetDisciplineSaving ? 'Resetting…' : 'Reset window'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
