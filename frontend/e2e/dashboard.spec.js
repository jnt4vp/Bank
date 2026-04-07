import { test, expect } from "@playwright/test";

const TEST_USER = {
  email: "test@example.com",
  password: "Password123!",
};

/**
 * Helper: log in and navigate to dashboard.
 */
async function loginAndGoToDashboard(page) {
  await page.goto("/");
  await page.getByPlaceholder(/email/i).fill(TEST_USER.email);
  await page.getByPlaceholder(/password/i).fill(TEST_USER.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/dashboard/, { timeout: 10_000 });
}

test.describe("Dashboard", () => {
  test("displays welcome message and user info after login", async ({ page }) => {
    await loginAndGoToDashboard(page);
    await expect(page.getByText(/welcome back/i)).toBeVisible();
  });

  test("shows financial overview cards", async ({ page }) => {
    await loginAndGoToDashboard(page);
    await expect(page.getByText(/balance/i)).toBeVisible();
    await expect(page.getByText(/savings/i)).toBeVisible();
    await expect(page.getByText(/discipline score/i)).toBeVisible();
  });

  test("shows recent activity section", async ({ page }) => {
    await loginAndGoToDashboard(page);
    await expect(page.getByText(/recent activity/i)).toBeVisible();
  });

  test("logout returns to landing page", async ({ page }) => {
    await loginAndGoToDashboard(page);

    const signOutBtn = page.getByRole("button", { name: /sign out|log ?out/i });
    await expect(signOutBtn).toBeVisible();
    await signOutBtn.click();

    await expect(page).not.toHaveURL(/dashboard/, { timeout: 5_000 });
    await expect(page.getByPlaceholder(/email/i)).toBeVisible();
  });

  test("session persists across page reload", async ({ page }) => {
    await loginAndGoToDashboard(page);
    await page.reload();

    await expect(page).toHaveURL(/dashboard/, { timeout: 10_000 });
    await expect(
      page.getByRole("button", { name: /sign out/i })
    ).toBeVisible();
  });

  test("after logout, dashboard redirects to landing", async ({ page }) => {
    await loginAndGoToDashboard(page);

    await page.getByRole("button", { name: /sign out|log ?out/i }).click();
    await expect(page).not.toHaveURL(/dashboard/);

    await page.goto("/dashboard");
    await expect(page).not.toHaveURL(/dashboard/, { timeout: 5_000 });
  });
});

test.describe("Navbar", () => {
  test("shows navigation links", async ({ page }) => {
    await loginAndGoToDashboard(page);
    await expect(page.getByRole("link", { name: /dashboard/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /settings/i })).toBeVisible();
  });

  test("navigates to settings page", async ({ page }) => {
    await loginAndGoToDashboard(page);
    await page.getByRole("link", { name: /settings/i }).click();
    await expect(page).toHaveURL(/settings/);
    await expect(page.getByText(/settings/i).first()).toBeVisible();
  });

  test("navigates back to dashboard from settings", async ({ page }) => {
    await loginAndGoToDashboard(page);
    await page.getByRole("link", { name: /settings/i }).click();
    await expect(page).toHaveURL(/settings/);
    await page.getByRole("link", { name: /dashboard/i }).click();
    await expect(page).toHaveURL(/dashboard/);
  });
});

test.describe("Settings", () => {
  test("shows profile information", async ({ page }) => {
    await loginAndGoToDashboard(page);
    await page.getByRole("link", { name: /settings/i }).click();
    await expect(page).toHaveURL(/settings/);

    await expect(page.getByText(/profile/i)).toBeVisible();
    await expect(page.getByText(/email/i)).toBeVisible();
  });

  test("shows placeholder sections", async ({ page }) => {
    await loginAndGoToDashboard(page);
    await page.getByRole("link", { name: /settings/i }).click();

    await expect(page.getByText(/preferences/i)).toBeVisible();
    await expect(page.getByText(/security/i)).toBeVisible();
  });
});

test.describe("Pacts accountability UI", () => {
  test("shows accountability partner helper text and empty state", async ({ page }) => {
    await loginAndGoToDashboard(page);
    await page.getByRole("link", { name: /pacts/i }).click();
    await expect(page).toHaveURL(/pacts/);

    await expect(
      page.getByText(/partner emails are sent only when a flagged purchase/i)
    ).toBeVisible();

    await expect(
      page.getByText(/no accountability partner yet|no accountability partner set/i).first()
    ).toBeVisible();
  });
});
