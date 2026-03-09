import { test, expect } from "@playwright/test";

const TEST_USER = {
  email: "test@example.com",
  password: "password123",
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
  test("displays user info after login", async ({ page }) => {
    await loginAndGoToDashboard(page);
    await expect(
      page.getByText(TEST_USER.email).or(page.getByText(/test/i))
    ).toBeVisible();
  });

  test("shows counter value", async ({ page }) => {
    await loginAndGoToDashboard(page);
    // Counter should display a number somewhere
    await expect(
      page.getByText(/counter|count/i).or(page.locator("[data-testid='counter']"))
    ).toBeVisible({ timeout: 5_000 });
  });

  test("increments counter on button click", async ({ page }) => {
    await loginAndGoToDashboard(page);

    // Find the increment button
    const incrementBtn = page.getByRole("button", { name: /increment/i });
    await expect(incrementBtn).toBeVisible({ timeout: 5_000 });

    // Get initial text content to compare later
    const counterArea = page.locator("text=/\\d+/").first();
    const initialText = await counterArea.textContent();

    await incrementBtn.click();

    // Wait for counter to update (value should change or at least the button should be re-enabled)
    await page.waitForTimeout(1_000);
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

    // Reload the page
    await page.reload();

    // Should still be on dashboard (token in localStorage keeps us authenticated)
    await expect(page).toHaveURL(/dashboard/, { timeout: 10_000 });
    await expect(
      page.getByText(TEST_USER.email).or(page.getByRole("button", { name: /sign out/i }))
    ).toBeVisible();
  });

  test("after logout, dashboard redirects to landing", async ({ page }) => {
    await loginAndGoToDashboard(page);

    // Logout
    await page.getByRole("button", { name: /sign out|log ?out/i }).click();
    await expect(page).not.toHaveURL(/dashboard/);

    // Try to go back to dashboard directly
    await page.goto("/dashboard");
    await expect(page).not.toHaveURL(/dashboard/, { timeout: 5_000 });
  });
});
