import { useEffect, useState } from 'react'
import { useAuth } from '../features/auth/context'
import DashboardTopbar from '../components/DashboardTopbar'
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

const securityRows = [
  {
    label: 'Change password',
    detail: 'Update your password regularly to keep your account protected.',
    badge: 'Recommended',
  },
  {
    label: 'Two-factor authentication',
    detail: 'Add another layer of protection to sign-in.',
    badge: 'Coming soon',
  },
  {
    label: 'Login activity',
    detail: 'Review recent sign-ins across your devices and sessions.',
  },
]

const supportRows = [
  {
    label: 'PactBank for Web',
    detail: 'Version 0.9.4',
  },
  {
    label: 'Terms of service',
    detail: 'Review the current service terms and responsibilities.',
  },
  {
    label: 'Privacy policy',
    detail: 'Read how your information is handled and protected.',
  },
]

function formatMemberSince(value) {
  if (!value) return 'Recently joined'

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return 'Recently joined'

  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
  }).format(parsed)
}



function RowAction({ label, detail, badge, danger = false, chevron = true }) {
  return (
    <button
      type="button"
      className={`settings-row settings-action-row ${danger ? 'is-danger' : ''}`}
    >
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
  const { user } = useAuth()

  const [isEditingProfile, setIsEditingProfile] = useState(false)
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileError, setProfileError] = useState('')
  const [profileSuccess, setProfileSuccess] = useState('')

  const [profileForm, setProfileForm] = useState({
    name: '',
    email: '',
    phone: '',
  })

  const [activeTab, setActiveTab] = useState('Profile')
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

  useEffect(() => {
    if (!user) return 
    
    setProfileForm({
      name: user.name || '',
      email: user.email || '',
      phone: user.phone || '',
    })
  }, [user])

  const userLabel = user?.name || user?.email || 'User'
  const firstInitial = userLabel.charAt(0).toUpperCase()

  function toggleNotification(key) {
    setNotifications((current) => ({
      ...current,
      [key]: !current[key],
    }))
  }

  function handleProfileChange(event) {
    const { name, value } = event.target

    setProfileForm((prev) => ({
      ...prev,
      [name]: value,
    }))
  }

  function handleEditProfile() {
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
            Manage your profile, alerts, security, and preferences.
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
              <SegmentedControl
                label="Theme"
                value={theme}
                onChange={setTheme}
                options={['Light', 'Dark', 'System']}
              />

              <SegmentedControl
                label="Density"
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
                <h2>PactBank info</h2>
              </div>
            </div>

            <div className="settings-list settings-stack">
              {supportRows.map((row) => (
                <RowAction key={row.label} label={row.label} detail={row.detail} />
              ))}
            </div>
          </section>
        </div>
      </section>
    </div>
  )
}
