import { test, expect } from "@playwright/test";
import { login, loginViaAPI } from "./helpers/auth.js";
import { createTransaction, getSpendingBreakdown } from "./helpers/api.js";

test.describe("Goals page", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.getByRole("link", { name: /goals/i }).click();
    await expect(page).toHaveURL(/goals/);
  });

  test("shows goals page header", async ({ page }) => {
    await expect(page.getByText(/goals/i).first()).toBeVisible();
  });

  test("shows empty state when no goals exist", async ({ page }) => {
    await expect(page.getByText(/no goals yet\. add one on the right\./i)).toBeVisible({
      timeout: 5_000,
    });
  });

  test("shows add goal form", async ({ page }) => {
    await expect(page.getByText(/add goal/i)).toBeVisible();
    await expect(page.getByPlaceholder(/coffee|dining/i)).toBeVisible();
    await expect(page.getByPlaceholder(/200/)).toBeVisible();
    await expect(page.getByRole("button", { name: /save goal/i })).toBeVisible();
  });
});

test.describe("Goal CRUD via UI", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.getByRole("link", { name: /goals/i }).click();
    await expect(page).toHaveURL(/goals/);
  });

  test("can create a goal", async ({ page }) => {
    await page.getByPlaceholder(/coffee|dining/i).fill("Coffee");
    await page.getByPlaceholder(/200/).fill("50");
    await page.getByRole("button", { name: /save goal/i }).click();

    await expect(page.getByText(/coffee/i).first()).toBeVisible({ timeout: 5_000 });
  });

  test("shows validation error for empty goal name", async ({ page }) => {
    // Leave name empty, fill limit
    await page.getByPlaceholder(/200/).fill("50");
    await page.getByRole("button", { name: /save goal/i }).click();

    await expect(page.getByText(/enter a goal name/i)).toBeVisible({ timeout: 3_000 });
  });

  test("shows validation error for missing limit", async ({ page }) => {
    await page.getByPlaceholder(/coffee|dining/i).fill("Coffee");
    // Don't fill limit
    await page.getByRole("button", { name: /save goal/i }).click();

    await expect(page.getByText(/valid monthly limit/i)).toBeVisible({ timeout: 3_000 });
  });

  test("shows duplicate goal error", async ({ page }) => {
    // Create first goal
    await page.getByPlaceholder(/coffee|dining/i).fill("TestDuplicate");
    await page.getByPlaceholder(/200/).fill("100");
    await page.getByRole("button", { name: /save goal/i }).click();
    await expect(page.getByText(/testduplicate/i)).toBeVisible({ timeout: 5_000 });

    // Try creating same goal again
    await page.getByPlaceholder(/coffee|dining/i).fill("TestDuplicate");
    await page.getByPlaceholder(/200/).fill("200");
    await page.getByRole("button", { name: /save goal/i }).click();

    await expect(page.getByText(/already have a goal/i)).toBeVisible({ timeout: 3_000 });
  });

  test("can delete a goal", async ({ page }) => {
    // Create a goal first
    await page.getByPlaceholder(/coffee|dining/i).fill("DeleteMe");
    await page.getByPlaceholder(/200/).fill("75");
    await page.getByRole("button", { name: /save goal/i }).click();
    await expect(page.getByText(/deleteme/i)).toBeVisible({ timeout: 5_000 });

    // Delete it
    const removeBtn = page.getByRole("button", { name: /remove deleteme/i });
    await expect(removeBtn).toBeVisible();
    await removeBtn.click();

    await expect(page.getByText(/deleteme/i)).not.toBeVisible({ timeout: 5_000 });
  });
});

test.describe("Goal spending attribution (API)", () => {
  let token;

  test.beforeEach(async ({ request }) => {
    token = await loginViaAPI(request);
  });

  test("spending breakdown returns results for matching transactions", async ({ request }) => {
    // Ingest a transaction
    await createTransaction(request, token, {
      merchant: "Starbucks",
      description: "Morning coffee",
      amount: 5.5,
    });

    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1)
      .toISOString()
      .split("T")[0];
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      .toISOString()
      .split("T")[0];

    const result = await getSpendingBreakdown(request, token, {
      goals: [
        {
          category: "Coffee",
          keywords: ["coffee"],
          merchants: ["starbucks"],
          subcategories: [],
        },
      ],
      period_start: periodStart,
      period_end: periodEnd,
    });

    expect(result.spent_by_goal).toBeDefined();
    expect(result.method).toBeDefined();
  });

  test("spending breakdown returns zero for non-matching goals", async ({ request }) => {
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1)
      .toISOString()
      .split("T")[0];
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      .toISOString()
      .split("T")[0];

    const result = await getSpendingBreakdown(request, token, {
      goals: [
        {
          category: "Nonexistent Category XYZ",
          keywords: [],
          merchants: [],
          subcategories: [],
        },
      ],
      period_start: periodStart,
      period_end: periodEnd,
    });

    expect(result.spent_by_goal).toBeDefined();
    const amount = result.spent_by_goal["Nonexistent Category XYZ"] ?? 0;
    expect(amount).toBe(0);
  });
});
