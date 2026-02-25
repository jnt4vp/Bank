import { useState } from 'react'

function App() {
  const [count, setCount] = useState(0)

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-6 px-6 text-center">
        <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
          Placeholder App
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          Bank UI starter
        </h1>
        <p className="max-w-xl text-base text-slate-300 sm:text-lg">
          React + Vite + Tailwind CSS. Swap this out when real screens land.
        </p>
        <button
          className="rounded-full border border-slate-700 px-6 py-2 text-sm font-medium transition hover:border-slate-500"
          onClick={() => setCount((count) => count + 1)}
        >
          Clicks: {count}
        </button>
      </div>
    </main>
  )
}

export default App
