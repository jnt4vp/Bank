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

const QUICK_START_SUGGESTIONS = [
  { label: 'Reduce Fast Food', preset: 'Fast Food' },
  { label: 'Limit Shopping', preset: 'Online Shopping' },
  { label: 'Reduce Uber', preset: 'Ride Services' },
]

const ALERT_METHOD_OPTIONS = [
  { value: 'email', label: 'Email alert' },
  { value: 'none', label: 'No alert' },
]

const ALERT_RECIPIENT_OPTIONS = [
  { value: 'self', label: 'Send it to me' },
  { value: 'partner', label: 'Send it to my partner' },
]

const AUTO_LOCK_DELAY_MS = 5 * 60 * 1000
const ALERT_RECIPIENT_TYPES = new Set(['email', 'friend', 'none'])
const PACTS_SKIP_INTRO_KEY = 'pactbank.pacts.skipIntro'

function normalizeAlertRecipientType(raw) {
  const value = String(raw || 'email').toLowerCase()
  return ALERT_RECIPIENT_TYPES.has(value) ? value : 'email'
}

function normalizeCategory(category) {
  if (!category) return 'Other'
  return String(category)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function humanizeAlertRecipient(type, partnerCount = 0) {
  switch (type) {
    case 'friend':
      return partnerCount > 1
        ? `notify ${partnerCount} accountability partners`
        : 'notify your accountability partner'
    case 'none':
      return 'track it quietly'
    case 'email':
    default:
      return 'notify you'
  }
}

function buildConsequenceSummary(type, percent, partnerCount = 0) {
  const savingsPercent = Number(percent) || 0
  const alertCopy = humanizeAlertRecipient(type, partnerCount)

  if (savingsPercent > 0) {
    return `${alertCopy} and save ${savingsPercent}%`
  }

  return alertCopy
}

function buildPreviewSentence({ categoryLabel, type, percent, partnerCount = 0 }) {
  const target = categoryLabel || 'that spending category'
  return `If you spend on ${target}, PactBank will ${buildConsequenceSummary(type, percent, partnerCount)}.`
}

function deriveAlertMethod(type) {
  return type === 'none' ? 'none' : 'email'
}

function deriveAlertRecipient(type) {
  return type === 'friend' ? 'partner' : 'self'
}

function composeAccountabilityType(method, recipient) {
  if (method === 'none') return 'none'
  return recipient === 'partner' ? 'friend' : 'email'
}

function StatusMetric({ label, value }) {
  return (
    <div className="pacts-status-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function StatsRow({
  totalPacts,
  presetPactCount,
  customPactCount,
  activePacts,
  disciplineModeEnabled,
  disciplineUiState,
}) {
  return (
    <section className="dashboard-top-grid">
      <div className="dashboard-card pacts-stat-card">
        <p className="dashboard-card-label">Total Pacts</p>
        <p className="dashboard-stat">{totalPacts}</p>
      </div>

      <div className="dashboard-card pacts-stat-card">
        <p className="dashboard-card-label">Preset Pacts</p>
        <p className="dashboard-stat">{presetPactCount}</p>
      </div>

      <div className="dashboard-card pacts-stat-card">
        <p className="dashboard-card-label">Custom Pacts</p>
        <p className="dashboard-stat">{customPactCount}</p>
      </div>

      <div className="dashboard-card dashboard-card-hero-accent pacts-stat-card pacts-status-card">
        <div className="pacts-status-head">
          <p className="dashboard-card-label">Status</p>
          <span className="pacts-status-dot" aria-hidden="true" />
        </div>
        <p className="dashboard-stat">
          {disciplineModeEnabled ? disciplineUiState.label : 'Stable'}
        </p>
        <p className="pacts-status-copy">0 violations this week</p>
        <p className="dashboard-card-footnote">
          {activePacts > 0 ? 'No recent pact triggers.' : 'Ready for your first pact.'}
        </p>
      </div>
    </section>
  )
}

function EmptyPactsCard({ onSuggestionSelect, onShowIntro }) {
  return (
    <div className="pacts-empty-state-card">
      <div className="pacts-empty-visual" aria-hidden="true">
        <div className="pacts-empty-orb pacts-empty-orb-large" />
        <div className="pacts-empty-orb pacts-empty-orb-small" />
        <div className="pacts-empty-glow" />
      </div>

      <div className="pacts-empty-content">
        <span className="pacts-section-kicker">Your Pacts</span>
        <h3>Create your first pact</h3>
        <p>
          A pact watches a category or merchant and adds a consequence when you slip.
        </p>

        <div className="pacts-suggestion-row">
          {QUICK_START_SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion.label}
              type="button"
              className="pacts-suggestion-chip"
              onClick={() => onSuggestionSelect(suggestion)}
            >
              {suggestion.label}
            </button>
          ))}
        </div>

        <button type="button" className="pacts-inline-link" onClick={onShowIntro}>
          Learn more about pacts
        </button>
      </div>
    </div>
  )
}

