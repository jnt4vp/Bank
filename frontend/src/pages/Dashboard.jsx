import { useAuth } from '../features/auth/context'
import { useEffect, useState } from 'react'
import { apiRequest } from '../lib/api/client'

export default function Dashboard() {
  const { user, token } = useAuth()
  console.log('user from auth:', user)
  console.log('dashboard user:', user)
  const firstName = user?.name?.split(' ')[0] || 'there'

  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const disciplineScore = transactions.length === 0
    ? null
    : Math.max(0, Math.round(100 - (transactions.filter((t) => t.flagged).length / transactions.length) * 100))

  useEffect(() => {
    if (!token) return
    let cancelled = false

    apiRequest('/api/transactions/', { token })
      .then((data) => {
        if (!cancelled) setTransactions(data)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [token])

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
          {loading || disciplineScore === null ? (
            <p className="text-2xl font-semibold">—</p>
          ) : (
            <p className={`text-2xl font-semibold ${
              disciplineScore >= 80 ? 'text-green-400' :
              disciplineScore >= 50 ? 'text-yellow-400' : 'text-red-400'
            }`}>
              {disciplineScore}%
            </p>
          )}
        </div>
      </div>

      <section className="bg-slate-900 rounded-xl p-6 border border-slate-800">
        <h2 className="text-lg font-medium mb-4">Recent Activity</h2>

        {loading && <p className="text-slate-500 text-sm">Loading transactions...</p>}
        {error && <p className="text-red-400 text-sm">{error}</p>}

        {!loading && !error && transactions.length === 0 && (
          <p className="text-slate-500 text-sm">No transactions yet.</p>
        )}

        {!loading && !error && transactions.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="text-slate-400 text-xs uppercase tracking-wider border-b border-slate-800">
                  <th className="pb-3 pr-4">Date</th>
                  <th className="pb-3 pr-4">Merchant</th>
                  <th className="pb-3 pr-4">Category</th>
                  <th className="pb-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => (
                  <tr key={tx.id} className="border-b border-slate-800/50 last:border-0">
                    <td className="py-3 pr-4 text-slate-400 whitespace-nowrap">
                      {new Date(tx.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-3 pr-4">
                      <span>{tx.merchant}</span>
                      {tx.flagged && (
                        <span className="ml-2 text-xs text-red-400" title={tx.flag_reason}>⚠</span>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-slate-400">{tx.category || '—'}</td>
                    <td className="py-3 text-right font-medium">${Number(tx.amount).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
