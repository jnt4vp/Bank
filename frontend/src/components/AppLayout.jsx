import { Outlet, useLocation } from 'react-router-dom'
import Navbar from './Navbar'
import { useAuth } from '../features/auth/context'
import { ThemeProvider, useTheme, DEV_LABELS } from '../features/theme/ThemeContext.jsx'
import './app-layout.css'

const BG_VIDEOS = {
  sky: '/normal.MP4',
  money: '/money2.mp4',
  stormy: '/stomry2.mp4',
  red: '/red2.mp4',
  sunny: '/sunny2.mp4',
}

function AppShell() {
  const location = useLocation()
  const { bg, devOverride, setDevOverride, DEV_MODES } = useTheme()

  const noNavbarRoutes = ['/dashboard', '/transactions', '/pacts', '/goals', '/analytics', '/settings']
  const hideNavbar = noNavbarRoutes.some((path) => location.pathname.startsWith(path))

  const videoSrc = BG_VIDEOS[bg]
  const sliderIndex = DEV_MODES.indexOf(bg)

  return (
    <div className="app-shell" data-theme={bg}>
      <div className="app-shell-bg" aria-hidden="true">
        {videoSrc && (
          <video key={videoSrc} autoPlay loop muted playsInline>
            <source src={videoSrc} type="video/mp4" />
          </video>
        )}
      </div>
      <div className="app-shell-glow app-shell-glow-one" />
      <div className="app-shell-glow app-shell-glow-two" />

      <div className="app-shell-main">
        {!hideNavbar && <Navbar />}
        <main className="app-shell-page-main">
          <Outlet />
        </main>
      </div>

      {import.meta.env.DEV && (
        <div className="dev-bg-switcher">
          <span className="dev-bg-label">{DEV_LABELS[bg]}</span>
          <input
            type="range"
            min={0}
            max={DEV_MODES.length - 1}
            value={sliderIndex === -1 ? 0 : sliderIndex}
            onChange={(e) => setDevOverride(DEV_MODES[Number(e.target.value)])}
          />
          {devOverride && (
            <button className="dev-bg-reset" onClick={() => setDevOverride(null)}>
              reset
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default function AppLayout() {
  const { user, token } = useAuth()

  return (
    <ThemeProvider token={token} userId={user?.id}>
      <AppShell />
    </ThemeProvider>
  )
}
