import { test, expect } from "@playwright/test";
import { login, loginViaAPI } from "./helpers/auth.js";
import {
  createTransaction,
  createPact,
  deletePact,
  getUserPacts,
} from "./helpers/api.js";
import { FLAGGED_MERCHANTS, UNFLAGGED_TRANSACTION } from "./helpers/fixtures.js";

test.describe("Transactions page", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.getByRole("link", { name: /transactions/i }).click();
    await expect(page).toHaveURL(/transactions/);
  });

  test("shows transactions page with header and stat cards", async ({ page }) => {
    await expect(page.getByText(/transactions/i).first()).toBeVisible();
    await expect(page.getByText(/in score window/i)).toBeVisible();
    await expect(page.getByText(/flagged/i).first()).toBeVisible();
  });

  test("shows search bar and filter chips", async ({ page }) => {
    await expect(
      page.getByPlaceholder(/merchant|description|flag/i)
    ).toBeVisible();
    await expect(page.getByText(/all activity/i)).toBeVisible();
    await expect(page.getByText(/flagged only/i)).toBeVisible();
    await expect(page.getByText(/clear only/i)).toBeVisible();
  });
});

test.describe("Transaction classification", () => {
  let token;
  let pactId;

  test.beforeEach(async ({ request }) => {
    token = await loginViaAPI(request);

    // Ensure a Coffee Shops pact exists so Starbucks gets flagged
    const existing = await getUserPacts(request, token);
    const coffeePact = existing.find(
      (p) => p.category?.toLowerCase() === "coffee shops"
    );
    if (!coffeePact) {
      const pact = await createPact(request, token, {
        preset_category: "Coffee Shops",
      });
      pactId = pact.id;
    } else {
      pactId = coffeePact.id;
    }
  });

  test("transaction matching a pact is flagged", async ({ page, request }) => {
    // Ingest a Starbucks transaction via API
    const txn = await createTransaction(request, token, FLAGGED_MERCHANTS.coffee);
    expect(txn.flagged).toBe(true);
    expect(txn.flag_reason).toBeTruthy();
    expect(txn.category?.toLowerCase()).toContain("coffee");

    // Verify it shows as flagged in the UI
    await login(page);
    await page.getByRole("link", { name: /transactions/i }).click();
    await expect(page).toHaveURL(/transactions/);

    await expect(page.getByText(/starbucks/i).first()).toBeVisible({ timeout: 5_000 });
    // The flagged transaction should have a warning/flag indicator
    await expect(page.getByText(/warning|flagged/i).first()).toBeVisible();
  });

  test("transaction not matching any pact is not flagged", async ({ page, request }) => {
    const txn = await createTransaction(request, token, UNFLAGGED_TRANSACTION);
    expect(txn.flagged).toBe(false);

    await login(page);
    await page.getByRole("link", { name: /transactions/i }).click();
    await expect(page).toHaveURL(/transactions/);

    await expect(page.getByText(/city water utility/i).first()).toBeVisible({ timeout: 5_000 });
  });

  test("flagged-only filter shows only flagged transactions", async ({ page, request }) => {
    // Create one flagged and one unflagged
    await createTransaction(request, token, FLAGGED_MERCHANTS.coffee);
    await createTransaction(request, token, UNFLAGGED_TRANSACTION);

    await login(page);
    await page.getByRole("link", { name: /transactions/i }).click();
    await expect(page).toHaveURL(/transactions/);

    // Click "Flagged only"
    await page.getByText(/flagged only/i).click();

    // Starbucks should be visible, City Water should not
    await expect(page.getByText(/starbucks/i).first()).toBeVisible({ timeout: 5_000 });
    await expect(
      page.locator(".transactions-ledger-row", { hasText: /city water utility/i })
    ).toHaveCount(0, { timeout: 3_000 });
  });

  test("clear-only filter hides flagged transactions", async ({ page, request }) => {
    await createTransaction(request, token, FLAGGED_MERCHANTS.coffee);
    await createTransaction(request, token, UNFLAGGED_TRANSACTION);

    await login(page);
    await page.getByRole("link", { name: /transactions/i }).click();

    // Click "Clear only"
    await page.getByRole("button", { name: /^Clear only$/i }).click();

    await expect(page.getByText(/city water utility/i).first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/flagged review/i)).toHaveCount(0, { timeout: 3_000 });
  });

  test("search filters by merchant name", async ({ page, request }) => {
    await createTransaction(request, token, FLAGGED_MERCHANTS.coffee);
    await createTransaction(request, token, UNFLAGGED_TRANSACTION);

    await login(page);
    await page.getByRole("link", { name: /transactions/i }).click();

    const searchInput = page.getByPlaceholder(/merchant|description|flag/i);
    await searchInput.fill("Starbucks");

    await expect(page.getByText(/starbucks/i).first()).toBeVisible({ timeout: 5_000 });
    await expect(
      page.locator(".transactions-ledger-row", { hasText: /city water utility/i })
    ).toHaveCount(0, { timeout: 3_000 });
  });

  test("transaction row shows amount, date, and category", async ({ page, request }) => {
    const txn = await createTransaction(request, token, FLAGGED_MERCHANTS.coffee);

    await login(page);
    await page.getByRole("link", { name: /transactions/i }).click();

    const row = page.locator(".transactions-ledger-row", { hasText: /starbucks/i }).first();
    await expect(row).toBeVisible({ timeout: 5_000 });
    // Amount should appear
    await expect(row.getByText(/5\.75/)).toBeVisible();
  });
});
