import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function Register() {
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [phone, setPhone] = useState("");
   // TODO/Suggest: If successful & have more time, add a next page for more details (bday, etc)
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true)
        setError(null);

        try {
            const res = await fetch("http://localhost:8000/api/auth/register", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                // convert JS object to JSON string
                body: JSON.stringify({
                    name,
                    email,
                    password,
                    phone
                })
            });

            if (!res.ok) {
                //const body = await res.json().catch(() => null);
                //throw new Error(body?.detail || "Registration failed");
                throw new Error("Registration is not available yet.");
            }
            // if successful
            navigate("/");
        } catch (err) {
            //setError(err.message);
            setError("Registration backend not connected yet.");
        } finally {
            setLoading(false);
        }
    };

    // UI
    return (
        <form className="login-card" onSubmit={handleSubmit}>
            <label className="form-label">Name</label>
            <input
                className="form-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
            />

            {/* email */}
            <label className="form-label">Email</label>
            <input
                className="form-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
            />

            {/* password */}
            <label className="form-label">Password</label>
            <input
                className="form-input"
                type="password"
                value={[password]}
                onChange={(e) => setPassword(e.target.value)}
                required
            />

            {/* phone */}
            <label className="form-label">Phone Number</label>
            <input
                className="form-input"
                value={[phone]}
                onChange={(e) => setPhone(e.target.value)}
            />

            {error && <div className="text-red-500 text-sm">{error}</div>}

            <button 

                className="sign-in-btn">
                    Sign Up
            </button>
        </form>
    );
}
