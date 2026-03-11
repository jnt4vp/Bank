import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";


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
      if (!data.access_token) {
        throw new Error("Sign-in failed");
      }

      localStorage.setItem("token", data.access_token);
      localStorage.setItem("userEmail", email);
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
        <p className="register-link">
          Don't have an account? <Link to="/register">Sign Up</Link>
        </p>
        
      </form>
  );
}
