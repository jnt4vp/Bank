import { useNavigate } from 'react-router-dom'

export default function Landing() {
  const navigate = useNavigate()

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center px-6 text-center">
      <p className="text-xs uppercase tracking-[0.3em] text-slate-400 mb-6">
        Demo App
      </p>
      <h1 className="text-5xl font-semibold tracking-tight mb-4">
        Welcome to Bank
      </h1>
      <p className="text-slate-400 max-w-md text-lg mb-10">
        A minimal demo with a persistent counter backed by PostgreSQL.
      </p>
      <button
        onClick={() => navigate('/login')}
        className="bg-white text-slate-900 px-8 py-3 rounded-full font-medium hover:bg-slate-200 transition"
      >
        Get Started
      </button>
    </main>
  )
}
