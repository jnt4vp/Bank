import { useAuth } from '../features/auth/context'

export default function Settings() {
  const { user } = useAuth()

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
        <p className="text-slate-500 text-sm">Coming soon.</p>
      </section>

      <section className="bg-slate-900 rounded-xl p-6 border border-slate-800">
        <h2 className="text-lg font-medium mb-4">Security</h2>
        <p className="text-slate-500 text-sm">Coming soon.</p>
      </section>
    </div>
  )
}
