import { test, expect } from "@playwright/test";
import { login } from "./helpers/auth.js";

async function openProfileMenu(page) {
  const trigger = page.locator(".dashboard-profile-trigger");
  await expect(trigger).toBeVisible();
  await trigger.click();
}

test.describe("Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("displays welcome message after login", async ({ page }) => {
    await expect(page.getByText(/welcome back/i)).toBeVisible();
  });

  test("shows financial overview cards", async ({ page }) => {
    await expect(page.getByText(/linked banks|connect your bank/i).first()).toBeVisible();
    await expect(page.getByText(/pact savings/i)).toBeVisible();
    await expect(page.getByText(/^Discipline Score$/)).toBeVisible();
  });

  test("discipline score shows a value between 0 and 100 or a dash", async ({ page }) => {
    const scoreCard = page.locator(".dashboard-score-card");
    await expect(scoreCard).toBeVisible();
    await expect(scoreCard.getByText(/discipline score/i)).toBeVisible();
    await expect(scoreCard.locator(".dashboard-score-meter-value")).toHaveText(/\d{1,3}%|—|--/, {
      timeout: 5_000,
    });
  });

  test("shows recent activity section", async ({ page }) => {
    await expect(page.getByText(/recent activity/i)).toBeVisible();
  });

  test("monthly spending chart is rendered", async ({ page }) => {
    // The chart is an SVG or a container with aria-label
    const chart = page.locator('[aria-label*="Monthly spending chart"]');
    await expect(chart).toBeVisible({ timeout: 5_000 });
  });

  test("logout returns to landing page", async ({ page }) => {
    await openProfileMenu(page);
    const signOutBtn = page.getByRole("button", { name: /sign out|log ?out/i });
    await expect(signOutBtn).toBeVisible();
    await signOutBtn.click();

    await expect(page).not.toHaveURL(/dashboard/, { timeout: 5_000 });
    await expect(page.getByPlaceholder(/email/i)).toBeVisible();
  });

  test("session persists across page reload", async ({ page }) => {
    await page.reload();

    await expect(page).toHaveURL(/dashboard/, { timeout: 10_000 });
    await expect(page.locator(".dashboard-profile-trigger")).toBeVisible();
  });

  test("after logout, dashboard redirects to landing", async ({ page }) => {
    await openProfileMenu(page);
    await page.getByRole("button", { name: /sign out|log ?out/i }).click();
    await expect(page).not.toHaveURL(/dashboard/);

    await page.goto("/dashboard");
    await expect(page).not.toHaveURL(/dashboard/, { timeout: 5_000 });
  });
});

test.describe("Navbar", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("shows navigation links", async ({ page }) => {
    const nav = page.locator("nav.dashboard-nav");
    await expect(nav.getByRole("link", { name: /^Dashboard$/i })).toBeVisible();
    await expect(nav.getByRole("link", { name: /^Transactions$/i })).toBeVisible();
    await expect(nav.getByRole("link", { name: /^Pacts$/i })).toBeVisible();
    await expect(nav.getByRole("link", { name: /^Goals$/i })).toBeVisible();
    await expect(nav.getByRole("link", { name: /^Analytics$/i })).toBeVisible();
  });

  test("navigates to settings page", async ({ page }) => {
    await openProfileMenu(page);
    await page.getByRole("link", { name: /settings/i }).click();
    await expect(page).toHaveURL(/settings/);
  });

  test("navigates to transactions page", async ({ page }) => {
    await page.locator("nav.dashboard-nav").getByRole("link", { name: /^Transactions$/i }).click();
    await expect(page).toHaveURL(/transactions/);
  });

  test("navigates to pacts page", async ({ page }) => {
    await page.locator("nav.dashboard-nav").getByRole("link", { name: /^Pacts$/i }).click();
    await expect(page).toHaveURL(/pacts/);
  });

  test("navigates to goals page", async ({ page }) => {
    await page.locator("nav.dashboard-nav").getByRole("link", { name: /^Goals$/i }).click();
    await expect(page).toHaveURL(/goals/);
  });

  test("navigates to analytics page", async ({ page }) => {
    await page.locator("nav.dashboard-nav").getByRole("link", { name: /^Analytics$/i }).click();
    await expect(page).toHaveURL(/analytics/);
  });
});
