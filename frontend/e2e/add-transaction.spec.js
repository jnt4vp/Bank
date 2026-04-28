import { test, expect } from "@playwright/test";
import { login } from "./helpers/auth.js";

/**
 * Verifies the full manual Add Transaction flow:
 *   profile menu → /transactions/new → submit → redirect → row visible
 * Uses a unique merchant per run so we can locate the new row even
 * across re-runs against the same shared seeded user.
 */
test.describe("Add transaction (manual entry)", () => {
  test("submits form and lands as a row on /transactions", async ({ page }) => {
    await login(page);

    const stamp = Date.now();
    const merchant = `E2E Manual ${stamp}`;
    const description = `manual entry ${stamp}`;
    const amount = "12.34";

    // Open the profile dropdown and click the new menu item.
    await page.getByRole("button", { name: /test user/i }).click();
    const addLink = page.getByRole("link", { name: /add transaction/i });
    await expect(addLink).toBeVisible();
    await addLink.click();

    await expect(page).toHaveURL(/\/transactions\/new$/);

    // Fill the form. Anchor each regex because the Amount field's helper
    // text mentions "merchant" and "description", which would otherwise
    // make /merchant/i / /description/i match more than one input.
    await page.getByLabel(/^Merchant/).fill(merchant);
    await page.getByLabel(/^Description/).fill(description);
    await page.getByLabel(/^Amount/).fill(amount);

    // Capture the POST response so we can assert what the server actually saved.
    const postResponsePromise = page.waitForResponse(
      (resp) =>
        resp.url().endsWith("/api/transactions/") && resp.request().method() === "POST"
    );

    await page.getByRole("button", { name: /^add transaction$/i }).click();

    const postResponse = await postResponsePromise;
    expect(postResponse.status(), "POST /api/transactions/ should return 200").toBe(200);
    const created = await postResponse.json();
    expect(created.merchant).toBe(merchant);
    expect(Number(created.amount)).toBeCloseTo(Number(amount), 2);

    // Auto-redirect to /transactions.
    await expect(page).toHaveURL(/\/transactions$/, { timeout: 5_000 });

    // The row should appear at the top of the rendered ledger. (Regression
    // guard: backend used to sort by `date DESC NULLS LAST`, which pushed
    // manual rows past the GET limit and hid them entirely.)
    const row = page.locator(".transactions-ledger-row", { hasText: merchant }).first();
    await expect(row).toBeVisible({ timeout: 5_000 });
    await expect(row.getByText(/12\.34/)).toBeVisible();
  });
});