function WeeklySummaryCard() {
  return (
    <div className="dashboard-card dashboard-panel pacts-side-info-card">
      <div className="dashboard-panel-header">
        <h2>This Week</h2>
      </div>

      <div className="pacts-weekly-grid">
        <div className="pacts-weekly-stat">
          <strong>0</strong>
          <span>violations</span>
        </div>
        <div className="pacts-weekly-stat">
          <strong>0</strong>
          <span>alerts sent</span>
        </div>
        <div className="pacts-weekly-stat">
          <strong>$0</strong>
          <span>saved</span>
        </div>
      </div>

      <p className="pacts-card-tip">Tip: start with one pact you can realistically stick to.</p>
    </div>
  )
}

function DisciplineTipsCard() {
  return (
    <div className="dashboard-card dashboard-panel pacts-side-info-card">
      <div className="dashboard-panel-header">
        <h2>Tips to Stay Disciplined</h2>
      </div>

      <div className="pacts-tips-list">
        <div className="pacts-tip-item">
          <strong>Start simple.</strong>
          <p>Choose one high-friction category first.</p>
        </div>
        <div className="pacts-tip-item">
          <strong>Use a light penalty.</strong>
          <p>Small percentages are easier to keep long term.</p>
        </div>
        <div className="pacts-tip-item">
          <strong>Pick one partner.</strong>
          <p>One trusted person usually creates the clearest accountability.</p>
        </div>
      </div>
    </div>
  )
}

function QuickLinksCard() {
  return (
    <div className="dashboard-card dashboard-panel pacts-quick-links-card">
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
  )
}

function PactPreviewBox({ previewSentence }) {
  return (
    <div className="pacts-preview-box" aria-live="polite">
      <span className="pacts-section-kicker">Preview</span>
      <p>{previewSentence}</p>
    </div>
  )
}

