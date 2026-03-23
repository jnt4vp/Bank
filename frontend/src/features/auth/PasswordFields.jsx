import { useState } from "react";
import { Lock, Eye, EyeOff } from "lucide-react";
import { getPasswordChecks } from "./passwordValidation";

export default function PasswordFields({ password, confirm, onPasswordChange, onConfirmChange, confirmTouched, onConfirmBlur }) {
  const [showPass, setShowPass] = useState(false);
  const [showConf, setShowConf] = useState(false);

  const confirmError =
    confirmTouched && (confirm && password !== confirm
      ? "Passwords do not match"
      : !confirm
      ? "Please confirm your password"
      : null);

  return (
    <>
      <label className="register-field-label">Password</label>
      <div className="register-input-row">
        <span className="register-input-icon">
          <Lock size={16} strokeWidth={1.5} />
        </span>
        <input
          className="register-input has-right"
          type={showPass ? "text" : "password"}
          value={password}
          onChange={(e) => onPasswordChange(e.target.value)}
          placeholder="Create a strong password"
          required
        />
        <span className="register-input-eye">
          <button
            type="button"
            className="register-eye-btn"
            onClick={() => setShowPass((p) => !p)}
            aria-label="Toggle password visibility"
          >
            {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </span>
      </div>

      {password && (
        <ul style={{ margin: "4px 0 12px", padding: 0, listStyle: "none", fontSize: "12px" }}>
          {getPasswordChecks(password).map((check) => (
            <li key={check.label} style={{ color: check.pass ? "#4caf50" : "rgba(60,45,20,0.5)", marginBottom: "2px" }}>
              {check.pass ? "✓" : "○"} {check.label}
            </li>
          ))}
        </ul>
      )}

      <label className="register-field-label">Confirm Password</label>
      <div className="register-input-row">
        <span className="register-input-icon">
          <Lock size={16} strokeWidth={1.5} />
        </span>
        <input
          className="register-input has-right"
          type={showConf ? "text" : "password"}
          value={confirm}
          onChange={(e) => onConfirmChange(e.target.value)}
          onBlur={onConfirmBlur}
          placeholder="Confirm your password"
          required
        />
        <span className="register-input-eye">
          <button
            type="button"
            className="register-eye-btn"
            onClick={() => setShowConf((p) => !p)}
            aria-label="Toggle confirm password visibility"
          >
            {showConf ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </span>
      </div>

      {confirmError && (
        <p style={{ color: "#c0392b", fontSize: "12px", margin: "-8px 0 8px 2px" }}>{confirmError}</p>
      )}
    </>
  );
}
