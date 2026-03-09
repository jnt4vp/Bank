import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { resetPassword } from '../features/auth/api'
import '../landing.css'

export default function ResetPassword() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(event) {
    event.preventDefault()
    if (password !== confirm) {
      setError("Passwords don't match.")
      return
    }
    setLoading(true)
    setError(null)

    try {
      await resetPassword({ token, newPassword: password })
      setDone(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="landing-page">
      <div className="bg">
        <img src="/Untitled design.gif" alt="" />
      </div>

      <div style={{
        position: "relative",
        zIndex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        gap: "24px",
      }}>
        <div className="logo">
          <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
            <path d="M14 32C14 32 14 24 22 24C30 24 30 18 30 18" stroke="#6b4f1d" strokeWidth="4" strokeLinecap="round"/>
            <path d="M14 26C14 26 14 18 22 18C30 18 30 12 30 12" stroke="#a0813a" strokeWidth="3" strokeLinecap="round" opacity="0.7"/>
          </svg>
          <span className="logo-text">BankSpank</span>
        </div>

        {!token ? (
          <div className="login-card" style={{ textAlign: "center", maxWidth: "360px" }}>
            <p style={{ fontSize: "14px", color: "rgba(60,45,20,0.75)", marginBottom: "16px" }}>
              Invalid reset link. Please request a new one.
            </p>
            <Link to="/forgot-password" className="sign-in-btn" style={{ display: "block", textAlign: "center", textDecoration: "none", padding: "14px", borderRadius: "10px", fontSize: "15px", fontWeight: 600, color: "#fff", background: "linear-gradient(135deg, #c9a24e 0%, #896520 100%)" }}>
              Request Reset Link
            </Link>
          </div>
        ) : done ? (
          <div className="login-card" style={{ textAlign: "center", maxWidth: "360px" }}>
            <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: "24px", color: "#2e1f08", marginBottom: "12px" }}>Password updated!</h2>
            <p style={{ fontSize: "14px", color: "rgba(60,45,20,0.75)", marginBottom: "20px" }}>
              Your password has been reset. You can now sign in.
            </p>
            <Link to="/" className="sign-in-btn" style={{ display: "block", textAlign: "center", textDecoration: "none", padding: "14px", borderRadius: "10px", fontSize: "15px", fontWeight: 600, color: "#fff", background: "linear-gradient(135deg, #c9a24e 0%, #896520 100%)" }}>
              Sign In
            </Link>
          </div>
        ) : (
          <form className="login-card" onSubmit={handleSubmit} style={{ maxWidth: "360px" }}>
            <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: "24px", color: "#2e1f08", marginBottom: "6px" }}>Reset Password</h2>
            <p style={{ fontSize: "14px", color: "rgba(60,45,20,0.75)", lineHeight: 1.6, marginBottom: "20px" }}>
              Enter your new password below.
            </p>

            <label htmlFor="password" className="form-label">New Password</label>
            <input
              id="password"
              type="password"
              className="form-input"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />

            <label htmlFor="confirm" className="form-label">Confirm Password</label>
            <input
              id="confirm"
              type="password"
              className="form-input"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              required
            />

            {error && <div className="text-red-500 text-sm" style={{ marginBottom: "12px" }}>{error}</div>}

            <button type="submit" className="sign-in-btn" disabled={loading}>
              {loading ? "Updating..." : "Update Password"}
            </button>

            <p style={{ marginTop: "14px", fontSize: "14px", textAlign: "center" }}>
              <Link to="/" className="forgot">Back to Sign In</Link>
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
