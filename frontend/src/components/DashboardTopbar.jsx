import { useEffect, useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { useAuth } from '../features/auth/context'
import '../dashboard.css'

const primaryNavItems = [
  { label: 'Dashboard', to: '/dashboard', disabled: false },
  { label: 'Transactions', to: '/transactions', disabled: false },
  { label: 'Pacts', to: '/pacts', disabled: false },
  { label: 'Goals', to: '#', disabled: true },
  { label: 'Analytics', to: '#', disabled: true },
]

export default function DashboardTopbar({ navAriaLabel = 'Primary' }) {
  const { user, logout } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)

  const userLabel = user?.name || user?.email || 'User'

  useEffect(() => {
    function handlePointerDown(event) {
      if (!event.target.closest('.dashboard-profile-menu')) {
        setMenuOpen(false)
      }
    }

    function handleEscape(event) {
      if (event.key === 'Escape') {
        setMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [])

  return (
    <header className="dashboard-topbar">
      <div className="dashboard-brand">
        <div className="dashboard-brand-row">
          <svg width="44" height="44" viewBox="0 0 44 44" fill="none" aria-hidden="true">
            <path
              d="M14 32C14 32 14 24 22 24C30 24 30 18 30 18"
              stroke="#6b4f1d"
              strokeWidth="4"
              strokeLinecap="round"
            />
            <path
              d="M14 26C14 26 14 18 22 18C30 18 30 12 30 12"
              stroke="#a0813a"
              strokeWidth="3"
              strokeLinecap="round"
              opacity="0.7"
            />
          </svg>
          <span className="dashboard-brand-text">PactBank</span>
        </div>
        <div className="dashboard-brand-copy">
          <p className="dashboard-brand-subtitle">Accountability Banking</p>
        </div>
      </div>

      <nav className="dashboard-nav" aria-label={navAriaLabel}>
        {primaryNavItems.map((item) =>
          item.disabled ? (
            <button
              key={item.label}
              type="button"
              className="dashboard-nav-link dashboard-nav-link-disabled"
            >
              {item.label}
            </button>
          ) : (
            <NavLink
              key={item.label}
              to={item.to}
              className={({ isActive }) =>
                `dashboard-nav-link ${isActive ? 'dashboard-nav-link-active' : ''}`
              }
            >
              {item.label}
            </NavLink>
          )
        )}
      </nav>

      <div className="dashboard-topbar-actions">
        <button type="button" className="dashboard-icon-button" aria-label="Notifications">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M15 17H9M18 17V11C18 7.68629 15.3137 5 12 5C8.68629 5 6 7.68629 6 11V17L4 19H20L18 17Z"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        <div className="dashboard-profile-menu">
          <button
            type="button"
            className="dashboard-profile-trigger"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span className="dashboard-avatar">{userLabel.charAt(0).toUpperCase()}</span>
            <span className="dashboard-profile-name">{userLabel}</span>
            <span className={`dashboard-profile-chevron ${menuOpen ? 'is-open' : ''}`}>
              ⌄
            </span>
          </button>

          {menuOpen && (
            <div className="dashboard-profile-dropdown">
              <Link
                to="/settings"
                className="dashboard-profile-item"
                onClick={() => setMenuOpen(false)}
              >
                Settings
              </Link>
              <button type="button" className="dashboard-profile-item" onClick={logout}>
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
