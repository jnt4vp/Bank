import { useNavigate } from 'react-router-dom'
import '../landing.css'

export default function Landing() {
  const navigate = useNavigate()

  return (
    <>
      <div className="bg">
        <img src="/sky.jpg" alt="" />
      </div>

      <div className="container">

        {/* LEFT */}
        <div className="left">

          <div className="logo">
            <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
              <path d="M14 32C14 32 14 24 22 24C30 24 30 18 30 18" stroke="#6b4f1d" strokeWidth="4" strokeLinecap="round"/>
              <path d="M14 26C14 26 14 18 22 18C30 18 30 12 30 12" stroke="#a0813a" strokeWidth="3" strokeLinecap="round" opacity="0.7"/>
            </svg>
            <span className="logo-text">BankSpank</span>
          </div>

          <div className="subtitle">Accountability Banking</div>

          <h1 className="headline">Break your limits.<br />Pay yourself back.</h1>

          <p className="description">Break your honïls erevring an break their familts. Pay yourself back. urneshing your banking sales and its functions.</p>

          <div className="login-card">
            <label className="form-label">Email</label>
            <input className="form-input" type="email" placeholder="Enter your email" />

            <label className="form-label">Password</label>
            <input className="form-input" type="password" placeholder="Enter your password" />

            <a className="forgot" href="#">Forgot password?</a>

            <button className="sign-in-btn" onClick={() => navigate('/login')}>Sign In</button>
          </div>
        </div>

        {/* RIGHT */}
        <div className="right">
          <div className="dashboard-card">

            <div className="progress-ring-wrapper">
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
              <div className="score-overlay">
                <div className="score-value">82<span>%</span></div>
                <div className="score-label">Discipline Score</div>
              </div>
            </div>

            <div className="stats">
              <div className="stat-row"><strong>$145</strong> automatically<br />transferred to savings</div>
              <div className="stat-row secondary">3 penalties triggered<br />this month</div>
            </div>

            <div className="chart-area">
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
    </>
  )
}
