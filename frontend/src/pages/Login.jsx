import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("http://localhost:8000/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.detail || body?.message || res.statusText || "Sign-in failed");
      }

      const data = await res.json();
      if (data.access_token) {
        localStorage.setItem("token", data.access_token);
      }
      navigate("/dashboard");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="login-card" onSubmit={handleSubmit}>
           <label htmlFor="email" className="form-label">Email</label>
          <input
            type="email"
            id="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="form-input"
          />

          <label htmlFor="password" className="form-label">Password</label>
          <input
          id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="form-input"
          />
 <a className="forgot" href="#">Forgot password?</a>
        {error && <div className="text-red-500 text-sm">{error}</div>}

        <button
          type="submit"
          disabled={loading}
          className="sign-in-btn"
        >
          {loading ? "Signing in..." : "Sign In"}
        </button>
      </form>
  );
}

// import { useState } from 'react'
// import { useNavigate } from 'react-router-dom'

// export default function Login() {
//   const [username, setUsername] = useState('')
//   const [password, setPassword] = useState('')
//   const navigate = useNavigate()

//   function handleSubmit(e) {
//     e.preventDefault()
//     if (!username.trim()) return
//     localStorage.setItem('user', username.trim())
//     navigate('/dashboard')
//   }

//   return (
//          <div className="login-card">
//             <label className="form-label">Email</label>
//             <input className="form-input" type="email" placeholder="Enter your email" />

//             <label className="form-label">Password</label>
//             <input className="form-input" type="password" placeholder="Enter your password" />

//             <a className="forgot" href="#">Forgot password?</a>

//             <button className="sign-in-btn" onClick={() => navigate('/login')}>Sign In</button>
//           </div>
//   )
// }
