import React, { useState, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { usePlaidLink } from "react-plaid-link";
import { User, Mail, Phone } from "lucide-react";
import "../landing.css";
import "../register.css";
import { useAuth } from "../features/auth/context";
import { registerAccount } from "../features/auth/api";
import { validatePassword } from "../features/auth/passwordValidation";
import PasswordFields from "../features/auth/PasswordFields";
import { createPact } from "../features/pacts/api";
import { saveAccountabilitySettings } from "../features/accountability/api";
import { createLinkToken, exchangePublicToken } from "../features/plaid/api";
import {
  PLAID_BROWSER_TAB_ERROR,
  isEmbeddedBrowserContext,
} from "../features/plaid/browserContext";

const STEPS = [
  { num: 1, label: "Create Account" },
  { num: 2, label: "Choose Spending Pact" },
  { num: 3, label: "Choose Accountability" },
  { num: 4, label: "Connect Bank" },
];

const PACT_OPTIONS = [
  { id: "dining_out", title: "Dining out" },
  { id: "coffee_shops", title: "Coffee shops" },
  { id: "online_shopping", title: "Online shopping" },
  { id: "entertainment", title: "Entertainment" },
  { id: "ride_share", title: "Ride share" },
  { id: "fast_food", title: "Fast food" },
  { id: "convenience_store", title: "Convenience stores" },
  { id: "general_discretionary", title: "Non-essential spending" },
];

export default function Register() {
  const [currentStep, setCurrentStep] = useState(1);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [phone, setPhone] = useState("");

  const [registeredUser, setRegisteredUser] = useState(null);
  const [createdPact, setCreatedPact] = useState(null);

  const [selectedPactId, setSelectedPactId] = useState("");
  const [customPactTitle, setCustomPactTitle] = useState("");

  const [accountabilityType, setAccountabilityType] = useState("");
  const [disciplineSavingsPercent, setDisciplineSavingsPercent] = useState("");
  const [accountabilityNote, setAccountabilityNote] = useState("");

  const [authToken, setAuthToken] = useState(null);

  const [linkToken, setLinkToken] = useState(null);
  const [plaidConnected, setPlaidConnected] = useState(false);
  const [connectedInstitution, setConnectedInstitution] = useState(null);
  const [plaidTokenLoading, setPlaidTokenLoading] = useState(false);
  const [plaidLaunchRequested, setPlaidLaunchRequested] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [touched, setTouched] = useState({ name: false, email: false, confirm: false, phone: false });
  const embeddedBrowser = isEmbeddedBrowserContext();

  const touch = (field) => setTouched((t) => ({ ...t, [field]: true }));

  const fieldErrors = {
    name: !name.trim() ? "Name is required" : null,
    email: !email.trim() ? "Email is required" : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? "Enter a valid email address" : null,
    confirm: confirm && password !== confirm ? "Passwords do not match" : !confirm ? "Please confirm your password" : null,
    phone: !phone.trim() ? "Phone number is required" : null,
  };

  const InlineError = ({ field }) =>
    touched[field] && fieldErrors[field] ? (
      <p style={{ color: "#c0392b", fontSize: "12px", margin: "-8px 0 8px 2px" }}>{fieldErrors[field]}</p>
    ) : null;

  const navigate = useNavigate();
  const { refreshUser } = useAuth();

  const handlePactSelect = (e) => {
    setSelectedPactId(e.target.value);
  };

  const handleCustomPactChange = (e) => {
    setCustomPactTitle(e.target.value);
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
      navigate("/dashboard", { replace: true });
    }
  };

  const onPlaidSuccess = useCallback(
    async (publicToken, metadata) => {
      setLoading(true);
      setError(null);
      setPlaidLaunchRequested(false);
      try {
        await exchangePublicToken({
          publicToken,
          institutionName: metadata?.institution?.name || null,
          token: authToken,
        });
        setPlaidConnected(true);
        setConnectedInstitution(metadata?.institution?.name || "Your bank");
      } catch (err) {
        setError(err.message || "Failed to connect bank account.");
      } finally {
        setLoading(false);
      }
    },
    [authToken]
  );

  const { open: openPlaidLink, ready: plaidReady } = usePlaidLink({
    token: linkToken,
    onSuccess: onPlaidSuccess,
    onExit: (err) => {
      setPlaidLaunchRequested(false);
      if (err) {
        setError(
          err.display_message ||
            err.error_message ||
            "Plaid was closed before completion."
        );
      }
    },
  });

  React.useEffect(() => {
    if (currentStep !== 4 || !authToken || linkToken || plaidConnected) {
      return undefined;
    }

    let cancelled = false;

    async function primePlaidLink() {
      setPlaidTokenLoading(true);

      try {
        const { link_token } = await createLinkToken(authToken);

        if (!cancelled) {
          setLinkToken(link_token);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Failed to initialize bank connection.");
        }
      } finally {
        if (!cancelled) {
          setPlaidTokenLoading(false);
        }
      }
    }

    primePlaidLink();

    return () => {
      cancelled = true;
    };
  }, [authToken, currentStep, linkToken, plaidConnected]);

  React.useEffect(() => {
    if (
      !plaidLaunchRequested ||
      embeddedBrowser ||
      !linkToken ||
      !plaidReady
    ) {
      return;
    }

    setPlaidLaunchRequested(false);
    setError(null);
    openPlaidLink();
  }, [
    embeddedBrowser,
    linkToken,
    openPlaidLink,
    plaidLaunchRequested,
    plaidReady,
  ]);

  const handleOpenPlaid = async () => {
    if (embeddedBrowser) {
      setError(PLAID_BROWSER_TAB_ERROR);
      return;
    }

    if (!authToken) {
      setError("Please complete registration first.");
      return;
    }

    if (!linkToken) {
      setPlaidLaunchRequested(true);
      setPlaidTokenLoading(true);

      try {
        const { link_token } = await createLinkToken(authToken);
        setLinkToken(link_token);
        setError(null);
      } catch (err) {
        setPlaidLaunchRequested(false);
        setError(err.message || "Failed to initialize bank connection.");
      } finally {
        setPlaidTokenLoading(false);
      }

      return;
    }

    if (!plaidReady) {
      setPlaidLaunchRequested(true);
      setError("Secure bank connection is still loading. It will open automatically when ready.");
      return;
    }

    setPlaidLaunchRequested(false);
    setError(null);
    openPlaidLink();
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

      const passwordError = validatePassword(password, email.trim());
      if (passwordError) {
        setError(passwordError);
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

        const nextToken = newUser?.access_token || null;
        const createdUser = newUser?.user || newUser?.data || newUser;

        if (!nextToken) {
          throw new Error("Registration succeeded but no access token was returned.");
        }

        setRegisteredUser(createdUser);
        setAuthToken(nextToken);
        await refreshUser(nextToken);
        setCurrentStep(2);
      } catch (err) {
        console.error("REGISTER ERROR:", err);
        setError(
          err?.detail ||
            err?.message ||
            JSON.stringify(err) ||
            "Registration failed."
        );
      } finally {
        setLoading(false);
      }

      return;
    }

    if (currentStep === 2) {
      if (!registeredUser?.id) {
        setError(
          "User account was not created correctly. Please restart registration."
        );
        return;
      }

      const selectedPact = PACT_OPTIONS.find((p) => p.id === selectedPactId);
      const presetCategory = selectedPact?.title || null;
      const customCategory = customPactTitle.trim() || null;
      const finalCategory = customCategory || presetCategory;

      if (!finalCategory) {
        setError("Please choose a pact or enter your own category.");
        return;
      }

      setLoading(true);

      try {
        let created = null;

        if (presetCategory && customCategory) {
          const resp1 = await createPact(
            {
              user_id: registeredUser.id,
              preset_category: presetCategory,
              custom_category: null,
              status: "active",
            },
            authToken
          );

          const resp2 = await createPact(
            {
              user_id: registeredUser.id,
              preset_category: null,
              custom_category: customCategory,
              status: "active",
            },
            authToken
          );

          const pact1 = resp1?.data || resp1;
          const pact2 = resp2?.data || resp2;

          if (!pact1?.id || !pact2?.id) {
            throw new Error("One or more pacts were not created correctly.");
          }

          created = pact2;
        } else {
          const pactResponse = await createPact(
            {
              user_id: registeredUser.id,
              preset_category: presetCategory,
              custom_category: customCategory,
              status: "active",
            },
            authToken
          );

          created = pactResponse?.data || pactResponse;
        }

        console.log("PACT CREATE RESPONSE:", created);

        if (!created?.id) {
          throw new Error("Pact was created but no pact id was returned.");
        }

        setCreatedPact(created);
        goNext();
      } catch (err) {
        console.error("PACT CREATE ERROR:", err);
        setError(
          err?.detail ||
            err?.message ||
            JSON.stringify(err) ||
            "Failed to save pact."
        );
      } finally {
        setLoading(false);
      }

      return;
    }

    if (currentStep === 3) {
      if (!createdPact?.id) {
        setError("Pact was not created correctly. Please go back and try again.");
        return;
      }

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
        const accountabilityResponse = await saveAccountabilitySettings({
          pact_id: createdPact.id,
          accountability_type: accountabilityType,
          discipline_savings_percentage:
            accountabilityType === "email" ? 0 : percentValue,
          accountability_note: accountabilityNote.trim() || null,
        });

        console.log(
          "ACCOUNTABILITY SETTINGS RESPONSE:",
          accountabilityResponse
        );

        goNext();
      } catch (err) {
        console.error("ACCOUNTABILITY ERROR:", err);
        setError(
          err?.detail ||
            err?.message ||
            JSON.stringify(err) ||
            "Failed to save accountability settings."
        );
      } finally {
        setLoading(false);
      }

      return;
    }

    if (currentStep === 4) {
      console.log("Prototype complete:", {
        registeredUser,
        createdPact,
        name,
        email,
        phone,
        selectedPactId,
        customPactTitle,
        accountabilityType,
        disciplineSavingsPercent,
        accountabilityNote,
      });

      navigate("/dashboard", { replace: true });
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
                      onBlur={() => touch("name")}
                      placeholder="Enter your name"
                      required
                    />
                  </div>
                  <InlineError field="name" />

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
                      onBlur={() => touch("email")}
                      placeholder="Enter your email"
                      required
                    />
                  </div>
                  <InlineError field="email" />

                  <PasswordFields
                    password={password}
                    confirm={confirm}
                    onPasswordChange={setPassword}
                    onConfirmChange={setConfirm}
                    confirmTouched={touched.confirm}
                    onConfirmBlur={() => touch("confirm")}
                  />

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
                      onBlur={() => touch("phone")}
                      placeholder="Enter your phone number"
                      required
                    />
                  </div>
                  <InlineError field="phone" />

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
                  <h2 className="register-card-title">Choose your pact</h2>
                  <p className="register-card-sub">
                    Pick a preset spending category or create your own.
                  </p>

                  <label className="register-field-label">Preset categories</label>
                  <div className="register-input-row">
                    <select
                      className="register-input"
                      value={selectedPactId}
                      onChange={handlePactSelect}
                    >
                      <option value="">Select a spending category</option>
                      {PACT_OPTIONS.map((pact) => (
                        <option key={pact.id} value={pact.id}>
                          {pact.title}
                        </option>
                      ))}
                    </select>
                  </div>

                  <label className="register-field-label">
                    Or create your own category
                  </label>
                  <div className="register-input-row">
                    <input
                      className="register-input"
                      value={customPactTitle}
                      onChange={handleCustomPactChange}
                      placeholder="Example: Beauty, Gas, Target, Subscriptions"
                    />
                  </div>

                  <p className="register-card-sub" style={{ marginTop: "10px" }}>
                    Use a broad spending category so AI can match transactions
                    more accurately.
                  </p>

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

                  {plaidConnected ? (
                    <div
                      className="bank-prototype-box"
                      style={{ textAlign: "center", padding: "24px 16px" }}
                    >
                      <div style={{ fontSize: "32px", marginBottom: "8px" }}>
                        &#10003;
                      </div>
                      <p style={{ fontWeight: 600, marginBottom: "4px" }}>
                        {connectedInstitution} connected
                      </p>
                      <p style={{ opacity: 0.6, fontSize: "14px" }}>
                        Your transactions will sync automatically.
                      </p>
                    </div>
                  ) : (
                    <div
                      className="bank-prototype-box"
                      style={{ textAlign: "center", padding: "24px 16px" }}
                    >
                      <p style={{ marginBottom: "16px", opacity: 0.7 }}>
                        Connect your bank account to automatically track your spending.
                      </p>
                      {embeddedBrowser ? (
                        <p
                          className="register-card-sub"
                          style={{ marginBottom: "16px" }}
                        >
                          {PLAID_BROWSER_TAB_ERROR}
                        </p>
                      ) : null}
                      <button
                        type="button"
                        className="sign-in-btn register-btn-continue"
                        onClick={handleOpenPlaid}
                        disabled={
                          loading ||
                          plaidTokenLoading ||
                          embeddedBrowser ||
                          (!linkToken && !error) ||
                          (Boolean(linkToken) && !plaidReady)
                        }
                        style={{ width: "100%" }}
                      >
                        {loading
                          ? "Connecting…"
                          : plaidTokenLoading || (!linkToken && !error)
                            ? "Preparing secure connect…"
                            : linkToken && !plaidReady
                              ? "Loading Plaid…"
                              : error && !linkToken
                                ? "Retry secure connect"
                                : "Connect with Plaid"}
                      </button>
                    </div>
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
