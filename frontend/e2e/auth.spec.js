import { test, expect } from "@playwright/test";

const TEST_USER = {
  email: "test@example.com",
  password: "password123",
};

test.describe("Landing page", () => {
  test("shows login form and branding", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("BankSpank")).toBeVisible();
    await expect(page.getByPlaceholder(/email/i)).toBeVisible();
    await expect(page.getByPlaceholder(/password/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
  });

  test("has links to register and forgot password", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: /register/i }).or(page.getByText(/don.*t have an account/i))).toBeVisible();
    await expect(page.getByRole("link", { name: /forgot/i }).or(page.getByText(/forgot password/i))).toBeVisible();
  });
});

test.describe("Login", () => {
  test("logs in with valid credentials and reaches dashboard", async ({ page }) => {
    await page.goto("/");
    await page.getByPlaceholder(/email/i).fill(TEST_USER.email);
    await page.getByPlaceholder(/password/i).fill(TEST_USER.password);
    await page.getByRole("button", { name: /sign in/i }).click();

    await expect(page).toHaveURL(/dashboard/, { timeout: 10_000 });
    await expect(page.getByText(TEST_USER.email).or(page.getByText(/sign out/i))).toBeVisible();
  });

  test("shows error for invalid credentials", async ({ page }) => {
    await page.goto("/");
    await page.getByPlaceholder(/email/i).fill("wrong@example.com");
    await page.getByPlaceholder(/password/i).fill("wrongpassword");
    await page.getByRole("button", { name: /sign in/i }).click();

    await expect(page.getByText(/invalid|incorrect|error|not found/i)).toBeVisible({ timeout: 5_000 });
    await expect(page).not.toHaveURL(/dashboard/);
  });

  test("shows error for wrong password", async ({ page }) => {
    await page.goto("/");
    await page.getByPlaceholder(/email/i).fill(TEST_USER.email);
    await page.getByPlaceholder(/password/i).fill("wrongpassword");
    await page.getByRole("button", { name: /sign in/i }).click();

    await expect(page.getByText(/invalid|incorrect|error/i)).toBeVisible({ timeout: 5_000 });
  });
});

test.describe("Registration", () => {
  test("navigates to register page", async ({ page }) => {
    await page.goto("/");
    await page.getByText(/don.*t have an account/i).or(page.getByRole("link", { name: /register/i })).click();

    await expect(page).toHaveURL(/register/);
    await expect(page.getByPlaceholder(/name/i).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /sign up/i })).toBeVisible();
  });

  test("shows validation error for short password", async ({ page }) => {
    await page.goto("/register");
    await page.getByPlaceholder(/name/i).first().fill("Test User");
    await page.getByPlaceholder(/email/i).fill("newuser@test.com");
    await page.getByPlaceholder(/password/i).fill("short");
    await page.getByRole("button", { name: /sign up/i }).click();

    await expect(page.getByText(/8 characters|too short|password/i)).toBeVisible({ timeout: 5_000 });
  });

  test("registers a new user successfully", async ({ page }) => {
    const unique = Date.now();
    await page.goto("/register");
    await page.getByPlaceholder(/name/i).first().fill(`E2E User ${unique}`);
    await page.getByPlaceholder(/email/i).fill(`e2e-${unique}@test.com`);
    await page.getByPlaceholder(/password/i).fill("testpassword123");
    await page.getByRole("button", { name: /sign up/i }).click();

    // After registration, should redirect to landing or auto-login
    await expect(page.getByText(/sign in|dashboard/i)).toBeVisible({ timeout: 10_000 });
  });

  test("shows error for duplicate email", async ({ page }) => {
    await page.goto("/register");
    await page.getByPlaceholder(/name/i).first().fill("Duplicate User");
    await page.getByPlaceholder(/email/i).fill(TEST_USER.email);
    await page.getByPlaceholder(/password/i).fill("testpassword123");
    await page.getByRole("button", { name: /sign up/i }).click();

    await expect(page.getByText(/already|exists|duplicate|registered/i)).toBeVisible({ timeout: 5_000 });
  });
});

test.describe("Forgot password", () => {
  test("navigates to forgot password page", async ({ page }) => {
    await page.goto("/");
    await page.getByText(/forgot password/i).click();

    await expect(page).toHaveURL(/forgot-password/);
    await expect(page.getByPlaceholder(/email/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /send|reset/i })).toBeVisible();
  });

  test("shows confirmation after submitting email", async ({ page }) => {
    await page.goto("/forgot-password");
    await page.getByPlaceholder(/email/i).fill(TEST_USER.email);
    await page.getByRole("button", { name: /send|reset/i }).click();

    await expect(page.getByText(/check your email|reset link|sent/i)).toBeVisible({ timeout: 5_000 });
  });
});

test.describe("Protected routes", () => {
  test("redirects unauthenticated users from dashboard to landing", async ({ page }) => {
    // Clear any stored tokens
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());

    await page.goto("/dashboard");
    await expect(page).not.toHaveURL(/dashboard/, { timeout: 5_000 });
    await expect(page.getByPlaceholder(/email/i)).toBeVisible();
  });
});
