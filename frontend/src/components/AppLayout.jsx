import { Outlet, useLocation } from 'react-router-dom'
import Navbar from './Navbar'
import './app-layout.css'

export default function AppLayout() {
  const location = useLocation()
  const isDashboardRoute = location.pathname === '/dashboard'

  return (
    <div className="app-shell">
      <div className="app-shell-bg" aria-hidden="true" />
      <div className="app-shell-glow app-shell-glow-one" />
      <div className="app-shell-glow app-shell-glow-two" />

      <div className="app-shell-main">
        {!isDashboardRoute && <Navbar />}
        <main className={isDashboardRoute ? 'app-shell-dashboard-main' : 'app-shell-page-main'}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