function BuilderPartnerManager({
  partners,
  selectedPartnerIds,
  onTogglePartner,
  partnersLoading,
  partnerSaving,
  partnerForm,
  setPartnerForm,
  editingPartnerId,
  onStartAdd,
  onEditPartner,
  onSavePartner,
  onCancel,
  showComposer,
  disabled = false,
}) {
  const activePartners = partners.filter((partner) => partner.is_active !== false)
  const [pickerOpen, setPickerOpen] = useState(false)

  return (
    <div className="pacts-builder-partner-card">
      <div className="pacts-builder-partner-head">
        <div>
          <span className="pacts-section-kicker">Accountability Partner</span>
          <h4>Choose who gets the alert</h4>
          <p className="pacts-builder-partner-note">
            Choose one or more accountability partners for this pact.
          </p>
        </div>
        <div className="pacts-builder-partner-head-actions">
          <button type="button" className="pacts-secondary-button" onClick={onStartAdd} disabled={disabled}>
            Add new
          </button>
        </div>
      </div>

      {selectedPartnerIds.length > 0 ? (
        <div className="pacts-builder-partner-summary">
          <strong>
            {selectedPartnerIds.length} partner{selectedPartnerIds.length === 1 ? '' : 's'} selected for this pact
          </strong>
          <p>
            {activePartners
              .filter((partner) => selectedPartnerIds.includes(partner.id))
              .map((partner) => partner.partner_name || partner.partner_email)
              .join(', ')}
          </p>
        </div>
      ) : (
        <div className="pacts-builder-partner-empty">
          <strong>No accountability partner yet</strong>
          <p>Add one below to send pact alerts to a partner.</p>
        </div>
      )}

      {showComposer ? (
        <div className="pacts-builder-partner-form">
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
          </div>

          <label className="pacts-field">
            <span>Relationship</span>
            <input
              type="text"
              className="pacts-input"
              value={partnerForm.relationship_label}
              onChange={(event) =>
                setPartnerForm((prev) => ({ ...prev, relationship_label: event.target.value }))
              }
              placeholder="Friend, sibling, coach"
            />
          </label>

          <div className="pacts-partner-actions">
            <button
              type="button"
              className="pacts-secondary-button"
              onClick={onSavePartner}
              disabled={partnerSaving}
            >
              {partnerSaving ? 'Saving...' : editingPartnerId ? 'Update partner' : 'Save partner'}
            </button>
            <button type="button" className="pacts-secondary-button" onClick={onCancel}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {!showComposer && partners.length > 0 ? (
        <div className="pacts-builder-partner-picker">
          <button
            type="button"
            className={`pacts-builder-partner-picker-trigger ${pickerOpen ? 'is-open' : ''}`}
            onClick={() => setPickerOpen((prev) => !prev)}
            disabled={disabled}
          >
            <span>
              {selectedPartnerIds.length > 0
                ? `${selectedPartnerIds.length} partner${selectedPartnerIds.length === 1 ? '' : 's'} selected`
                : 'Choose accountability partners'}
            </span>
            <span className="pacts-builder-partner-picker-chevron" aria-hidden="true">
              {pickerOpen ? '−' : '+'}
            </span>
          </button>

          {pickerOpen ? (
            <div className="pacts-builder-partner-menu">
              {partners.map((partner) => (
                <div
                  key={partner.id}
                  className={`pacts-builder-partner-list-item ${
                    selectedPartnerIds.includes(partner.id) ? 'is-selected' : ''
                  }`}
                >
                  <button
                    type="button"
                    className="pacts-builder-partner-toggle"
                    onClick={() => onTogglePartner(partner.id)}
                    disabled={disabled || partner.is_active === false}
                  >
                    <strong>{partner.partner_name || 'Unnamed partner'}</strong>
                    <span>{partner.partner_email}</span>
                  </button>
                  <button
                    type="button"
                    className="pacts-secondary-button"
                    onClick={() => onEditPartner(partner)}
                    disabled={disabled}
                  >
                    Edit
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <Link className="pacts-inline-link pacts-partner-settings-link" to="/settings">
        Manage accountability partners in Settings
      </Link>

      {partnersLoading ? <p className="pacts-empty">Loading partners...</p> : null}
    </div>
  )
}

function PactCard({
  pact,
  settings,
  isLocked,
  remainingLabel,
  onEdit,
  onToggleStatus,
  onDelete,
  statusSaving,
  deleting,
}) {
  const pactName = normalizeCategory(pact.custom_category || pact.category || pact.preset_category)
  const isPreset = Boolean(pact.preset_category)
  const isPaused = String(pact.status).toLowerCase() === 'paused'
  const partnerCount = settings?.accountability_partner_ids?.length || 0
  const consequenceSummary = buildConsequenceSummary(
    settings?.accountability_type || 'email',
    settings?.discipline_savings_percentage || 0,
    partnerCount
  )

  return (
    <div className="pacts-library-card">
      <div className="pacts-library-card-top">
        <div>
          <div className="pacts-library-card-title-row">
            <h3>{pactName}</h3>
            <span className={`pacts-badge ${isPreset ? 'is-preset' : 'is-custom'}`}>
              {isPreset ? 'Preset' : 'Custom'}
            </span>
            <span className={`pacts-state-pill ${isPaused ? 'is-paused' : 'is-active'}`}>
              {isPaused ? 'Paused' : 'Active'}
            </span>
          </div>
          <p className="pacts-library-card-subtitle">
            {isLocked ? `Locked for ${remainingLabel}` : isPaused ? 'Not currently monitoring' : 'Monitoring now'}
          </p>
        </div>
      </div>

      <div className="pacts-library-card-grid">
        <div>
          <span className="pacts-library-label">Rule</span>
          <p>{pactName}</p>
        </div>
        <div>
          <span className="pacts-library-label">Consequence</span>
          <p>{consequenceSummary}</p>
        </div>
      </div>

      <div className="pacts-library-actions">
        <button
          type="button"
          className="pacts-secondary-button"
          onClick={onEdit}
          disabled={isLocked}
        >
          Edit
        </button>
        <button
          type="button"
          className="pacts-secondary-button"
          onClick={onToggleStatus}
          disabled={statusSaving || isLocked}
        >
          {statusSaving ? 'Saving...' : isPaused ? 'Resume' : 'Pause'}
        </button>
        <button
          type="button"
          className="pacts-danger-button"
          onClick={onDelete}
          disabled={deleting || isLocked}
        >
          {deleting ? 'Deleting...' : 'Delete'}
        </button>
      </div>
    </div>
  )
}

function CreatePactCard({
  selectedPreset,
  setSelectedPreset,
  customCategory,
  setCustomCategory,
  alertMethod,
  setAlertMethod,
  alertRecipient,
  setAlertRecipient,
  penaltySavings,
  setPenaltySavings,
  lockDays,
  setLockDays,
  previewSentence,
  partners,
  partnersLoading,
  partnerSaving,
  selectedPartnerIds,
  partnerForm,
  setPartnerForm,
  editingPartnerId,
  showPartnerComposer,
  onStartAddPartner,
  onEditPartner,
  onTogglePartner,
  onSavePartner,
  onCancelPartnerEdit,
  error,
  success,
  submitting,
  onSubmit,
}) {
  return (
    <div className="dashboard-card dashboard-panel pacts-builder-card">
      <div className="dashboard-panel-header">
        <h2>Create a Pact</h2>
      </div>

      <form className="pacts-builder-form" onSubmit={onSubmit}>
        {/* Step 1: define the spending behavior the user wants to monitor. */}
        <section className="pacts-builder-step">
          <div className="pacts-builder-step-head">
            <span className="pacts-builder-step-number">Step 1</span>
            <h3>What would you like to track?</h3>
          </div>

          <label className="pacts-field">
            <span>Preset category</span>
            <select
              value={selectedPreset}
              onChange={(event) => setSelectedPreset(event.target.value)}
              className="pacts-input"
            >
              <option value="">Select a category</option>
              {PRESET_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <div className="pacts-divider pacts-divider-left">
            <span>OR: Track a merchant or keyword</span>
          </div>

          <label className="pacts-field">
            <span>Merchant or keyword</span>
            <input
              type="text"
              value={customCategory}
              onChange={(event) => setCustomCategory(event.target.value)}
              placeholder="Uber, Sephora, Target"
              className="pacts-input"
            />
          </label>
        </section>

        {/* Step 2: define the consequence while keeping the form calm and compact. */}
        <section className="pacts-builder-step">
          <div className="pacts-builder-step-head">
            <span className="pacts-builder-step-number">Step 2</span>
            <h3>What happens if you break this rule?</h3>
          </div>

          <div className="pacts-builder-grid">
            <label className="pacts-field">
              <span>Alert method</span>
              <select
                value={alertMethod}
                onChange={(event) => setAlertMethod(event.target.value)}
                className="pacts-input"
              >
                {ALERT_METHOD_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="pacts-field">
              <span>Alert recipient</span>
              <select
                value={alertRecipient}
                onChange={(event) => setAlertRecipient(event.target.value)}
                className="pacts-input"
                disabled={alertMethod === 'none'}
              >
                {ALERT_RECIPIENT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            {alertMethod !== 'none' && alertRecipient === 'partner' ? (
              <div className="pacts-builder-grid-span">
                <BuilderPartnerManager
                  partners={partners}
                  selectedPartnerIds={selectedPartnerIds}
                  onTogglePartner={onTogglePartner}
                  partnersLoading={partnersLoading}
                  partnerSaving={partnerSaving}
                  partnerForm={partnerForm}
                  setPartnerForm={setPartnerForm}
                  editingPartnerId={editingPartnerId}
                  onStartAdd={onStartAddPartner}
                  onEditPartner={onEditPartner}
                  onSavePartner={onSavePartner}
                  onCancel={onCancelPartnerEdit}
                  showComposer={showPartnerComposer}
                />
              </div>
            ) : null}

            <label className="pacts-field">
              <span>Savings penalty (%)</span>
              <input
                type="number"
                min={0}
                max={100}
                value={penaltySavings}
                onChange={(event) => setPenaltySavings(event.target.value)}
                className="pacts-input"
              />
            </label>

            <label className="pacts-field">
              <span>Lock card</span>
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
            </label>
          </div>
        </section>

        {/* Step 3: keep the review lightweight with one plain-English sentence. */}
        <section className="pacts-builder-step">
          <div className="pacts-builder-step-head">
            <span className="pacts-builder-step-number">Step 3</span>
            <h3>Review</h3>
          </div>

          <PactPreviewBox previewSentence={previewSentence} />
        </section>

        {error ? <p className="dashboard-error">{error}</p> : null}
        {success ? <p className="pacts-success">{success}</p> : null}

        <button type="submit" className="dashboard-button pacts-create-button" disabled={submitting}>
          {submitting ? 'Creating...' : 'Create Pact'}
        </button>
      </form>
    </div>
  )
}

export default function Pacts() {
  const { user, token, refreshUser } = useAuth()
  const firstName = user?.name?.split(' ')[0] || 'there'

  const [pacts, setPacts] = useState([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [statusSavingId, setStatusSavingId] = useState(null)
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
  const [newDisciplineSavingsPercentage, setNewDisciplineSavingsPercentage] = useState(10)
  const [newAccountabilityPartnerIds, setNewAccountabilityPartnerIds] = useState([])

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
  const [showPartnerComposer, setShowPartnerComposer] = useState(false)

  const [showDashboard, setShowDashboard] = useState(() => {
    if (typeof window === 'undefined') return true
    return window.localStorage.getItem(PACTS_SKIP_INTRO_KEY) !== '0'
  })

  const disciplineModeEnabled = (user?.discipline_ui_mode || 'discipline') === 'discipline'
  const disciplineScore = Number(user?.discipline_score ?? 100)
  const disciplineUiState = getDisciplineUiState(disciplineScore)

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

  const primaryPartner = useMemo(
    () => partners.find((partner) => partner.is_active) || partners[0] || null,
    [partners]
  )

  const alertMethod = deriveAlertMethod(newAccountabilityType)
  const alertRecipient = deriveAlertRecipient(newAccountabilityType)
  const builderCategoryLabel = selectedPreset || customCategory.trim() || 'that category'
  const previewSentence = buildPreviewSentence({
    categoryLabel: builderCategoryLabel,
    type: newAccountabilityType,
    percent: newDisciplineSavingsPercentage,
    partnerCount: newAccountabilityPartnerIds.length,
  })

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

  const startEditingPact = (pact) => {
    setEditingPactId(pact.id)
    setEditingValues({
      preset_category: pact.preset_category || '',
      custom_category: pact.custom_category || '',
      lockDays: getLockDays(pact.locked_until),
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
          accountability_partner_ids: [],
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
            accountability_partner_ids: settings.accountability_partner_ids || [],
          },
        }))
      } catch (err) {
        if (err?.status === 404) {
          setSettingsFormState((prev) => ({
            ...prev,
            [pactId]: {
              accountability_type: 'email',
              discipline_savings_percentage: 0,
              accountability_partner_ids: [],
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

  async function handleCreatePact(event) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    setSuccess('')

    const trimmedCustom = customCategory.trim()

    try {
      if (!selectedPreset && !trimmedCustom) {
        throw new Error('Choose a preset category or enter a merchant.')
      }

      if (selectedPreset && trimmedCustom) {
        throw new Error('Use either a preset category or a custom merchant, not both.')
      }

      if (newAccountabilityType === 'friend' && newAccountabilityPartnerIds.length === 0) {
        throw new Error('Choose at least one accountability partner for this pact.')
      }

      const lockDaysInt = Number(lockDays) || 0
      const locked_until =
        lockDaysInt > 0
          ? new Date(Date.now() + lockDaysInt * 24 * 60 * 60 * 1000).toISOString()
          : null

      const createdPact = await apiRequest('/api/pacts', {
        method: 'POST',
        token,
        body: {
          preset_category: selectedPreset || null,
          custom_category: trimmedCustom || null,
          status: 'active',
          locked_until,
        },
      })

      const createdPactId = createdPact?.id || createdPact?.pact?.id

      if (createdPactId) {
        await saveAccountabilitySettings(
          {
            pact_id: createdPactId,
            accountability_type: newAccountabilityType,
            discipline_savings_percentage: Number(newDisciplineSavingsPercentage) || 0,
            accountability_note: null,
            accountability_partner_ids:
              newAccountabilityType === 'friend' ? newAccountabilityPartnerIds : [],
          },
          token
        )
      }

      setSelectedPreset('')
      setCustomCategory('')
      setLockDays(0)
      setNewAccountabilityType('email')
      setNewDisciplineSavingsPercentage(10)
      setNewAccountabilityPartnerIds([])
      setSuccess('Pact created.')
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

      setPacts((prev) => prev.filter((pact) => pact.id !== pactId))
      setSettingsFormState((prev) => {
        const next = { ...prev }
        delete next[pactId]
        return next
      })
      setSuccess('Pact deleted.')
      if (editingPactId === pactId) cancelEditing()
    } catch (err) {
      setError(err?.message || 'Failed to delete pact.')
    } finally {
      setDeletingId(null)
    }
  }

  async function handleTogglePactStatus(pact) {
    if (!token || !pact?.id) return

    const nextStatus = String(pact.status).toLowerCase() === 'paused' ? 'active' : 'paused'

    try {
      setStatusSavingId(pact.id)
      setError(null)
      setSuccess('')
      await apiRequest(`/api/pacts/${pact.id}`, {
        method: 'PUT',
        token,
        body: { status: nextStatus },
      })
      setSuccess(nextStatus === 'paused' ? 'Pact paused.' : 'Pact resumed.')
      await loadPacts()
    } catch (err) {
      setError(err?.message || 'Failed to update pact status.')
    } finally {
      setStatusSavingId(null)
    }
  }

  function resetPartnerForm() {
    setEditingPartnerId(null)
    setShowPartnerComposer(false)
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
        if (editingPactId) {
          updateFormState(editingPactId, {
            accountability_partner_ids: [
              ...new Set([...(settingsFormState[editingPactId]?.accountability_partner_ids || []), created.id]),
            ],
          })
        } else if (newAccountabilityType === 'friend') {
          setNewAccountabilityPartnerIds((prev) => [...new Set([...prev, created.id])])
        }
        setSuccess('Accountability partner added.')
      }
      resetPartnerForm()
    } catch (err) {
      setError(err?.message || 'Failed to save accountability partner.')
    } finally {
      setPartnerSaving(false)
    }
  }

  function beginEditPartner(partner) {
    setEditingPartnerId(partner.id)
    setShowPartnerComposer(true)
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
        if (
          formState.accountability_type === 'friend' &&
          (formState.accountability_partner_ids || []).length === 0
        ) {
          throw new Error('Choose at least one accountability partner for this pact.')
        }

        const updated = await saveAccountabilitySettings(
          {
            pact_id: pact.id,
            accountability_type: formState.accountability_type,
            discipline_savings_percentage: Number(formState.discipline_savings_percentage) || 0,
            accountability_note: null,
            accountability_partner_ids:
              formState.accountability_type === 'friend'
                ? formState.accountability_partner_ids || []
                : [],
          },
          token
        )

        setSettingsFormState((prev) => ({
          ...prev,
          [pact.id]: {
            accountability_type: updated.accountability_type || 'email',
            discipline_savings_percentage: updated.discipline_savings_percentage || 0,
            accountability_partner_ids: updated.accountability_partner_ids || [],
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

  function handleQuickSuggestion(suggestion) {
    setSelectedPreset(suggestion.preset || '')
    setCustomCategory('')
    setError(null)
    setSuccess('')
  }

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

  function handleAlertMethodChange(value) {
    setNewAccountabilityType(composeAccountabilityType(value, alertRecipient))
    if (value === 'none') {
      setNewAccountabilityPartnerIds([])
    }
  }

  function handleAlertRecipientChange(value) {
    setNewAccountabilityType(composeAccountabilityType(alertMethod, value))
    if (value !== 'partner') {
      setNewAccountabilityPartnerIds([])
    }
  }

  function handleStartAddPartner() {
    setShowPartnerComposer(true)
    setEditingPartnerId(null)
    setPartnerForm({
      partner_name: '',
      partner_email: '',
      relationship_label: '',
      is_active: true,
    })
  }

  function toggleBuilderPartnerSelection(partnerId) {
    setNewAccountabilityPartnerIds((prev) =>
      prev.includes(partnerId) ? prev.filter((id) => id !== partnerId) : [...prev, partnerId]
    )
  }

  function toggleEditPartnerSelection(pactId, partnerId) {
    const currentIds = settingsFormState[pactId]?.accountability_partner_ids || []
    updateFormState(pactId, {
      accountability_partner_ids: currentIds.includes(partnerId)
        ? currentIds.filter((id) => id !== partnerId)
        : [...currentIds, partnerId],
    })
  }

  if (!showDashboard) {
    return (
      <div className="dashboard-shell">
        <DashboardTopbar navAriaLabel="Dashboard" />
        <div className="pacts-intro">
          <div className="pacts-intro-box">
            <h1 className="pacts-intro-title">What's a Pact?</h1>
            <p className="pacts-intro-desc">
              A pact is a spending rule you commit to. PactBank watches the category, flags the slip,
              and adds the consequence you choose.
            </p>
            {disciplineModeEnabled ? (
              <p className="pacts-intro-discipline-hint" role="status">
                <strong>{disciplineUiState.label}</strong>
                <span> · Score {disciplineScore}/100</span>
                <span className="pacts-intro-discipline-note">
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

      {/* Hero keeps the page aligned with the rest of the app while clarifying the main task. */}
      <section className="dashboard-hero pacts-hero">
        <div className="dashboard-hero-copy">
          <h1 className="dashboard-title">Manage your pacts, {firstName}</h1>
          <p className="dashboard-subtitle">
            Build a rule, choose a consequence, and keep your spending habits intentional.
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
        <StatsRow
          totalPacts={pacts.length}
          presetPactCount={presetPactCount}
          customPactCount={customPactCount}
          activePacts={activePacts.length}
          disciplineModeEnabled={disciplineModeEnabled}
          disciplineUiState={disciplineUiState}
        />

        <section className="pacts-page-grid">
          {/* Left column gives more visual weight to current pact management and weekly context. */}
          <div className="pacts-primary-column">
            <div className="dashboard-card dashboard-panel pacts-your-pacts-card">
              <div className="dashboard-panel-header">
                <h2>Your Pacts</h2>
                <span>{pacts.length} total</span>
              </div>

              {loading ? <p className="dashboard-empty">Loading pacts...</p> : null}

              {!loading && pacts.length === 0 ? (
                <EmptyPactsCard
                  onSuggestionSelect={handleQuickSuggestion}
                  onShowIntro={showPactsIntro}
                />
              ) : null}

              {!loading && pacts.length > 0 ? (
                <div className="pacts-library-list">
                  {pacts.map((pact) => {
                    const lockedUntil = pact.locked_until ? new Date(pact.locked_until) : null
                    const isLocked = lockedUntil ? lockedUntil > now : false
                    const remainingMs = lockedUntil ? lockedUntil.getTime() - now.getTime() : 0
                    const remainingLabel = lockedUntil ? formatRemaining(remainingMs) : null
                    const settings = settingsFormState[pact.id] || {
                      accountability_type: 'email',
                      discipline_savings_percentage: 0,
                    }

                    return (
                      <div key={pact.id} className="pacts-library-stack">
                        {/* Existing pacts are presented as premium cards so the page feels product-ready. */}
                        <PactCard
                          pact={pact}
                          settings={settings}
                          isLocked={isLocked}
                          remainingLabel={remainingLabel}
                          onEdit={() => startEditingPact(pact)}
                          onToggleStatus={() => handleTogglePactStatus(pact)}
                          onDelete={() => handleDeletePact(pact.id, isLocked)}
                          statusSaving={statusSavingId === pact.id}
                          deleting={deletingId === pact.id}
                        />

                        {editingPactId === pact.id ? (
                          <div className="pacts-edit-shell">
                            <div className="pacts-edit-card">
                              <h4 className="pacts-edit-title">Edit pact</h4>

                              {settingsLoading[pact.id] ? (
                                <p className="pacts-accountability-loading">Loading settings…</p>
                              ) : (
                                <>
                                  {settingsError[pact.id] ? (
                                    <p className="dashboard-error">{settingsError[pact.id]}</p>
                                  ) : null}

                                  {pact.preset_category ? (
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
                                      <span>Track a merchant or keyword</span>
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

                                  <div className="pacts-builder-grid">
                                    <label className="pacts-field">
                                      <span>Penalty savings (%)</span>
                                      <input
                                        type="number"
                                        min={0}
                                        max={100}
                                        value={settings.discipline_savings_percentage}
                                        onChange={(event) =>
                                          updateFormState(pact.id, {
                                            discipline_savings_percentage: event.target.value,
                                          })
                                        }
                                        className="pacts-input"
                                        disabled={isLocked}
                                      />
                                    </label>

                                    <label className="pacts-field">
                                      <span>Lock card</span>
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
                                  </div>

                                  <label className="pacts-field">
                                    <span>Alert recipient</span>
                                    <select
                                      value={settings.accountability_type}
                                      onChange={(event) =>
                                        updateFormState(pact.id, {
                                          accountability_type: event.target.value,
                                        })
                                      }
                                      className="pacts-input"
                                      disabled={isLocked}
                                    >
                                      <option value="email">Email yourself</option>
                                      <option value="friend">Accountability partner</option>
                                      <option value="none">None</option>
                                    </select>
                                  </label>

                                  {settings.accountability_type === 'friend' ? (
                                    <div className="pacts-helper-card">
                                      <BuilderPartnerManager
                                        partners={partners}
                                        selectedPartnerIds={settings.accountability_partner_ids || []}
                                        onTogglePartner={(partnerId) =>
                                          toggleEditPartnerSelection(pact.id, partnerId)
                                        }
                                        partnersLoading={partnersLoading}
                                        partnerSaving={partnerSaving}
                                        partnerForm={partnerForm}
                                        setPartnerForm={setPartnerForm}
                                        editingPartnerId={editingPartnerId}
                                        onStartAdd={handleStartAddPartner}
                                        onEditPartner={beginEditPartner}
                                        onSavePartner={handleSavePartner}
                                        onCancel={resetPartnerForm}
                                        showComposer={showPartnerComposer}
                                        disabled={isLocked}
                                      />
                                    </div>
                                  ) : null}

                                  <div className="pacts-edit-actions">
                                    <button
                                      type="button"
                                      className="dashboard-button"
                                      disabled={libraryPactSaving === pact.id || isLocked}
                                      onClick={() => handleSavePact(pact)}
                                    >
                                      {libraryPactSaving === pact.id ? 'Saving...' : 'Save'}
                                    </button>
                                    <button
                                      type="button"
                                      className="pacts-secondary-button"
                                      onClick={cancelEditing}
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              ) : null}
            </div>

            <WeeklySummaryCard />
            <DisciplineTipsCard />
          </div>

          {/* Right column keeps creation guided and calmer than a typical stacked settings form. */}
          <div className="pacts-secondary-column">
            <CreatePactCard
              selectedPreset={selectedPreset}
              setSelectedPreset={setSelectedPreset}
              customCategory={customCategory}
              setCustomCategory={setCustomCategory}
              alertMethod={alertMethod}
              setAlertMethod={handleAlertMethodChange}
              alertRecipient={alertRecipient}
              setAlertRecipient={handleAlertRecipientChange}
              penaltySavings={newDisciplineSavingsPercentage}
              setPenaltySavings={setNewDisciplineSavingsPercentage}
              lockDays={lockDays}
              setLockDays={setLockDays}
              previewSentence={previewSentence}
              partners={partners}
              partnersLoading={partnersLoading}
              partnerSaving={partnerSaving}
              selectedPartnerIds={newAccountabilityPartnerIds}
              partnerForm={partnerForm}
              setPartnerForm={setPartnerForm}
              editingPartnerId={editingPartnerId}
              showPartnerComposer={showPartnerComposer || (alertMethod !== 'none' && alertRecipient === 'partner' && !primaryPartner)}
              onStartAddPartner={handleStartAddPartner}
              onEditPartner={beginEditPartner}
              onTogglePartner={toggleBuilderPartnerSelection}
              onSavePartner={handleSavePartner}
              onCancelPartnerEdit={resetPartnerForm}
              error={error}
              success={success}
              submitting={submitting}
              onSubmit={handleCreatePact}
            />
            <QuickLinksCard />
          </div>
        </section>
      </section>
    </div>
  )
}
