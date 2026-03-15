import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { User, Mail, Lock, Phone, Eye, EyeOff } from "lucide-react";
import "../landing.css";
import "../register.css";
import { registerAccount } from "../features/auth/api";
import { createPact } from "../features/pacts/api";
import { saveAccountabilitySettings } from "../features/accountability/api";


const STEPS = [
  { num: 1, label: "Create Account" },
  { num: 2, label: "Set Your Pact" },
  { num: 3, label: "Choose Accountability" },
  { num: 4, label: "Connect Bank" },
];

const PACT_OPTIONS = [
  {
    id: "no_eating_out_weekdays",
    title: "No eating out on weekdays",
    reason: "Save money and build discipline",
    goal: "Save $250 this month",
  },
  {
    id: "limit_takeout_once_week",
    title: "Limit takeout to once per week",
    reason: "Reduce unnecessary food spending",
    goal: "Cut takeout costs by $100 this month",
  },
  {
    id: "one_coffee_per_week",
    title: "Only one coffee shop drink per week",
    reason: "Lower small daily spending",
    goal: "Save $40 this month",
  },
  {
    id: "no_online_shopping_month",
    title: "No online shopping this month",
    reason: "Avoid impulse purchases",
    goal: "Save $150 this month",
  },
  {
    id: "weekly_spending_limit",
    title: "Stay under a weekly spending limit",
    reason: "Control discretionary spending",
    goal: "Stay under $75 per week",
  },
  {
    id: "save_fixed_amount",
    title: "Save a fixed amount this month",
    reason: "Build savings consistently",
    goal: "Save $300 this month",
  },
  {
    id: "wait_48_hours",
    title: "Wait 48 hours before non-essential purchases",
    reason: "Reduce impulse buying",
    goal: "Avoid at least 3 impulse purchases this month",
  },
  {
    id: "no_clothing_purchases",
    title: "No clothing purchases for 30 days",
    reason: "Pause unnecessary shopping",
    goal: "Save $100 this month",
  },
];

