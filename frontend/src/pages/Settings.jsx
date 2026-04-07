import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../features/auth/context'
import { apiRequest } from '../lib/api/client'
import DashboardTopbar from '../components/DashboardTopbar'
import {
  createAccountabilityPartner,
  deleteAccountabilityPartner,
  getAccountabilityAlertSettings,
  listAccountabilityPartners,
  updateAccountabilityAlertSettings,
  updateAccountabilityPartner,
} from '../features/accountability-partners/api'
import '../dashboard.css'
import '../settings.css'

const notificationOptions = [
  {
    key: 'disciplineAlerts',
    label: 'Discipline alerts',
    description: 'Get notified when activity may conflict with one of your active rules.',
  },
  {
    key: 'weeklyOverview',
    label: 'Weekly overview summary',
    description: 'Receive a concise weekly snapshot of trends, wins, and review items.',
  },
  {
    key: 'pactReminders',
    label: 'Pact reminders',
    description: 'Stay aligned with reminder nudges tied to your selected commitments.',
  },
  {
    key: 'productUpdates',
    label: 'Product updates',
    description: 'Hear about thoughtful improvements and new features from PactBank.',
  },
]

const APP_VERSION = '0.9.4'

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

  const [isEditingProfile, setIsEditingProfile] = useState(false)
  const [profileSaving, _setProfileSaving] = useState(false)
  const [profileError, setProfileError] = useState('')
  const [profileSuccess, setProfileSuccess] = useState('')

  const [profileForm, setProfileForm] = useState({
    name: '',
    email: '',
    phone: '',
  })

  const [_activeTab, _setActiveTab] = useState('Profile')
  const [notifications, setNotifications] = useState({
    disciplineAlerts: true,
    weeklyOverview: true,
    pactReminders: true,
    productUpdates: false,
  })
  const [theme, setTheme] = useState('System')
  const [density, setDensity] = useState('Comfortable')
  const [dateFormat, setDateFormat] = useState('Month / Day / Year')
  const [currency, setCurrency] = useState('USD ($)')
  const [disciplineUiModeSaving, setDisciplineUiModeSaving] = useState(false)
  const [dashboardSkySaving, setDashboardSkySaving] = useState(false)
  const [defaultSavingsPercent, setDefaultSavingsPercent] = useState(0)
  const [savingsSaving, setSavingsSaving] = useState(false)
  const [resetDisciplineSaving, setResetDisciplineSaving] = useState(false)
  const [uiPrefsMessage, setUiPrefsMessage] = useState({ type: '', text: '' })
  const [partners, setPartners] = useState([])
  const [deletingPartnerId, setDeletingPartnerId] = useState(null)
  const [partnerForm, setPartnerForm] = useState({
    partner_name: '',
    partner_email: '',
    relationship_label: '',
    is_active: true,
  })
  const [editingPartnerId, setEditingPartnerId] = useState(null)
  const [partnerError, setPartnerError] = useState('')
  const [partnerSuccess, setPartnerSuccess] = useState('')
  const [alertSettings, setAlertSettings] = useState({
    alerts_enabled: true,
    custom_subject_template: '',
    custom_body_template: '',
    custom_message: '',
  })


  const userLabel = user?.name || user?.email || 'User'
  const firstInitial = userLabel.charAt(0).toUpperCase()

  function toggleNotification(key) {
    setNotifications((current) => ({
      ...current,
      [key]: !current[key],
    }))
  }
  useEffect(() => {
    if (token) {
      refreshUser(token)
    }
  }, [refreshUser, token])

  useEffect(() => {
    if (user?.discipline_savings_percentage != null && !Number.isNaN(Number(user.discipline_savings_percentage))) {
      setDefaultSavingsPercent(Number(user.discipline_savings_percentage))
    }
  }, [user?.discipline_savings_percentage])

  useEffect(() => {
    async function loadAccountabilityData() {
      if (!token) {
        setPartners([])
        return
      }
      try {
        const [partnersResult, settingsResult] = await Promise.all([
          listAccountabilityPartners(token),
          getAccountabilityAlertSettings(token),
        ])
        setPartners(partnersResult || [])
        if (settingsResult) {
          setAlertSettings({
            alerts_enabled: Boolean(settingsResult.alerts_enabled),
            custom_subject_template: settingsResult.custom_subject_template || '',
            custom_body_template: settingsResult.custom_body_template || '',
            custom_message: settingsResult.custom_message || '',
          })
        }
      } catch {
        setPartnerError('Failed to load accountability settings.')
      }
    }
    loadAccountabilityData()
  }, [token])

  function handlePartnerFormChange(event) {
    const { name, value, type, checked } = event.target
    setPartnerForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }))
  }

  function resetPartnerForm() {
    setPartnerForm({
      partner_name: '',
      partner_email: '',
      relationship_label: '',
      is_active: true,
    })
    setEditingPartnerId(null)
  }

  function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
  }

  async function handleSavePartner() {
    if (!token) return
    setPartnerError('')
    setPartnerSuccess('')
    if (!isValidEmail(partnerForm.partner_email)) {
      setPartnerError('Enter a valid partner email address.')
      return
    }
    try {
      const payload = {
        partner_name: partnerForm.partner_name || null,
        partner_email: partnerForm.partner_email.trim().toLowerCase(),
        relationship_label: partnerForm.relationship_label || null,
        is_active: partnerForm.is_active,
      }
      if (editingPartnerId) {
        const updated = await updateAccountabilityPartner(editingPartnerId, payload, token)
        setPartners((prev) => prev.map((p) => (p.id === editingPartnerId ? updated : p)))
        setPartnerSuccess('Partner updated.')
      } else {
        const created = await createAccountabilityPartner(payload, token)
        setPartners((prev) => [created, ...prev])
        setPartnerSuccess('Partner added.')
      }
      resetPartnerForm()
    } catch (error) {
      setPartnerError(error?.message || 'Could not save partner.')
    }
  }

  async function handleDeletePartner(partner) {
    if (!token || !partner?.id) return
    const label = partner.partner_name || partner.partner_email || 'this partner'
    if (
      !window.confirm(
        `Remove ${label} from accountability partners? They will stop receiving pact alert emails.`
      )
    ) {
      return
    }
    setPartnerError('')
    setPartnerSuccess('')
    setDeletingPartnerId(partner.id)
    try {
      await deleteAccountabilityPartner(partner.id, token)
      setPartners((prev) => prev.filter((p) => p.id !== partner.id))
      setPartnerSuccess('Partner removed.')
      if (editingPartnerId === partner.id) {
        resetPartnerForm()
      }
    } catch (error) {
      setPartnerError(error?.message || 'Could not remove partner.')
    } finally {
      setDeletingPartnerId(null)
    }
  }

  function handleEditPartner(partner) {
    setEditingPartnerId(partner.id)
    setPartnerForm({
      partner_name: partner.partner_name || '',
      partner_email: partner.partner_email || '',
      relationship_label: partner.relationship_label || '',
      is_active: Boolean(partner.is_active),
    })
  }

  async function handleSaveAlertSettings() {
    if (!token) return
    setPartnerError('')
    setPartnerSuccess('')
    try {
      const saved = await updateAccountabilityAlertSettings(alertSettings, token)
      setAlertSettings({
        alerts_enabled: Boolean(saved.alerts_enabled),
        custom_subject_template: saved.custom_subject_template || '',
        custom_body_template: saved.custom_body_template || '',
        custom_message: saved.custom_message || '',
      })
      setPartnerSuccess('Alert settings saved.')
    } catch (error) {
      setPartnerError(error?.message || 'Could not save alert settings.')
    }
  }

  function handleAlertSettingsChange(event) {
    const { name, value, type, checked } = event.target
    setAlertSettings((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }))
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

  async function handleSaveDefaultSavings() {
    if (!token || savingsSaving) return
    const n = Number(defaultSavingsPercent)
    if (Number.isNaN(n) || n < 0 || n > 100) {
      setUiPrefsMessage({ type: 'error', text: 'Enter a percentage between 0 and 100.' })
      return
    }
    setUiPrefsMessage({ type: '', text: '' })
    try {
      setSavingsSaving(true)
      await apiRequest('/api/auth/me', {
        method: 'PATCH',
        token,
        body: { discipline_savings_percentage: n },
      })
      await refreshUser(token)
      setUiPrefsMessage({ type: 'success', text: 'Default savings percentage saved for new rules.' })
      clearUiPrefsMessageSoon()
    } catch (error) {
      setUiPrefsMessage({
        type: 'error',
        text: error?.message || 'Could not save default savings percentage.',
      })
    } finally {
      setSavingsSaving(false)
    }
  }

  async function handleResetDisciplineWindow() {
    if (!token || resetDisciplineSaving) return
    if (
      !window.confirm(
        'Start discipline scoring fresh from now? Purchases before this moment will no longer affect your score (history is unchanged).'
      )
    ) {
      return
    }
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

  const previewSubject = alertSettings.custom_subject_template || 'Accountability Alert'
  const previewBodyTemplate =
    alertSettings.custom_body_template ||
    'Hi {partner_name}, a flagged purchase was detected in category {category} for ${amount} at {merchant}. Message from me: {custom_message}'
  const previewBody = previewBodyTemplate
    .replaceAll('{partner_name}', partnerForm.partner_name || 'Accountability Partner')
    .replaceAll('{user_name}', user?.name || user?.email || 'User')
    .replaceAll('{category}', 'gambling')
    .replaceAll('{amount}', '25.99')
    .replaceAll('{merchant}', 'Example Merchant')
    .replaceAll('{description}', 'Example transaction')
    .replaceAll('{transaction_date}', new Date().toISOString().slice(0, 10))
    .replaceAll('{custom_message}', alertSettings.custom_message || 'Please check in with me.')

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
    try {
      console.log('Saving profile:', profileForm)

      /*
        TODO LATER:
        Example:
        const updatedUser = await updateProfile(profileForm)
        Then update your auth context / user state with updatedUser
      */

      setIsEditingProfile(false)
    } catch (error) {
      console.error('Failed to save profile:', error)
    }
  }

  return (
    <div className="dashboard-shell settings-shell">
      <DashboardTopbar navAriaLabel="Primary" />

      <section className="dashboard-hero settings-hero">
        <div className="dashboard-hero-copy settings-hero-copy">
  
          <h1 className="dashboard-title settings-title">Settings</h1>
          <p className="dashboard-subtitle settings-subtitle">
            Profile, notifications, accountability partners, Pacts appearance, and account shortcuts.
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
              {notificationOptions.map((option) => (
                <ToggleRow
                  key={option.key}
                  label={option.label}
                  description={option.description}
                  checked={notifications[option.key]}
                  onChange={() => toggleNotification(option.key)}
                />
              ))}
            </div>
          </section>

          <section className="dashboard-card settings-card settings-card-partners">
            <div className="settings-section-header">
              <div>
                <p className="settings-section-kicker">Accountability partners</p>
                <h2>Who gets alert emails</h2>
                <p className="settings-support-lede" style={{ marginTop: '0.5rem' }}>
                  Partners receive emails when a purchase breaks an active pact. Manage the list here or tune templates
                  below.
                </p>
              </div>
            </div>

            <div className="settings-control-stack" style={{ paddingTop: 0 }}>
              <p className="settings-control-label" style={{ margin: '0 0 0.35rem' }}>
                Your partners ({partners.length})
              </p>
              {partners.length === 0 ? (
                <p className="settings-support-lede">No partners yet. Add someone you trust below.</p>
              ) : (
                partners.map((partner) => (
                  <div key={partner.id} className="settings-partner-card">
                    <div className="settings-row-copy">
                      <h3 style={{ fontSize: '1.05rem' }}>{partner.partner_name || partner.partner_email}</h3>
                      <p>
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
                        onClick={() => handleEditPartner(partner)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="settings-button-danger"
                        disabled={deletingPartnerId === partner.id}
                        onClick={() => handleDeletePartner(partner)}
                      >
                        {deletingPartnerId === partner.id ? 'Removing…' : 'Remove partner'}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="settings-list settings-control-stack">
              <p className="settings-section-kicker" style={{ marginBottom: '0.25rem' }}>
                Email templates
              </p>
              <label className="settings-field">
                <span>Enable accountability alerts</span>
                <input
                  type="checkbox"
                  name="alerts_enabled"
                  checked={alertSettings.alerts_enabled}
                  onChange={handleAlertSettingsChange}
                />
              </label>
              <label className="settings-field">
                <span>Custom subject template</span>
                <input
                  className="settings-input"
                  name="custom_subject_template"
                  value={alertSettings.custom_subject_template}
                  onChange={handleAlertSettingsChange}
                  placeholder="Accountability Alert"
                />
              </label>
              <label className="settings-field">
                <span>Custom body template</span>
                <textarea
                  className="settings-input"
                  name="custom_body_template"
                  value={alertSettings.custom_body_template}
                  onChange={handleAlertSettingsChange}
                  placeholder="Hi {partner_name}, a flagged purchase in {category} was detected..."
                  rows={4}
                />
              </label>
              <label className="settings-field">
                <span>Custom message</span>
                <input
                  className="settings-input"
                  name="custom_message"
                  value={alertSettings.custom_message}
                  onChange={handleAlertSettingsChange}
                  placeholder="Please check in with me."
                />
              </label>
              <div className="settings-detail-row">
                <span>Email preview subject</span>
                <strong>{previewSubject}</strong>
              </div>
              <div className="settings-detail-row">
                <span>Email preview body</span>
                <strong style={{ display: 'block', maxWidth: '100%', whiteSpace: 'normal' }}>{previewBody}</strong>
              </div>
              <button type="button" className="settings-primary-button" onClick={handleSaveAlertSettings}>
                Save alert templates
              </button>
            </div>

            <div className="settings-list settings-control-stack">
              <p className="settings-section-kicker" style={{ marginBottom: '0.25rem' }}>
                {editingPartnerId ? 'Edit partner' : 'Add a partner'}
              </p>
              <label className="settings-field">
                <span>Display name</span>
                <input
                  className="settings-input"
                  name="partner_name"
                  value={partnerForm.partner_name}
                  onChange={handlePartnerFormChange}
                  placeholder="e.g. Alex"
                />
              </label>
              <label className="settings-field">
                <span>Partner email</span>
                <input
                  className="settings-input"
                  type="email"
                  name="partner_email"
                  value={partnerForm.partner_email}
                  onChange={handlePartnerFormChange}
                  placeholder="partner@email.com"
                />
              </label>
              <label className="settings-field">
                <span>Relationship (optional)</span>
                <input
                  className="settings-input"
                  name="relationship_label"
                  value={partnerForm.relationship_label}
                  onChange={handlePartnerFormChange}
                  placeholder="e.g. spouse, friend"
                />
              </label>
              <label className="settings-field" style={{ flexDirection: 'row', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ flex: 1 }}>Partner can receive alerts</span>
                <input type="checkbox" name="is_active" checked={partnerForm.is_active} onChange={handlePartnerFormChange} />
              </label>
              <div className="settings-form-actions">
                <button type="button" className="settings-primary-button" onClick={handleSavePartner}>
                  {editingPartnerId ? 'Save changes' : 'Add partner'}
                </button>
                {editingPartnerId ? (
                  <button type="button" className="settings-ghost-button" onClick={resetPartnerForm}>
                    Cancel
                  </button>
                ) : null}
              </div>
              {partnerError ? <p className="settings-form-feedback is-error">{partnerError}</p> : null}
              {partnerSuccess ? <p className="settings-form-feedback is-success">{partnerSuccess}</p> : null}
            </div>
          </section>

          <section className="dashboard-card settings-card settings-card-security">
            <div className="settings-section-header">
              <div>
                <p className="settings-section-kicker">Security</p>
                <h2>Login and protection</h2>
              </div>
            </div>

            <div className="settings-list settings-stack">
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
                  onClick={handleResetDisciplineWindow}
                >
                  {resetDisciplineSaving ? 'Resetting…' : 'Reset discipline window'}
                </button>
              </div>

              <label className="settings-control-group">
                <div className="settings-control-label-row">
                  <span className="settings-control-label">Default pact savings %</span>
                </div>
                <p className="settings-support-lede">
                  Default percentage moved to savings when a pact is broken (you can still override per pact on Pacts).
                </p>
                <input
                  className="settings-input"
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  value={Number.isFinite(defaultSavingsPercent) ? defaultSavingsPercent : 0}
                  onChange={(e) => {
                    const next = parseFloat(e.target.value)
                    setDefaultSavingsPercent(Number.isFinite(next) ? next : 0)
                  }}
                />
                <button
                  type="button"
                  className="settings-primary-button"
                  style={{ marginTop: '0.5rem', width: 'fit-content' }}
                  disabled={savingsSaving}
                  onClick={handleSaveDefaultSavings}
                >
                  {savingsSaving ? 'Saving…' : 'Save default'}
                </button>
              </label>

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
              <RowAction label="PactBank for Web" detail={`Version ${APP_VERSION}`} chevron={false} disabled />
              <RowAction
                label="Terms of service"
                detail="Add your organization’s legal URL in deployment config when you ship publicly."
                chevron={false}
                disabled
              />
              <RowAction
                label="Privacy policy"
                detail="Document how you store Plaid and profile data for your campus or demo reviewers."
                chevron={false}
                disabled
              />
            </div>
          </section>
        </div>
      </section>
    </div>
  )
}
