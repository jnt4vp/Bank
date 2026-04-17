import { useState } from 'react'
import { Link } from 'react-router-dom'

import { requestPasswordReset } from '../features/auth/api'
import '../landing.css'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(event) {
    event.preventDefault()
    setLoading(true)
    setError(null)

    const cleanEmail = email.trim().toLowerCase()

    if (!cleanEmail) {
      setError('Email is required.')
      setLoading(false)
      return
    }

    try {
      await requestPasswordReset({ email: cleanEmail })
      setSubmitted(true)
    } catch (err) {
      setError(err.message || 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="landing-page">
      <div className="bg">
        <img src="/Untitled design.gif" alt="" />
      </div>

      <div
        style={{
          position: "relative",
          zIndex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          gap: "24px",
        }}
      >
        <div className="logo">
          <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
            <path
              d="M14 32C14 32 14 24 22 24C30 24 30 18 30 18"
              stroke="#6b4f1d"
              strokeWidth="4"
              strokeLinecap="round"
            />
            <path
              d="M14 26C14 26 14 18 22 18C30 18 30 12 30 12"
              stroke="#a0813a"
              strokeWidth="3"
              strokeLinecap="round"
              opacity="0.7"
            />
          </svg>
          <span className="logo-text">PactBank</span>
        </div>

        {submitted ? (
          <div className="login-card" style={{ textAlign: "center", maxWidth: "360px" }}>
            <h2
              style={{
                fontFamily: "'Playfair Display', serif",
                fontSize: "24px",
                color: "#2e1f08",
                marginBottom: "12px",
              }}
            >
              Check your email
            </h2>
            <p
              style={{
                fontSize: "14px",
                color: "rgba(60,45,20,0.75)",
                lineHeight: 1.7,
                marginBottom: "20px",
              }}
            >
              If an account exists for <strong>{email.trim().toLowerCase()}</strong>, we've sent a password reset link.
            </p>
            <Link
              to="/"
              className="sign-in-btn"
              style={{
                display: "block",
                textAlign: "center",
                textDecoration: "none",
                padding: "14px",
                borderRadius: "10px",
                fontSize: "15px",
                fontWeight: 600,
                color: "#fff",
                background: "linear-gradient(135deg, #c9a24e 0%, #896520 100%)",
              }}
            >
              Back to Sign In
            </Link>
          </div>
        ) : (
          <form className="login-card" onSubmit={handleSubmit} style={{ maxWidth: "360px" }}>
            <h2
              style={{
                fontFamily: "'Playfair Display', serif",
                fontSize: "24px",
                color: "#2e1f08",
                marginBottom: "6px",
              }}
            >
              Forgot Password
            </h2>
            <p
              style={{
                fontSize: "14px",
                color: "rgba(60,45,20,0.75)",
                lineHeight: 1.6,
                marginBottom: "20px",
              }}
            >
              Enter your email and we'll send you a reset link.
            </p>

            <label htmlFor="email" className="form-label">
              Email
            </label>
            <input
              id="email"
              type="email"
              className="form-input"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Email address"
              required
            />

            {error && (
              <div className="text-red-500 text-sm" style={{ marginBottom: "12px" }}>
                {error}
              </div>
            )}

            <button type="submit" className="sign-in-btn" disabled={loading}>
              {loading ? "Sending..." : "Send Reset Link"}
            </button>

            <p style={{ marginTop: "14px", fontSize: "14px", textAlign: "center" }}>
              <Link to="/" className="forgot">
                Back to Sign In
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