export default function Register() {
  const [currentStep, setCurrentStep] = useState(1);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [showConf, setShowConf] = useState(false);
  const [phone, setPhone] = useState("");

  const [registeredUser, setRegisteredUser] = useState(null);

  const [selectedPactId, setSelectedPactId] = useState("");
  const [pactTitle, setPactTitle] = useState("");
  const [pactReason, setPactReason] = useState("");
  const [pactGoal, setPactGoal] = useState("");

  const [accountabilityType, setAccountabilityType] = useState("");
  const [disciplineSavingsPercent, setDisciplineSavingsPercent] = useState("");
  const [accountabilityNote, setAccountabilityNote] = useState("");

  const [bankChoice, setBankChoice] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const navigate = useNavigate();

  const EyeBtn = ({ show, onToggle }) => (
    <button
      type="button"
      className="register-eye-btn"
      onClick={onToggle}
      aria-label="Toggle password visibility"
    >
      {show ? <EyeOff size={18} /> : <Eye size={18} />}
    </button>
  );

  const handlePactSelect = (e) => {
    const selectedId = e.target.value;
    setSelectedPactId(selectedId);

    const selectedPact = PACT_OPTIONS.find((p) => p.id === selectedId);

    if (selectedPact) {
      setPactTitle(selectedPact.title);
      setPactReason(selectedPact.reason);
      setPactGoal(selectedPact.goal);
    } else {
      setPactTitle("");
      setPactReason("");
      setPactGoal("");
    }
  };

  const goNext = () => {
    setError(null);
    setCurrentStep((prev) => Math.min(prev + 1, 4));
  };

  const goBack = () => {
    setError(null);
    setCurrentStep((prev) => Math.max(prev - 1, 1));
  };

  const handleDoLater = () => {
    if (currentStep < 4) {
      goNext();
    } else {
      navigate("/");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (currentStep === 1) {
      if (!name.trim()) {
        setError("Name is required.");
        return;
      }

      if (!email.trim()) {
        setError("Email is required.");
        return;
      }

      if (!password.trim()) {
        setError("Password is required.");
        return;
      }

      if (password.length < 8) {
        setError("Password must be at least 8 characters.");
        return;
      }

      if (password !== confirm) {
        setError("Passwords do not match.");
        return;
      }

      if (!phone.trim()) {
        setError("Phone number is required.");
        return;
      }

      setLoading(true);

      try {
        const newUser = await registerAccount({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
        phone: phone.trim(),
      });
      
      const createdUser = newUser?.user || newUser?.data || newUser;
      console.log("REGISTER RESPONSE:", newUser);
      console.log("CREATED USER:", createdUser);
      
      setRegisteredUser(createdUser);
      setCurrentStep(2);

      } catch (err) {
        setError(err.message || "Registration failed!");
      } finally {
        setLoading(false);
      }

      return;
    }

    if (currentStep === 2) {
      if (!registeredUser?.id) {
        setError("User account was not created correctly. Please restart registration.");
        return;
      }

      if (!pactTitle.trim()) {
        setError("Please choose a pact.");
        return;
      }

      if (!pactReason.trim()) {
        setError("Please add a reason for your pact.");
        return;
      }

      if (!pactGoal.trim()) {
        setError("Please add a goal for your pact.");
        return;
      }

      setLoading(true);

      try {
        await createPact({
          user_id: registeredUser.id,
          template_id: selectedPactId || null,
          title: pactTitle.trim(),
          reason: pactReason.trim(),
          goal: pactGoal.trim(),
          status: "active",
        });

        goNext();
      } catch (err) {
        setError(err.message || "Failed to save pact.");
      } finally {
        setLoading(false);
      }

      return;
    }

    if (currentStep === 3) {
      if (!accountabilityType) {
        setError("Please choose an accountability action.");
        return;
      }

      if (
        (accountabilityType === "savings_percentage" ||
          accountabilityType === "both") &&
        !disciplineSavingsPercent.trim()
      ) {
        setError("Please enter a discipline savings percentage.");
        return;
      }

      const percentValue = Number(disciplineSavingsPercent);

      if (
        accountabilityType === "savings_percentage" ||
        accountabilityType === "both"
      ) {
        if (Number.isNaN(percentValue) || percentValue <= 0) {
          setError("Discipline savings percentage must be greater than 0.");
          return;
        }

        if (percentValue > 100) {
          setError("Discipline savings percentage cannot be more than 100.");
          return;
        }
      }

      setLoading(true);

      try {
        await saveAccountabilitySettings({
          accountability_type: accountabilityType,
          discipline_savings_percentage:
            accountabilityType === "email" ? 0 : percentValue,
          accountability_note: accountabilityNote.trim(),
        });

        goNext();
      } catch (err) {
        setError(err.message || "Failed to save accountability settings.");
      } finally {
        setLoading(false);
      }

      return;
    }

    if (currentStep === 4) {
      console.log("Prototype complete:", {
        registeredUser,
        name,
        email,
        phone,
        selectedPactId,
        pactTitle,
        pactReason,
        pactGoal,
        accountabilityType,
        disciplineSavingsPercent,
        accountabilityNote,
        bankChoice,
      });

      navigate("/");
    }
  };

  return (
    <div className="landing-page">
      <div className="bg">
        <img src="/Untitled design.gif" alt="" />
      </div>

      <div className="container register-container">
        <div className="left brand-left register-left">
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
            <span className="logo-text brand-logo-text">PactBank</span>
          </div>

          <div className="subtitle brand-eyebrow">Accountability Banking</div>

          <h1 className="headline brand-title">Start your pact.</h1>
          <h2 className="landing-subline brand-subtitle">
            Build discipline. Earn freedom.
          </h2>

          <p className="description brand-copy">
            Take control of your spending.
            <br />
            Let PactBank hold you accountable.
          </p>

          <div className="register-visual-small">
            <img
              className="register-visual-small-img"
              src="/reg_pic.png"
              alt="Financial growth illustration"
            />
            <span className="visual-chip chip-goals">Set Goals</span>
            <span className="visual-chip chip-penalties">Build Discipline</span>
            <span className="visual-chip chip-discipline">Save Smarter</span>
          </div>
        </div>

        <div className="right register-right-panel">
          <div className="register-card">
            <div className="register-steps">
              {STEPS.map((s, i) => (
                <div key={s.num} className="register-step">
                  {i < STEPS.length - 1 && (
                    <div
                      className={`register-step-connector${
                        currentStep > s.num ? " active" : ""
                      }`}
                    />
                  )}
                  <div
                    className={`register-step-circle${
                      currentStep === s.num ? " active" : ""
                    }`}
                  >
                    {s.num}
                  </div>
                  <div
                    className={`register-step-label${
                      currentStep === s.num ? " active" : ""
                    }`}
                  >
                    {s.label}
                  </div>
                </div>
              ))}
            </div>

            <form onSubmit={handleSubmit}>
              {currentStep === 1 && (
                <>
                  <h2 className="register-card-title">Create your account</h2>
                  <p className="register-card-sub">
                    Your <span className="gold">future self</span> is counting
                    on you.
                  </p>

                  <label className="register-field-label">Full Name</label>
                  <div className="register-input-row">
                    <span className="register-input-icon">
                      <User size={16} strokeWidth={1.5} />
                    </span>
                    <input
                      className="register-input"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Enter your name"
                      required
                    />
                  </div>

                  <label className="register-field-label">Email</label>
                  <div className="register-input-row">
                    <span className="register-input-icon">
                      <Mail size={16} strokeWidth={1.5} />
                    </span>
                    <input
                      className="register-input"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Enter your email"
                      required
                    />
                  </div>

                  <label className="register-field-label">Password</label>
                  <div className="register-input-row">
                    <span className="register-input-icon">
                      <Lock size={16} strokeWidth={1.5} />
                    </span>
                    <input
                      className="register-input has-right"
                      type={showPass ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Create a strong password"
                      required
                    />
                    <span className="register-input-eye">
                      <EyeBtn
                        show={showPass}
                        onToggle={() => setShowPass((p) => !p)}
                      />
                    </span>
                  </div>

                  <label className="register-field-label">
                    Confirm Password
                  </label>
                  <div className="register-input-row">
                    <span className="register-input-icon">
                      <Lock size={16} strokeWidth={1.5} />
                    </span>
                    <input
                      className="register-input has-right"
                      type={showConf ? "text" : "password"}
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      placeholder="Confirm your password"
                      required
                    />
                    <span className="register-input-eye">
                      <EyeBtn
                        show={showConf}
                        onToggle={() => setShowConf((p) => !p)}
                      />
                    </span>
                  </div>

                  <label className="register-field-label">Phone Number</label>
                  <div className="register-input-row">
                    <span className="register-input-icon">
                      <Phone size={16} strokeWidth={1.5} />
                    </span>
                    <input
                      className="register-input"
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="Enter your phone number"
                      required
                    />
                  </div>

                  {error && <div className="register-error">{error}</div>}

                  <button
                    type="submit"
                    className="sign-in-btn register-btn-continue"
                    disabled={loading}
                  >
                    {loading ? "Creating Account…" : <>Continue <span>→</span></>}
                  </button>

                  <div className="register-divider">
                    <div className="register-divider-line" />
                    <span className="register-divider-text">or</span>
                    <div className="register-divider-line" />
                  </div>

                  <button type="button" className="register-btn-google">
                    <svg width="18" height="18" viewBox="0 0 24 24">
                      <path
                        fill="#4285F4"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      />
                    </svg>
                    Continue with Google
                  </button>

                  <p className="registerpage-link">
                    <span
                      style={{
                        opacity: 0.6,
                        fontWeight: 500,
                        fontSize: "15px",
                      }}
                    >
                      Already have an account?{" "}
                    </span>
                    <Link
                      to="/"
                      className="register-signin-glow"
                      style={{
                        color: "#B8962E",
                        fontWeight: 600,
                        textDecoration: "none",
                        fontSize: "15px",
                      }}
                    >
                      Sign In
                    </Link>
                  </p>
                </>
              )}

              {currentStep === 2 && (
                <>
                  <h2 className="register-card-title">Set your pact</h2>
                  <p className="register-card-sub">
                    Choose a promise you want your money to support.
                  </p>

                  <label className="register-field-label">Choose a pact</label>
                  <div className="register-input-row">
                    <select
                      className="register-input"
                      value={selectedPactId}
                      onChange={handlePactSelect}
                    >
                      <option value="">Select a pact</option>
                      {PACT_OPTIONS.map((pact) => (
                        <option key={pact.id} value={pact.id}>
                          {pact.title}
                        </option>
                      ))}
                    </select>
                  </div>

                  <label className="register-field-label">Your pact</label>
                  <div className="register-input-row">
                    <input
                      className="register-input"
                      value={pactTitle}
                      onChange={(e) => setPactTitle(e.target.value)}
                      placeholder="Example: No eating out on weekdays"
                    />
                  </div>

                  <label className="register-field-label">Why this pact?</label>
                  <div className="register-input-row">
                    <input
                      className="register-input"
                      value={pactReason}
                      onChange={(e) => setPactReason(e.target.value)}
                      placeholder="Example: Save money and build discipline"
                    />
                  </div>

                  <label className="register-field-label">Your goal</label>
                  <div className="register-input-row">
                    <input
                      className="register-input"
                      value={pactGoal}
                      onChange={(e) => setPactGoal(e.target.value)}
                      placeholder="Example: Save $250 this month"
                    />
                  </div>

                  {error && <div className="register-error">{error}</div>}

                  <div className="register-action-row">
                    <button
                      type="button"
                      className="register-secondary-btn"
                      onClick={goBack}
                    >
                      Back
                    </button>

                    <button
                      type="submit"
                      className="sign-in-btn register-btn-continue"
                      disabled={loading}
                    >
                      {loading ? "Saving..." : <>Continue <span>→</span></>}
                    </button>
                  </div>

                  <button
                    type="button"
                    className="register-skip-btn"
                    onClick={handleDoLater}
                  >
                    Do this later
                  </button>
                </>
              )}

              {currentStep === 3 && (
                <>
                  <h2 className="register-card-title">
                    Choose accountability actions
                  </h2>
                  <p className="register-card-sub">
                    Set what happens if you break your pact.
                  </p>

                  <div className="penalty-prototype-list">
                    <label className="prototype-option">
                      <input
                        type="radio"
                        name="accountability"
                        checked={accountabilityType === "email"}
                        onChange={() => setAccountabilityType("email")}
                      />
                      <span>Send me an acknowledgment email</span>
                    </label>

                    <label className="prototype-option">
                      <input
                        type="radio"
                        name="accountability"
                        checked={accountabilityType === "savings_percentage"}
                        onChange={() =>
                          setAccountabilityType("savings_percentage")
                        }
                      />
                      <span>
                        Send a percentage of violating purchases to savings
                      </span>
                    </label>

                    <label className="prototype-option">
                      <input
                        type="radio"
                        name="accountability"
                        checked={accountabilityType === "both"}
                        onChange={() => setAccountabilityType("both")}
                      />
                      <span>Send email and redirect to savings</span>
                    </label>
                  </div>

                  {(accountabilityType === "savings_percentage" ||
                    accountabilityType === "both") && (
                    <>
                      <label className="register-field-label">
                        Discipline savings percentage
                      </label>
                      <div className="register-input-row">
                        <input
                          className="register-input"
                          type="number"
                          min="1"
                          max="100"
                          step="1"
                          value={disciplineSavingsPercent}
                          onChange={(e) =>
                            setDisciplineSavingsPercent(e.target.value)
                          }
                          placeholder="Example: 25"
                        />
                      </div>
                      <p
                        className="register-card-sub"
                        style={{ marginTop: "8px" }}
                      >
                        If you break your pact, this percentage of the purchase
                        will be redirected to your savings.
                      </p>
                    </>
                  )}

                  {(accountabilityType === "email" ||
                    accountabilityType === "both") && (
                    <>
                      <label className="register-field-label">
                        Accountability note
                      </label>
                      <div className="register-input-row">
                        <input
                          className="register-input"
                          value={accountabilityNote}
                          onChange={(e) => setAccountabilityNote(e.target.value)}
                          placeholder="Example: Remind me why I made this pact"
                        />
                      </div>
                    </>
                  )}

                  {error && <div className="register-error">{error}</div>}

                  <div className="register-action-row">
                    <button
                      type="button"
                      className="register-secondary-btn"
                      onClick={goBack}
                    >
                      Back
                    </button>

                    <button
                      type="submit"
                      className="sign-in-btn register-btn-continue"
                      disabled={loading}
                    >
                      {loading ? "Saving..." : <>Continue <span>→</span></>}
                    </button>
                  </div>

                  <button
                    type="button"
                    className="register-skip-btn"
                    onClick={handleDoLater}
                  >
                    Do this later
                  </button>
                </>
              )}

              {currentStep === 4 && (
                <>
                  <h2 className="register-card-title">Connect your bank</h2>
                  <p className="register-card-sub">
                    Securely link your account when you’re ready.
                  </p>

                  <div className="bank-prototype-box">
                    <div className="penalty-prototype-list">
                      <label className="prototype-option">
                        <input
                          type="radio"
                          name="bank"
                          checked={bankChoice === "plaid"}
                          onChange={() => setBankChoice("plaid")}
                        />
                        <span>Connect with Plaid</span>
                      </label>

                      <label className="prototype-option">
                        <input
                          type="radio"
                          name="bank"
                          checked={bankChoice === "manual"}
                          onChange={() => setBankChoice("manual")}
                        />
                        <span>Set up manually later</span>
                      </label>
                    </div>
                  </div>

                  {error && <div className="register-error">{error}</div>}

                  <div className="register-action-row">
                    <button
                      type="button"
                      className="register-secondary-btn"
                      onClick={goBack}
                    >
                      Back
                    </button>

                    <button
                      type="submit"
                      className="sign-in-btn register-btn-continue"
                    >
                      Finish <span>→</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    className="register-skip-btn"
                    onClick={handleDoLater}
                  >
                    Do this later
                  </button>
                </>
              )}
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}