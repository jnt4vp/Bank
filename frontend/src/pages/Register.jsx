import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";

export default function Register() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (!name.trim()) {
      setError("Name is required");
      setLoading(false);
      return;
    }

    if (!email.trim()) {
      setError("Email is required");
      setLoading(false);
      return;
    }

    if (!password.trim()) {
      setError("Password is required");
      setLoading(false);
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("http://localhost:8000/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          password,
          phone,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(
          body?.detail || body?.message || res.statusText || "Registration failed"
        );
      }

      await res.json().catch(() => null);
      navigate("/");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="login-card" onSubmit={handleSubmit}>
      <label htmlFor="name" className="form-label">
        Name
      </label>
      <input
        id="name"
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
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
        onChange={(e) => setEmail(e.target.value)}
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
        onChange={(e) => setPassword(e.target.value)}
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
        onChange={(e) => setPhone(e.target.value)}
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
  );
}