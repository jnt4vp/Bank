const WEAK_PASSWORDS = new Set([
  "password", "password1", "password123", "password1234",
  "123456", "1234567", "12345678", "123456789", "1234567890",
  "qwerty", "qwerty123", "qwertyuiop",
  "letmein", "welcome", "welcome1", "iloveyou",
  "admin", "admin123", "admin1234",
  "monkey", "dragon", "master", "sunshine", "princess",
  "shadow", "superman", "michael", "football", "baseball",
  "abc123", "abcdef", "1q2w3e4r", "trustno1", "starwars",
  "hello123", "batman", "login", "access", "flower",
  "mustang", "whatever", "test1234", "pass1234", "pass123",
]);

const SPECIAL = /[!@#$%^&*()\-_=+\[\]{};:'",.<>/?\\|`~]/;

export function validatePassword(password, email = "") {
  if (!password) return "Password is required";
  if (password.length < 8) return "Password must be at least 8 characters";
  if (!/[A-Z]/.test(password)) return "Password must contain at least one uppercase letter";
  if (!/[a-z]/.test(password)) return "Password must contain at least one lowercase letter";
  if (!/\d/.test(password)) return "Password must contain at least one number";
  if (!SPECIAL.test(password)) return "Password must contain at least one special character";
  if (WEAK_PASSWORDS.has(password.toLowerCase())) return "This password is too common. Please choose a stronger one";
  if (email) {
    const passwordLower = password.toLowerCase();
    if (passwordLower === email.toLowerCase()) return "Password must not be the same as your email";
    const emailLocal = email.toLowerCase().split("@")[0];
    if (emailLocal.length >= 4 && passwordLower.includes(emailLocal)) return "Password must not contain your email address";
  }
  return null;
}

export function getPasswordChecks(password) {
  return [
    { label: "At least 8 characters", pass: password.length >= 8 },
    { label: "One uppercase letter", pass: /[A-Z]/.test(password) },
    { label: "One lowercase letter", pass: /[a-z]/.test(password) },
    { label: "One number", pass: /\d/.test(password) },
    { label: "One special character", pass: SPECIAL.test(password) },
  ];
}
