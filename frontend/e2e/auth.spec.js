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

  test("has links to signup and forgot password", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(/don.*t have an account/i)).toBeVisible();
    await expect(page.getByText(/forgot password/i)).toBeVisible();
  });
});

test.describe("Login", () => {
  test("logs in with valid credentials and reaches dashboard", async ({ page }) => {
    await page.goto("/");
    await page.getByPlaceholder(/email/i).fill(TEST_USER.email);
    await page.getByPlaceholder(/password/i).fill(TEST_USER.password);
    await page.getByRole("button", { name: /sign in/i }).click();

    await expect(page).toHaveURL(/dashboard/, { timeout: 10_000 });
    await expect(page.getByText(/sign out/i)).toBeVisible();
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

test.describe("Signup", () => {
  test("navigates to signup page", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: /sign up/i }).click();

    await expect(page).toHaveURL(/signup/);
    await expect(page.getByText(/create an account/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /sign up/i })).toBeVisible();
  });

  test("shows validation error for short password", async ({ page }) => {
    await page.goto("/signup");
    await page.getByLabel(/^name$/i).fill("Test User");
    await page.getByLabel(/email/i).fill("newuser@test.com");
    await page.getByLabel(/password/i).fill("short");
    await page.getByRole("button", { name: /sign up/i }).click();

    await expect(page.getByText(/password must be at least 8 characters/i)).toBeVisible({ timeout: 5_000 });
  });

  test("registers a new user successfully", async ({ page }) => {
    const unique = Date.now();
    await page.goto("/signup");
    await page.getByLabel(/^name$/i).fill(`E2E User ${unique}`);
    await page.getByLabel(/email/i).fill(`e2e-${unique}@test.com`);
    await page.getByLabel(/password/i).fill("testpassword123");
    await page.getByRole("button", { name: /sign up/i }).click();

    // After registration, should redirect to landing
    await expect(page.getByText(/sign in/i)).toBeVisible({ timeout: 10_000 });
  });

  test("shows error for duplicate email", async ({ page }) => {
    await page.goto("/signup");
    await page.getByLabel(/^name$/i).fill("Duplicate User");
    await page.getByLabel(/email/i).fill(TEST_USER.email);
    await page.getByLabel(/password/i).fill("testpassword123");
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
    await page.getByLabel(/email/i).fill(TEST_USER.email);
    await page.getByRole("button", { name: /send|reset/i }).click();

    await expect(page.getByText(/check your email|reset link|sent/i)).toBeVisible({ timeout: 5_000 });
  });
});

test.describe("Protected routes", () => {
  test("redirects unauthenticated users from dashboard to landing", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());

    await page.goto("/dashboard");
    await expect(page).not.toHaveURL(/dashboard/, { timeout: 5_000 });
    await expect(page.getByPlaceholder(/email/i)).toBeVisible();
  });
});
