import { test, expect } from "@playwright/test";
import { login } from "./helpers/auth.js";

test.describe("Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("displays welcome message after login", async ({ page }) => {
    await expect(page.getByText(/welcome back/i)).toBeVisible();
  });

  test("shows financial overview cards", async ({ page }) => {
    await expect(page.getByText(/balance/i)).toBeVisible();
    await expect(page.getByText(/savings/i)).toBeVisible();
    await expect(page.getByText(/discipline score/i)).toBeVisible();
  });

  test("discipline score shows a value between 0 and 100 or a dash", async ({ page }) => {
    const scoreCard = page.getByText(/discipline score/i).locator("..");
    await expect(scoreCard).toBeVisible();
    // The score area should contain a number or a dash placeholder
    await expect(scoreCard.getByText(/\d{1,3}%|—|--/)).toBeVisible({ timeout: 5_000 });
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
    const signOutBtn = page.getByRole("button", { name: /sign out|log ?out/i });
    await expect(signOutBtn).toBeVisible();
    await signOutBtn.click();

    await expect(page).not.toHaveURL(/dashboard/, { timeout: 5_000 });
    await expect(page.getByPlaceholder(/email/i)).toBeVisible();
  });

  test("session persists across page reload", async ({ page }) => {
    await page.reload();

    await expect(page).toHaveURL(/dashboard/, { timeout: 10_000 });
    await expect(page.getByRole("button", { name: /sign out/i })).toBeVisible();
  });

  test("after logout, dashboard redirects to landing", async ({ page }) => {
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
    await expect(page.getByRole("link", { name: /dashboard/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /transactions/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /pacts/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /goals/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /analytics/i })).toBeVisible();
  });

  test("navigates to settings page", async ({ page }) => {
    // Settings is in the profile dropdown
    await page.getByRole("link", { name: /settings/i }).click();
    await expect(page).toHaveURL(/settings/);
  });

  test("navigates to transactions page", async ({ page }) => {
    await page.getByRole("link", { name: /transactions/i }).click();
    await expect(page).toHaveURL(/transactions/);
  });

  test("navigates to pacts page", async ({ page }) => {
    await page.getByRole("link", { name: /pacts/i }).click();
    await expect(page).toHaveURL(/pacts/);
  });

  test("navigates to goals page", async ({ page }) => {
    await page.getByRole("link", { name: /goals/i }).click();
    await expect(page).toHaveURL(/goals/);
  });

  test("navigates to analytics page", async ({ page }) => {
    await page.getByRole("link", { name: /analytics/i }).click();
    await expect(page).toHaveURL(/analytics/);
  });
});
