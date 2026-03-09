import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { useAuth } from '../features/auth/context'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const navigate = useNavigate()
  const { login } = useAuth()

  async function handleSubmit(event) {
    event.preventDefault()
    setLoading(true)
    setError(null)

    const cleanEmail = email.trim().toLowerCase()

    try {
      await login({ email: cleanEmail, password })
      navigate('/dashboard')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form className="login-card" onSubmit={handleSubmit}>
      <label htmlFor="email" className="form-label">Email</label>
      <input
        type="email"
        id="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        required
        placeholder="Email"
        className="form-input"
      />

      <label htmlFor="password" className="form-label">Password</label>
      <input
        id="password"
        type="password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        required
        placeholder="Password"
        className="form-input"
      />
      <Link to="/forgot-password" className="forgot">Forgot password?</Link>
        {error && <div className="text-red-500 text-sm">{error}</div>}

        <button
          type="submit"
          disabled={loading}
          className="sign-in-btn"
        >
          {loading ? "Signing in..." : "Sign In"}
        </button>

        {/* Register Link -- TODO: add class name later */}
        <p style={{ marginTop: "12px", fontSize: "15px"}}>
          Don't have an account? <Link to="/signup">Sign Up</Link>
        </p>
        
      </form>
  )
}
