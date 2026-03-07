import { useNavigate } from 'react-router-dom'

import { useAuth } from '../features/auth/context'
import { useCounter } from '../features/transactions/useCounter'

export default function Dashboard() {
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const { count, error, loading, increment } = useCounter()
  const userLabel = user?.email || user?.name || 'User'

  function handleLogout() {
    logout()
    navigate('/')
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <header className="flex justify-between items-center px-8 py-5 border-b border-slate-800">
        <span className="font-semibold">Bank Demo</span>
        <div className="flex items-center gap-6">
          <span className="text-slate-400 text-sm">{userLabel}</span>
          <button
            onClick={handleLogout}
            className="text-sm text-slate-400 hover:text-slate-200 transition"
          >
            Sign out
          </button>
        </div>
      </header>

      <div className="flex flex-col items-center justify-center gap-4 py-32 text-center">
        <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
          Persistent Counter
        </p>
        <div className="text-8xl font-semibold tabular-nums my-4">
          {count === null ? '—' : count}
        </div>
        {error && (
          <p className="text-red-400 text-sm font-mono">Error: {error}</p>
        )}
        <p className="text-slate-500 text-sm">
          Stored in PostgreSQL · shared across all sessions
        </p>
        <button
          onClick={increment}
          disabled={loading || count === null}
          className="mt-6 bg-white text-slate-900 px-10 py-3 rounded-full font-medium hover:bg-slate-200 disabled:opacity-40 transition"
        >
          {loading ? 'Incrementing…' : 'Increment'}
        </button>
      </div>
    </main>
  )
}
