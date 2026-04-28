import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import DashboardTopbar from '../components/DashboardTopbar'
import { useAuth } from '../features/auth/context'
import { ApiError, apiRequest } from '../lib/api'
import '../dashboard.css'
import '../settings.css'

const initialForm = { merchant: '', description: '', amount: '' }

function validate(form) {
  const errors = {}
  if (!form.merchant.trim()) errors.merchant = 'Merchant is required.'
  if (!form.description.trim()) errors.description = 'Description is required.'

  const amountValue = Number.parseFloat(form.amount)
  if (!form.amount.trim()) {
    errors.amount = 'Amount is required.'
  } else if (Number.isNaN(amountValue) || amountValue <= 0) {
    errors.amount = 'Enter an amount greater than 0.'
  } else if (Number(amountValue.toFixed(2)) !== amountValue) {
    errors.amount = 'Use up to two decimal places (e.g. 12.99).'
  }
  return errors
}

export default function AddTransaction() {
  const navigate = useNavigate()
  const { token, user } = useAuth()
  const merchantRef = useRef(null)
  const descriptionRef = useRef(null)
  const amountRef = useRef(null)

  const [form, setForm] = useState(initialForm)
  const [fieldErrors, setFieldErrors] = useState({})
  const [submitError, setSubmitError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [showSuccessToast, setShowSuccessToast] = useState(false)

  useEffect(() => {
    merchantRef.current?.focus()
  }, [])

  function updateField(name, value) {
    setForm((prev) => ({ ...prev, [name]: value }))
    if (fieldErrors[name]) {
      setFieldErrors((prev) => {
        const next = { ...prev }
        delete next[name]
        return next
      })
    }
    if (submitError) setSubmitError(null)
  }

  function handleBlur(name) {
    const errors = validate(form)
    if (errors[name]) {
      setFieldErrors((prev) => ({ ...prev, [name]: errors[name] }))
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setSubmitError(null)
    const errors = validate(form)
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      const refByField = {
        merchant: merchantRef,
        description: descriptionRef,
        amount: amountRef,
      }
      const firstField = ['merchant', 'description', 'amount'].find((f) => errors[f])
      refByField[firstField]?.current?.focus()
      return
    }

    setSubmitting(true)
    try {
      await apiRequest('/api/transactions/', {
        method: 'POST',
        token,
        body: {
          merchant: form.merchant.trim(),
          description: form.description.trim(),
          amount: Number.parseFloat(form.amount),
        },
      })
      setShowSuccessToast(true)
      window.setTimeout(() => navigate('/transactions'), 900)
    } catch (err) {
      if (err instanceof ApiError && err.status === 423) {
        setSubmitError({
          kind: 'card_locked',
          message:
            err.data?.detail ||
            'Your card is locked. Unlock it in Settings before adding new transactions.',
        })
      } else if (err instanceof ApiError) {
        setSubmitError({ kind: 'generic', message: err.message })
      } else {
        setSubmitError({ kind: 'generic', message: 'Could not add transaction. Please try again.' })
      }
      setSubmitting(false)
    }
  }

  const cardLocked = Boolean(user?.card_locked)

  return (
    <div className="dashboard-shell settings-shell">
      <DashboardTopbar navAriaLabel="Primary" />

      <section className="dashboard-hero settings-hero">
        <div className="dashboard-hero-copy settings-hero-copy">
          <h1 className="dashboard-title settings-title">Add a transaction</h1>
          <p className="dashboard-subtitle settings-subtitle">
            Record a purchase manually. We'll classify it against your active pacts and apply your
            discipline savings rule.
          </p>
        </div>
      </section>

      <section className="settings-overview">
        <div className="settings-grid">
          <section className="dashboard-card settings-card" style={{ gridColumn: '1 / -1', maxWidth: 720 }}>
            <div className="settings-section-header">
              <div>
                <p className="settings-section-kicker">Manual entry</p>
                <h2>Purchase details</h2>
              </div>
            </div>

            {cardLocked ? (
              <p className="settings-form-feedback is-error" role="status">
                Card is currently locked. New manual transactions will be blocked until you unlock
                it in <Link to="/settings">Settings</Link>.
              </p>
            ) : null}

            <form
              className="settings-profile-form"
              onSubmit={handleSubmit}
              noValidate
              aria-describedby="add-transaction-help"
            >
              <p id="add-transaction-help" className="settings-inline-note">
                Required fields are marked with <span aria-hidden="true">*</span>.
              </p>

              <label className="settings-field" htmlFor="add-txn-merchant">
                <span>
                  Merchant <span aria-hidden="true">*</span>
                  <span className="sr-only"> required</span>
                </span>
                <input
                  id="add-txn-merchant"
                  ref={merchantRef}
                  type="text"
                  className="settings-input"
                  placeholder="e.g. Starbucks"
                  autoComplete="off"
                  value={form.merchant}
                  onChange={(e) => updateField('merchant', e.target.value)}
                  onBlur={() => handleBlur('merchant')}
                  aria-invalid={Boolean(fieldErrors.merchant) || undefined}
                  aria-describedby={fieldErrors.merchant ? 'add-txn-merchant-error' : undefined}
                  required
                />
                {fieldErrors.merchant ? (
                  <p id="add-txn-merchant-error" className="settings-inline-note is-error" role="alert">
                    {fieldErrors.merchant}
                  </p>
                ) : null}
              </label>

              <label className="settings-field" htmlFor="add-txn-description">
                <span>
                  Description <span aria-hidden="true">*</span>
                  <span className="sr-only"> required</span>
                </span>
                <input
                  id="add-txn-description"
                  ref={descriptionRef}
                  type="text"
                  className="settings-input"
                  placeholder="e.g. Iced latte"
                  autoComplete="off"
                  value={form.description}
                  onChange={(e) => updateField('description', e.target.value)}
                  onBlur={() => handleBlur('description')}
                  aria-invalid={Boolean(fieldErrors.description) || undefined}
                  aria-describedby={
                    fieldErrors.description ? 'add-txn-description-error' : undefined
                  }
                  required
                />
                {fieldErrors.description ? (
                  <p
                    id="add-txn-description-error"
                    className="settings-inline-note is-error"
                    role="alert"
                  >
                    {fieldErrors.description}
                  </p>
                ) : null}
              </label>

              <label className="settings-field" htmlFor="add-txn-amount">
                <span>
                  Amount (USD) <span aria-hidden="true">*</span>
                  <span className="sr-only"> required</span>
                </span>
                <div className="add-txn-amount-wrap">
                  <span className="add-txn-amount-prefix" aria-hidden="true">
                    $
                  </span>
                  <input
                    id="add-txn-amount"
                    ref={amountRef}
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0.01"
                    className="settings-input add-txn-amount-input"
                    placeholder="0.00"
                    value={form.amount}
                    onChange={(e) => updateField('amount', e.target.value)}
                    onBlur={() => handleBlur('amount')}
                    aria-invalid={Boolean(fieldErrors.amount) || undefined}
                    aria-describedby={
                      fieldErrors.amount ? 'add-txn-amount-error' : 'add-txn-amount-help'
                    }
                    required
                  />
                </div>
                {fieldErrors.amount ? (
                  <p id="add-txn-amount-error" className="settings-inline-note is-error" role="alert">
                    {fieldErrors.amount}
                  </p>
                ) : (
                  <p id="add-txn-amount-help" className="settings-inline-note">
                    Up to two decimal places. Pacts are matched on the description and merchant.
                  </p>
                )}
              </label>

              {submitError ? (
                <p
                  className="settings-form-feedback is-error"
                  role="alert"
                  aria-live="assertive"
                >
                  {submitError.message}
                  {submitError.kind === 'card_locked' ? (
                    <>
                      {' '}
                      <Link to="/settings">Open Settings</Link>
                    </>
                  ) : null}
                </p>
              ) : null}

              <div className="settings-form-actions">
                <button
                  type="submit"
                  className="settings-primary-button"
                  disabled={submitting}
                  aria-busy={submitting || undefined}
                >
                  {submitting ? 'Adding…' : 'Add transaction'}
                </button>
                <button
                  type="button"
                  className="settings-ghost-button"
                  onClick={() => navigate('/transactions')}
                  disabled={submitting}
                >
                  Cancel
                </button>
              </div>
            </form>
          </section>
        </div>
      </section>

      {showSuccessToast ? (
        <div
          className="add-txn-toast"
          role="status"
          aria-live="polite"
        >
          Transaction added. Redirecting…
        </div>
      ) : null}
    </div>
  )
}
