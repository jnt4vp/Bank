const overlayStyle = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(10, 20, 30, 0.45)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
  padding: '16px',
}

const cardStyle = {
  background: '#ffffff',
  borderRadius: '18px',
  padding: '24px',
  maxWidth: '420px',
  width: '100%',
  boxShadow: '0 20px 50px rgba(0,0,0,0.18)',
}

const optionButtonStyle = {
  display: 'block',
  width: '100%',
  padding: '14px 16px',
  borderRadius: '14px',
  border: '1px solid rgba(0,0,0,0.08)',
  background: '#f7f8fa',
  textAlign: 'left',
  cursor: 'pointer',
  marginTop: '10px',
  color: 'inherit',
}

const titleStyle = { fontWeight: 600, marginBottom: '4px' }
const subStyle = { fontSize: '13px', opacity: 0.65 }

export default function PlaidSourceChooser({
  onClose,
  onChoosePersonal,
  onChooseDemo,
  personalDisabled = false,
  personalDisabledReason = null,
}) {
  return (
    <div
      style={overlayStyle}
      role="dialog"
      aria-modal="true"
      aria-label="Connect bank"
      onClick={onClose}
    >
      <div style={cardStyle} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 4px 0' }}>How would you like to connect?</h3>
        <p style={{ margin: '0 0 16px 0', fontSize: '14px', opacity: 0.7 }}>
          Link your real bank, or explore the app with sample transactions.
        </p>

        <button
          type="button"
          style={{
            ...optionButtonStyle,
            opacity: personalDisabled ? 0.6 : 1,
            cursor: personalDisabled ? 'not-allowed' : 'pointer',
          }}
          onClick={onChoosePersonal}
          disabled={personalDisabled}
        >
          <div style={titleStyle}>Connect your own bank</div>
          <div style={subStyle}>
            Securely link with Plaid. Your real transactions sync automatically.
          </div>
          {personalDisabled && personalDisabledReason ? (
            <div style={{ ...subStyle, color: '#c0392b', marginTop: '6px' }}>
              {personalDisabledReason}
            </div>
          ) : null}
        </button>

        <button
          type="button"
          style={optionButtonStyle}
          onClick={onChooseDemo}
        >
          <div style={titleStyle}>Use demo data</div>
          <div style={subStyle}>
            Skip bank linking and try the app with a shared sample account.
          </div>
        </button>

        <button
          type="button"
          onClick={onClose}
          style={{
            marginTop: '16px',
            width: '100%',
            padding: '10px',
            borderRadius: '12px',
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            opacity: 0.6,
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
