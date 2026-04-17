import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../features/auth/context";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const navigate = useNavigate();
  const { login } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await login({
        email: email.trim().toLowerCase(),
        password,
      });
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(err.message || "Sign-in failed");
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
        placeholder="Email address"
        required
        className="form-input"
      />

      <label htmlFor="password" className="form-label">Password</label>
      <input
        id="password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
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

      <p className="register-link">
        Don't have an account? <Link to="/register">Sign Up</Link>
      </p>
    </form>
  );
}
