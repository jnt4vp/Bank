import { test, expect } from "@playwright/test";
import { login, loginViaAPI } from "./helpers/auth.js";
import { createPact, deletePact, getUserPacts } from "./helpers/api.js";
import { PRESET_CATEGORIES } from "./helpers/fixtures.js";

async function goToPacts(page) {
  await page.getByRole("link", { name: /^Pacts$/i }).click();
  await expect(page).toHaveURL(/pacts/);

  const skipIntro = page.getByRole("button", { name: /skip intro/i });
  if (await skipIntro.count()) {
    await skipIntro.click();
  }
}

test.describe("Pacts page", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await goToPacts(page);
    await page.getByRole("tab", { name: /manage pacts/i }).click();
  });

  test("shows pacts page with stats row", async ({ page }) => {
    await expect(page.getByText(/total pacts/i)).toBeVisible();
    await expect(page.getByText(/preset pacts/i)).toBeVisible();
    await expect(page.getByText(/custom pacts/i)).toBeVisible();
  });

  test("shows empty state when no pacts exist", async ({ page, request }) => {
    // Clean up any existing pacts first
    const token = await loginViaAPI(request);
    const pacts = await getUserPacts(request, token);
    for (const p of pacts) {
      await deletePact(request, token, p.id);
    }

    await page.reload();
    await page.getByRole("tab", { name: /manage pacts/i }).click();
    await expect(page.getByRole("heading", { name: /create your first pact/i })).toBeVisible({
      timeout: 5_000,
    });
  });
});

test.describe("Pact creation via UI", () => {
  let token;

  test.beforeEach(async ({ page, request }) => {
    token = await loginViaAPI(request);

    // Clean slate: remove all existing pacts
    const pacts = await getUserPacts(request, token);
    for (const p of pacts) {
      await deletePact(request, token, p.id);
    }

    await login(page);
    await goToPacts(page);
    await page.getByRole("tab", { name: /create pact/i }).click();
  });

  test("creates a pact with a preset category", async ({ page }) => {
    await page.getByLabel(/preset category/i).selectOption("Coffee Shops");

    await page.getByRole("button", { name: /create pact/i }).click();

    await expect(page.getByRole("heading", { name: "Coffee Shops" })).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("Active", { exact: true }).first()).toBeVisible();
  });

  test("creates a pact with a custom category", async ({ page }) => {
    await page.getByLabel(/merchant or keyword/i).fill("Sephora");

    await page.getByRole("button", { name: /create pact/i }).click();

    await expect(page.getByText(/sephora/i)).toBeVisible({ timeout: 5_000 });
  });

  test("preset category dropdown shows all expected options", async ({ page }) => {
    const categorySelect = page.getByLabel(/preset category/i);
    await categorySelect.click();

    for (const category of PRESET_CATEGORIES) {
      await expect(categorySelect.locator("option", { hasText: category })).toBeAttached();
    }
  });
});

test.describe("Pact management", () => {
  let token;
  let pactId;

  test.beforeEach(async ({ page, request }) => {
    token = await loginViaAPI(request);

    // Clean slate and create a known pact
    const existing = await getUserPacts(request, token);
    for (const p of existing) {
      await deletePact(request, token, p.id);
    }
    const pact = await createPact(request, token, { preset_category: "Fast Food" });
    pactId = pact.id;

    await login(page);
    await goToPacts(page);
    await page.getByRole("tab", { name: /manage pacts/i }).click();
  });

  test("displays the created pact with correct info", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Fast Food" })).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("Preset", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Active", { exact: true }).first()).toBeVisible();
  });

  test("can pause and resume a pact", async ({ page }) => {
    // Click Pause
    const pauseBtn = page.getByRole("button", { name: /pause/i });
    await expect(pauseBtn).toBeVisible({ timeout: 5_000 });
    await pauseBtn.click();

    // Should now show "Paused" status and "Resume" button
    await expect(page.getByText("Paused", { exact: true })).toBeVisible({ timeout: 5_000 });
    const resumeBtn = page.getByRole("button", { name: /resume/i });
    await expect(resumeBtn).toBeVisible();

    // Resume it
    await resumeBtn.click();
    await expect(page.getByText("Active", { exact: true }).first()).toBeVisible({ timeout: 5_000 });
  });

  test("can delete a pact", async ({ page }) => {
    const deleteBtn = page.getByRole("button", { name: /delete/i });
    await expect(deleteBtn).toBeVisible({ timeout: 5_000 });
    await deleteBtn.click();

    // After deletion, pact should disappear
    await expect(page.getByRole("heading", { name: "Fast Food" })).not.toBeVisible({ timeout: 5_000 });
  });

  test("locked pact disables edit and delete buttons", async ({ page, request }) => {
    // Delete the unlocked pact and create a locked one
    await deletePact(request, token, pactId);
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    await createPact(request, token, {
      preset_category: "Alcohol",
      locked_until: futureDate,
    });

    await page.reload();
    await expect(page.getByRole("heading", { name: "Alcohol" })).toBeVisible({ timeout: 5_000 });

    // Edit and Delete should be disabled
    const editBtn = page.getByRole("button", { name: /edit/i });
    const deleteBtn = page.getByRole("button", { name: /delete/i });
    if (await editBtn.isVisible()) {
      await expect(editBtn).toBeDisabled();
    }
    if (await deleteBtn.isVisible()) {
      await expect(deleteBtn).toBeDisabled();
    }

    // Should show locked indicator
    await expect(page.getByText(/locked for/i)).toBeVisible();
  });

  test.afterEach(async ({ request }) => {
    // Cleanup any remaining pacts
    const pacts = await getUserPacts(request, token);
    for (const p of pacts) {
      await deletePact(request, token, p.id);
    }
  });
});
