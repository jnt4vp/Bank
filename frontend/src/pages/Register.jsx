import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { registerAccount } from '../features/auth/api'

export default function Register() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const navigate = useNavigate()

  async function handleSubmit(event) {
    event.preventDefault()
    setLoading(true)
    setError(null)

    if (!name.trim()) {
      setError('Name is required')
      setLoading(false)
      return
    }

    if (!email.trim()) {
      setError('Email is required')
      setLoading(false)
      return
    }

    if (!password.trim()) {
      setError('Password is required')
      setLoading(false)
      return
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      setLoading(false)
      return
    }

    try {
      await registerAccount({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
        phone: phone.trim(),
      })
      navigate('/')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form className="login-card" onSubmit={handleSubmit}>
      <label htmlFor="name" className="form-label">
        Name
      </label>
      <input
        id="name"
        type="text"
        value={name}
        onChange={(event) => setName(event.target.value)}
        required
        className="form-input"
      />

      <label htmlFor="email" className="form-label">
        Email
      </label>
      <input
        id="email"
        type="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        required
        className="form-input"
      />

      <label htmlFor="password" className="form-label">
        Password
      </label>
      <input
        id="password"
        type="password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        required
        className="form-input"
      />

      <label htmlFor="phone" className="form-label">
        Phone Number
      </label>
      <input
        id="phone"
        type="text"
        value={phone}
        onChange={(event) => setPhone(event.target.value)}
        className="form-input"
      />

      {error && <div className="text-red-500 text-sm">{error}</div>}

      <button
        type="submit"
        disabled={loading}
        className="sign-in-btn"
      >
        {loading ? "Creating Account..." : "Sign Up"}
      </button>

      <p style={{ marginTop: "12px", fontSize: "15px" }}>
        Already have an account? <Link to="/">Sign In</Link>
      </p>
    </form>
  )
}
