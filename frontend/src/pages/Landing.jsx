import '../landing.css'
import Login from './Login'

export default function Landing() {

  return (
    <div className="landing-page">
      <div className="bg">
        <video autoPlay loop muted playsInline>
          <source src="/normal.MP4" type="video/mp4" />
        </video>
      </div>

      <div className="container">

        {/* LEFT */}
        <div className="left brand-left">
          <div className="left-top">
            <div className="logo">
              <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
                <path d="M14 32C14 32 14 24 22 24C30 24 30 18 30 18" stroke="#6b4f1d" strokeWidth="4" strokeLinecap="round"/>
                <path d="M14 26C14 26 14 18 22 18C30 18 30 12 30 12" stroke="#a0813a" strokeWidth="3" strokeLinecap="round" opacity="0.7"/>
              </svg>
              <span className="logo-text brand-logo-text">PactBank</span>
            </div>

            <div className="subtitle brand-eyebrow">Accountability Banking</div>

            <h1 className="headline brand-title">Commit to your pact.</h1>
            <h2 className="landing-subline brand-subtitle">
              Build discipline. Earn freedom.
            </h2>



            <p className="description brand-copy">
              PactBank helps you stay accountable to your goals.
              Build habits, enforce discipline, and grow your future.
            </p>
          </div>

          <div className="left-bottom">
            <Login />
          </div>
        </div>

        {/* RIGHT */}
        <div className="right">
          <div className="landing-dashboard-card">

            <div className="landing-progress-ring-wrapper">
              <svg viewBox="0 0 220 220">
                <defs>
                  <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#d4aa4f"/>
                    <stop offset="50%" stopColor="#b8882e"/>
                    <stop offset="100%" stopColor="#7a5518"/>
                  </linearGradient>
                </defs>
                <circle cx="110" cy="110" r="95" fill="none"
                  stroke="rgba(180,170,150,0.1)" strokeWidth="14"
                  strokeLinecap="round" strokeDasharray="478" strokeDashoffset="80"
                  transform="rotate(140 110 110)"/>
                <circle cx="110" cy="110" r="95" fill="none"
                  stroke="url(#goldGrad)" strokeWidth="14"
                  strokeLinecap="round" strokeDasharray="478" strokeDashoffset="166"
                  transform="rotate(140 110 110)"/>
              </svg>
              <div className="landing-score-overlay">
                <div className="landing-score-value">—</div>
                <div className="landing-score-label">Your live discipline score</div>
                <div className="landing-score-hint">Shown on your dashboard after sign in</div>
              </div>
            </div>

            <div className="landing-stats">
              <div className="landing-stat-row">
                <strong>—</strong> automatic savings<br />from kept pacts
              </div>
              <div className="landing-stat-row landing-stat-row-secondary">
                Your penalties and wins<br />appear after sign in
              </div>
            </div>

            <div className="landing-chart-area">
              <svg viewBox="0 0 400 90" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#c9a04e" stopOpacity="0.45"/>
                    <stop offset="100%" stopColor="#c9a04e" stopOpacity="0"/>
                  </linearGradient>
                  <marker id="arrowHead" markerWidth="10" markerHeight="8" refX="5" refY="4" orient="auto">
                    <path d="M0,0 L10,4 L0,8 Z" fill="#c9a04e"/>
                  </marker>
                </defs>
                <path fill="url(#areaGrad)" d="M0,80 C30,78 60,75 100,68 C140,60 180,52 220,44 C260,36 300,24 340,16 C360,12 380,8 400,4 L400,90 L0,90 Z"/>
                <path fill="none" stroke="#c9a04e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                  d="M0,80 C30,78 60,75 100,68 C140,60 180,52 220,44 C260,36 300,24 340,16 C360,12 380,8 395,5"
                  markerEnd="url(#arrowHead)"/>
              </svg>
            </div>

          </div>
        </div>

      </div>
    </div>
  )
}
