import { useAuth } from '../features/auth/context'

export default function Dashboard() {
  const { user } = useAuth()
  const firstName = user?.name?.split(' ')[0] || 'there'

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-semibold mb-2">Welcome back, {firstName}</h1>
      <p className="text-slate-400 text-sm mb-10">Here's your financial overview.</p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
        <div className="bg-slate-900 rounded-xl p-5 border border-slate-800">
          <p className="text-slate-400 text-xs uppercase tracking-wider mb-1">Balance</p>
          <p className="text-2xl font-semibold">$0.00</p>
        </div>
        <div className="bg-slate-900 rounded-xl p-5 border border-slate-800">
          <p className="text-slate-400 text-xs uppercase tracking-wider mb-1">Savings</p>
          <p className="text-2xl font-semibold">$0.00</p>
        </div>
        <div className="bg-slate-900 rounded-xl p-5 border border-slate-800">
          <p className="text-slate-400 text-xs uppercase tracking-wider mb-1">Discipline Score</p>
          <p className="text-2xl font-semibold">—</p>
        </div>
      </div>

      <section className="bg-slate-900 rounded-xl p-6 border border-slate-800">
        <h2 className="text-lg font-medium mb-4">Recent Activity</h2>
        <p className="text-slate-500 text-sm">No transactions yet.</p>
      </section>
    </div>
  )
}
