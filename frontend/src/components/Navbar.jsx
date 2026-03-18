import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../features/auth/context'
import '../dashboard.css'

const navLinks = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/transactions', label: 'Transactions' },
  { to: '/pacts', label: 'Pacts' },
  { to: '/settings', label: 'Settings' },
]

export default function Navbar() {
  const { user, logout } = useAuth()
  const location = useLocation()
  const userLabel = user?.name || user?.email || 'User'

  return (
    <nav className="dashboard-container">
      <div className="dashboard-topbar">
        <div className="dashboard-brand">
          <div className="dashboard-brand-mark" aria-hidden="true">
            <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
              <path d="M14 32C14 32 14 24 22 24C30 24 30 18 30 18" stroke="#9b6d1d" strokeWidth="4" strokeLinecap="round" />
              <path d="M14 26C14 26 14 18 22 18C30 18 30 12 30 12" stroke="#d5a858" strokeWidth="3" strokeLinecap="round" opacity="0.75" />
            </svg>
          </div>
          <Link to="/dashboard" className="dashboard-brand-text no-underline">
            PactBank
          </Link>
        </div>

        <div className="dashboard-nav" aria-label="Primary">
          {navLinks.map(({ to, label }) => {
            const isActive = location.pathname === to

            return (
              <Link
                key={to}
                to={to}
                className={`dashboard-nav-link ${isActive ? 'dashboard-nav-link-active' : ''}`}
              >
                {label}
              </Link>
            )
          })}
        </div>

        <div className="dashboard-topbar-actions">
          <button className="dashboard-icon-button" type="button" aria-label="Notifications">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M15 17H9M18 17V11C18 7.68629 15.3137 5 12 5C8.68629 5 6 7.68629 6 11V17L4 19H20L18 17Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          <div className="dashboard-profile-pill">
            <span className="dashboard-avatar" aria-hidden="true">
              {userLabel.charAt(0).toUpperCase()}
            </span>
            <span>{userLabel}</span>
            <button
              onClick={logout}
              className="text-sm text-stone-500 transition hover:text-stone-800"
              type="button"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    </nav>
  )
}
