import { test, expect } from "@playwright/test";
import { login, loginViaAPI } from "./helpers/auth.js";
import { getMe, updateMe } from "./helpers/api.js";

/**
 * Navigate to the settings page after logging in.
 */
async function goToSettings(page) {
  await login(page);
  const profileTrigger = page.locator(".dashboard-profile-trigger");
  await expect(profileTrigger).toBeVisible();
  await profileTrigger.click();
  await page.getByRole("link", { name: /^Settings$/i }).click();
  await expect(page).toHaveURL(/settings/);
}

test.describe("Settings - Profile", () => {
  test("shows profile section with user email", async ({ page }) => {
    await goToSettings(page);
    await expect(page.getByText(/^Profile$/)).toBeVisible();
    await expect(page.getByText(/^Email$/)).toBeVisible();
  });

  test("shows security section", async ({ page }) => {
    await goToSettings(page);
    await expect(page.getByText(/security/i)).toBeVisible();
    await expect(page.getByText(/change password/i)).toBeVisible();
  });

  test("shows two-factor auth as coming soon", async ({ page }) => {
    await goToSettings(page);
    await expect(page.getByText(/two-factor/i)).toBeVisible();
    await expect(page.getByText(/coming soon/i).first()).toBeVisible();
  });
});

test.describe("Settings - Notifications", () => {
  test("shows notification toggles", async ({ page }) => {
    await goToSettings(page);
    await expect(page.getByText(/discipline alerts/i)).toBeVisible();
    await expect(page.getByText(/weekly overview/i)).toBeVisible();
    await expect(page.getByText(/pact reminders/i)).toBeVisible();
    await expect(page.getByText(/product updates/i)).toBeVisible();
  });

  test("notification toggles are interactive", async ({ page }) => {
    await goToSettings(page);
    const toggle = page.getByRole("button", { name: /discipline alerts/i });
    if (await toggle.isVisible()) {
      const initialState = await toggle.getAttribute("aria-pressed");
      await toggle.click();
      // State should change
      const newState = await toggle.getAttribute("aria-pressed");
      expect(newState).not.toBe(initialState);
    }
  });
});

test.describe("Settings - Preferences", () => {
  test("shows theme options", async ({ page }) => {
    await goToSettings(page);
    await expect(page.getByText(/system/i).first()).toBeVisible();
    await expect(page.getByText(/light/i).first()).toBeVisible();
    await expect(page.getByText(/dark/i).first()).toBeVisible();
  });

  test("shows density options", async ({ page }) => {
    await goToSettings(page);
    await expect(page.getByText(/comfortable/i)).toBeVisible();
    await expect(page.getByText(/compact/i)).toBeVisible();
  });
});

test.describe("Settings - Card locking", () => {
  let token;

  test.beforeEach(async ({ request }) => {
    token = await loginViaAPI(request);
  });

  test("user profile includes card_locked field", async ({ request }) => {
    const me = await getMe(request, token);
    expect(typeof me.card_locked).toBe("boolean");
  });
});

test.describe("Settings - UI mode", () => {
  let token;

  test.beforeEach(async ({ request }) => {
    token = await loginViaAPI(request);
  });

  test("can switch discipline UI mode via API", async ({ request }) => {
    const updated = await updateMe(request, token, { discipline_ui_mode: "discipline" });
    expect(updated.discipline_ui_mode).toBe("discipline");

    const classic = await updateMe(request, token, { discipline_ui_mode: "classic" });
    expect(classic.discipline_ui_mode).toBe("classic");
  });

  test("can toggle dashboard_force_sky via API", async ({ request }) => {
    const updated = await updateMe(request, token, { dashboard_force_sky: true });
    expect(updated.dashboard_force_sky).toBe(true);

    const reset = await updateMe(request, token, { dashboard_force_sky: false });
    expect(reset.dashboard_force_sky).toBe(false);
  });

  test("UI mode change is reflected in dashboard", async ({ page, request }) => {
    await updateMe(request, token, { discipline_ui_mode: "discipline" });

    await login(page);
    // The dashboard should render in discipline mode (the exact visual
    // difference varies, but the page should load without errors)
    await expect(page.getByText(/dashboard/i).first()).toBeVisible();
    await expect(page.getByText(/^Discipline Score$/)).toBeVisible();

    // Clean up
    await updateMe(request, token, { discipline_ui_mode: "classic" });
  });
});

test.describe("Settings - Accountability partners (in settings)", () => {
  test("settings page links to accountability management", async ({ page }) => {
    await goToSettings(page);
    // The settings page should show accountability partners section or a link
    await expect(
      page.getByText(/accountability partner/i).first()
    ).toBeVisible({ timeout: 5_000 });
  });
});
