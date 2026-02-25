import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const navigate = useNavigate()

  function handleSubmit(e) {
    e.preventDefault()
    if (!username.trim()) return
    localStorage.setItem('user', username.trim())
    navigate('/dashboard')
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <button
          onClick={() => navigate('/')}
          className="text-slate-400 hover:text-slate-200 text-sm mb-8 transition"
        >
          ← Back
        </button>
        <h1 className="text-3xl font-semibold mb-2">Sign in</h1>
        <p className="text-slate-400 text-sm mb-8">Any credentials will work for this demo.</p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={e => setUsername(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 outline-none focus:border-slate-500 transition"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 outline-none focus:border-slate-500 transition"
          />
          <button
            type="submit"
            className="bg-white text-slate-900 py-3 rounded-lg font-medium hover:bg-slate-200 transition mt-2"
          >
            Sign In
          </button>
        </form>
      </div>
    </main>
  )
}
