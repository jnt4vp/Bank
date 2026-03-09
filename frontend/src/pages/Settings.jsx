import { useState } from 'react'
import { useAuth } from '../features/auth/context'
import { apiRequest } from '../lib/api/client'

export default function Settings() {
  const { user, token, refreshUser } = useAuth()

  const [percentage, setPercentage] = useState(user?.discipline_savings_percentage ?? 0)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState(null)

  async function handleSave() {
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      await apiRequest('/api/auth/me', {
        method: 'PATCH',
        token,
        body: { discipline_savings_percentage: Number(percentage) },
      })
      if (refreshUser) await refreshUser()
      setSaved(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-semibold mb-8">Settings</h1>

      <section className="bg-slate-900 rounded-xl p-6 mb-6 border border-slate-800">
        <h2 className="text-lg font-medium mb-4">Profile</h2>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between py-2 border-b border-slate-800">
            <span className="text-slate-400">Name</span>
            <span>{user?.name || '—'}</span>
          </div>
          <div className="flex justify-between py-2 border-b border-slate-800">
            <span className="text-slate-400">Email</span>
            <span>{user?.email || '—'}</span>
          </div>
          <div className="flex justify-between py-2">
            <span className="text-slate-400">Phone</span>
            <span>{user?.phone || '—'}</span>
          </div>
        </div>
      </section>

      <section className="bg-slate-900 rounded-xl p-6 mb-6 border border-slate-800">
        <h2 className="text-lg font-medium mb-4">Preferences</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-slate-400 text-sm mb-2">
              Discipline Savings Percentage
            </label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min="0"
                max="100"
                step="1"
                value={percentage}
                onChange={(e) => setPercentage(e.target.value)}
                className="w-24 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              />
              <span className="text-slate-400 text-sm">%</span>
              <button
                onClick={handleSave}
                disabled={saving}
                className="ml-auto bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-sm px-4 py-2 rounded-lg transition-colors"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
            {saved && <p className="text-green-400 text-xs mt-2">Saved successfully.</p>}
            {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
          </div>
        </div>
      </section>

      <section className="bg-slate-900 rounded-xl p-6 border border-slate-800">
        <h2 className="text-lg font-medium mb-4">Security</h2>
        <p className="text-slate-500 text-sm">Coming soon.</p>
      </section>
    </div>
  )
}
