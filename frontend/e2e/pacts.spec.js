import { test, expect } from "@playwright/test";
import { login, loginViaAPI } from "./helpers/auth.js";
import { createPact, deletePact, getUserPacts } from "./helpers/api.js";
import { PRESET_CATEGORIES } from "./helpers/fixtures.js";

test.describe("Pacts page", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.getByRole("link", { name: /pacts/i }).click();
    await expect(page).toHaveURL(/pacts/);
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
    await expect(page.getByText(/create your first pact|your pacts/i)).toBeVisible({ timeout: 5_000 });
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
    await page.getByRole("link", { name: /pacts/i }).click();
    await expect(page).toHaveURL(/pacts/);
  });

  test("creates a pact with a preset category", async ({ page }) => {
    // Step 1: Select a preset category
    const categorySelect = page.locator("select").filter({ hasText: /select a category/i });
    await categorySelect.selectOption({ label: "Coffee Shops" });

    // Step 2: Configure consequences
    const alertMethodSelect = page.locator("select").filter({ hasText: /email alert|no alert/i });
    if (await alertMethodSelect.isVisible()) {
      await alertMethodSelect.selectOption({ label: "Email alert" });
    }

    // Submit
    await page.getByRole("button", { name: /create pact/i }).click();

    // Verify the new pact appears
    await expect(page.getByText(/coffee shops/i)).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/active/i).first()).toBeVisible();
  });

  test("creates a pact with a custom category", async ({ page }) => {
    // Fill in custom merchant/keyword
    const customInput = page.getByPlaceholder(/uber|sephora|target/i);
    await customInput.fill("Sephora");

    // Submit
    await page.getByRole("button", { name: /create pact/i }).click();

    // Verify
    await expect(page.getByText(/sephora/i)).toBeVisible({ timeout: 5_000 });
  });

  test("preset category dropdown shows all expected options", async ({ page }) => {
    const categorySelect = page.locator("select").filter({ hasText: /select a category/i });
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
    await page.getByRole("link", { name: /pacts/i }).click();
    await expect(page).toHaveURL(/pacts/);
  });

  test("displays the created pact with correct info", async ({ page }) => {
    await expect(page.getByText(/fast food/i)).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/preset/i).first()).toBeVisible();
    await expect(page.getByText(/active/i).first()).toBeVisible();
  });

  test("can pause and resume a pact", async ({ page }) => {
    // Click Pause
    const pauseBtn = page.getByRole("button", { name: /pause/i });
    await expect(pauseBtn).toBeVisible({ timeout: 5_000 });
    await pauseBtn.click();

    // Should now show "Paused" status and "Resume" button
    await expect(page.getByText(/paused/i)).toBeVisible({ timeout: 5_000 });
    const resumeBtn = page.getByRole("button", { name: /resume/i });
    await expect(resumeBtn).toBeVisible();

    // Resume it
    await resumeBtn.click();
    await expect(page.getByText(/active/i).first()).toBeVisible({ timeout: 5_000 });
  });

  test("can delete a pact", async ({ page }) => {
    const deleteBtn = page.getByRole("button", { name: /delete/i });
    await expect(deleteBtn).toBeVisible({ timeout: 5_000 });
    await deleteBtn.click();

    // After deletion, pact should disappear
    await expect(page.getByText(/fast food/i)).not.toBeVisible({ timeout: 5_000 });
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
    await expect(page.getByText(/alcohol/i)).toBeVisible({ timeout: 5_000 });

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
    await expect(page.getByText(/locked/i)).toBeVisible();
  });

  test.afterEach(async ({ request }) => {
    // Cleanup any remaining pacts
    const pacts = await getUserPacts(request, token);
    for (const p of pacts) {
      await deletePact(request, token, p.id);
    }
  });
});
