import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../features/auth/context'

const navLinks = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/settings', label: 'Settings' },
]

export default function Navbar() {
  const { user, logout } = useAuth()
  const location = useLocation()
  const userLabel = user?.name || user?.email || 'User'

  return (
    <nav className="flex items-center justify-between px-8 py-4 border-b border-slate-800 bg-slate-950/80 backdrop-blur-sm">
      <div className="flex items-center gap-8">
        <Link to="/dashboard" className="text-lg font-semibold text-amber-500 tracking-wide">
          BankSpank
        </Link>
        <div className="flex gap-1">
          {navLinks.map(({ to, label }) => (
            <Link
              key={to}
              to={to}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                location.pathname === to
                  ? 'bg-slate-800 text-slate-100'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              {label}
            </Link>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-5">
        <span className="text-slate-400 text-sm">{userLabel}</span>
        <button
          onClick={logout}
          className="text-sm text-slate-500 hover:text-slate-200 transition"
        >
          Sign out
        </button>
      </div>
    </nav>
  )
}
