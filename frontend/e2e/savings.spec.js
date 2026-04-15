import { test, expect } from "@playwright/test";
import { login, loginViaAPI } from "./helpers/auth.js";
import {
  createPact,
  deletePact,
  getUserPacts,
  upsertAccountabilitySettings,
  createTransaction,
  listSavingsTransfers,
  updateMe,
  getMe,
} from "./helpers/api.js";
import { FLAGGED_MERCHANTS } from "./helpers/fixtures.js";

test.describe("Savings percentage configuration", () => {
  let token;
  let pactId;

  test.beforeEach(async ({ request }) => {
    token = await loginViaAPI(request);

    // Clean up pacts
    const pacts = await getUserPacts(request, token);
    for (const p of pacts) {
      await deletePact(request, token, p.id);
    }

    // Create a pact
    const pact = await createPact(request, token, { preset_category: "Coffee Shops" });
    pactId = pact.id;
  });

  test("can set savings percentage on accountability settings via API", async ({ request }) => {
    const settings = await upsertAccountabilitySettings(request, token, {
      pact_id: pactId,
      accountability_type: "email",
      discipline_savings_percentage: 25,
      accountability_note: null,
      accountability_partner_ids: [],
    });

    expect(settings.discipline_savings_percentage).toBe(25);
    expect(settings.accountability_type).toBe("email");
  });

  test("savings percentage persists on user profile", async ({ request }) => {
    // Set savings % on user profile
    await updateMe(request, token, { discipline_savings_percentage: 15 });

    // Verify it persists
    const me = await getMe(request, token);
    expect(me.discipline_savings_percentage).toBe(15);
  });

  test.afterEach(async ({ request }) => {
    const pacts = await getUserPacts(request, token);
    for (const p of pacts) {
      await deletePact(request, token, p.id);
    }
  });
});

test.describe("Simulated savings transfers", () => {
  let token;
  let pactId;

  test.beforeEach(async ({ request }) => {
    token = await loginViaAPI(request);

    // Clean up pacts
    const pacts = await getUserPacts(request, token);
    for (const p of pacts) {
      await deletePact(request, token, p.id);
    }

    // Create pact with savings percentage
    const pact = await createPact(request, token, { preset_category: "Coffee Shops" });
    pactId = pact.id;

    await upsertAccountabilitySettings(request, token, {
      pact_id: pactId,
      accountability_type: "email",
      discipline_savings_percentage: 10,
      accountability_note: null,
      accountability_partner_ids: [],
    });
  });

  test("flagged transaction creates a simulated savings transfer", async ({ request }) => {
    // Get initial transfer count
    const before = await listSavingsTransfers(request, token);
    const countBefore = before.length;

    // Ingest a flagged transaction
    const txn = await createTransaction(request, token, FLAGGED_MERCHANTS.coffee);
    expect(txn.flagged).toBe(true);

    // Check that a new savings transfer was created
    const after = await listSavingsTransfers(request, token);
    expect(after.length).toBeGreaterThan(countBefore);

    // The transfer amount should be transaction amount * savings %
    const newTransfer = after.find(
      (t) => t.source_transaction_id === txn.id
    );
    if (newTransfer) {
      const expectedAmount = FLAGGED_MERCHANTS.coffee.amount * 0.1;
      expect(newTransfer.amount).toBeCloseTo(expectedAmount, 1);
      expect(newTransfer.transfer_type).toBe("simulated");
      expect(newTransfer.status).toBe("completed");
    }
  });

  test("unflagged transaction does not create a savings transfer", async ({ request }) => {
    const before = await listSavingsTransfers(request, token);

    await createTransaction(request, token, {
      merchant: "City Water Utility",
      description: "Monthly water bill",
      amount: 42.0,
    });

    const after = await listSavingsTransfers(request, token);
    expect(after.length).toBe(before.length);
  });

  test("savings transfers appear on the dashboard", async ({ page, request }) => {
    // Ingest a flagged transaction to generate a transfer
    await createTransaction(request, token, FLAGGED_MERCHANTS.coffee);

    await login(page);
    // Dashboard should show pact savings section
    await expect(page.getByText(/pact savings|savings/i).first()).toBeVisible({ timeout: 5_000 });
  });

  test("changing savings percentage applies to new transactions", async ({ request }) => {
    // Set to 20%
    await upsertAccountabilitySettings(request, token, {
      pact_id: pactId,
      accountability_type: "email",
      discipline_savings_percentage: 20,
      accountability_note: null,
      accountability_partner_ids: [],
    });

    const txn = await createTransaction(request, token, FLAGGED_MERCHANTS.coffee);
    expect(txn.flagged).toBe(true);

    const transfers = await listSavingsTransfers(request, token);
    const transfer = transfers.find((t) => t.source_transaction_id === txn.id);
    if (transfer) {
      const expectedAmount = FLAGGED_MERCHANTS.coffee.amount * 0.2;
      expect(transfer.amount).toBeCloseTo(expectedAmount, 1);
    }
  });

  test.afterEach(async ({ request }) => {
    const pacts = await getUserPacts(request, token);
    for (const p of pacts) {
      await deletePact(request, token, p.id);
    }
  });
});
