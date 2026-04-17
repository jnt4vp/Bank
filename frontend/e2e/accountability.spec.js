import { test, expect } from "@playwright/test";
import { login, loginViaAPI } from "./helpers/auth.js";
import {
  createPact,
  createPartner,
  deletePact,
  deletePartner,
  getUserPacts,
  listPartners,
  upsertAccountabilitySettings,
  createTransaction,
} from "./helpers/api.js";
import { FLAGGED_MERCHANTS } from "./helpers/fixtures.js";

async function openPartnerFlow(page) {
  await page.getByRole("tab", { name: /create pact/i }).click();
  await page.getByLabel(/alert recipient/i).selectOption("partner");
}

test.describe("Accountability partners on Pacts page", () => {
  let token;

  test.beforeEach(async ({ page, request }) => {
    token = await loginViaAPI(request);

    // Clean slate
    const partners = await listPartners(request, token);
    for (const p of partners) {
      await deletePartner(request, token, p.id);
    }
    const pacts = await getUserPacts(request, token);
    for (const p of pacts) {
      await deletePact(request, token, p.id);
    }

    await login(page);
    await page.getByRole("link", { name: /pacts/i }).click();
    await expect(page).toHaveURL(/pacts/);
    await openPartnerFlow(page);
  });

  test("shows accountability partner section with helper text", async ({ page }) => {
    await expect(
      page.getByText(/choose one or more accountability partners/i)
    ).toBeVisible();
  });

  test("shows empty state for accountability partner", async ({ page }) => {
    await expect(
      page.getByText(/no accountability partner yet/i).first()
    ).toBeVisible();
  });

  test("can add an accountability partner inline", async ({ page }) => {
    // Click "Add new" to show the partner form
    const addBtn = page.getByRole("button", { name: /add new/i });
    if (await addBtn.isVisible()) {
      await addBtn.click();
    }

    // Fill in partner form
    await page.getByPlaceholder(/alex$/i).first().fill("Test Partner");
    await page.getByPlaceholder(/alex@example\.com/i).fill("partner@test.com");
    await page.getByPlaceholder(/friend|sibling|coach/i).first().fill("Friend");

    // Save
    await page.getByRole("button", { name: /save partner/i }).click();

    // Partner should appear in the list
    await expect(page.getByText(/test partner/i)).toBeVisible({ timeout: 5_000 });
  });

  test.afterEach(async ({ request }) => {
    const partners = await listPartners(request, token);
    for (const p of partners) {
      await deletePartner(request, token, p.id);
    }
    const pacts = await getUserPacts(request, token);
    for (const p of pacts) {
      await deletePact(request, token, p.id);
    }
  });
});

test.describe("Accountability partner CRUD via API + UI verification", () => {
  let token;
  let partnerId;

  test.beforeEach(async ({ request }) => {
    token = await loginViaAPI(request);

    // Clean slate
    const partners = await listPartners(request, token);
    for (const p of partners) {
      await deletePartner(request, token, p.id);
    }

    // Create a partner via API
    const partner = await createPartner(request, token, {
      partner_name: "Jane Doe",
      partner_email: "jane@example.com",
      relationship_label: "Sibling",
    });
    partnerId = partner.id;
  });

  test("partner created via API shows up in UI", async ({ page }) => {
    await login(page);
    await page.getByRole("link", { name: /pacts/i }).click();
    await openPartnerFlow(page);
    await page.getByRole("button", { name: /choose accountability partners/i }).click();

    await expect(page.getByText(/jane doe/i)).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/jane@example\.com/i)).toBeVisible();
  });

  test("can edit a partner inline", async ({ page }) => {
    await login(page);
    await page.getByRole("link", { name: /pacts/i }).click();
    await openPartnerFlow(page);
    await page.getByRole("button", { name: /choose accountability partners/i }).click();

    // Find the edit button near the partner
    const editBtn = page.getByRole("button", { name: /edit/i }).first();
    await expect(editBtn).toBeVisible({ timeout: 5_000 });
    await editBtn.click();

    // Update the name
    const nameInput = page.getByPlaceholder(/alex$/i).first();
    await nameInput.clear();
    await nameInput.fill("Jane Updated");

    await page.getByRole("button", { name: /update partner|save/i }).first().click();
    await expect(page.getByText(/jane updated/i)).toBeVisible({ timeout: 5_000 });
  });

  test.afterEach(async ({ request }) => {
    const partners = await listPartners(request, token);
    for (const p of partners) {
      await deletePartner(request, token, p.id);
    }
  });
});

test.describe("Accountability alert flow (API-driven)", () => {
  let token;
  let pactId;
  let partnerId;

  test.beforeEach(async ({ request }) => {
    token = await loginViaAPI(request);

    // Clean up
    const partners = await listPartners(request, token);
    for (const p of partners) {
      await deletePartner(request, token, p.id);
    }
    const pacts = await getUserPacts(request, token);
    for (const p of pacts) {
      await deletePact(request, token, p.id);
    }

    // Set up: pact + partner + accountability settings
    const pact = await createPact(request, token, { preset_category: "Coffee Shops" });
    pactId = pact.id;

    const partner = await createPartner(request, token, {
      partner_name: "Alert Test Partner",
      partner_email: "alert-partner@test.com",
      relationship_label: "Coach",
    });
    partnerId = partner.id;

    await upsertAccountabilitySettings(request, token, {
      pact_id: pactId,
      accountability_type: "email",
      discipline_savings_percentage: 0,
      accountability_note: "Stay disciplined!",
      accountability_partner_ids: [partnerId],
    });
  });

  test("flagged transaction triggers alert_sent on the transaction", async ({ request }) => {
    const txn = await createTransaction(request, token, FLAGGED_MERCHANTS.coffee);

    expect(txn.flagged).toBe(true);
    // The backend should mark alert_sent = true when email is configured
    expect(txn.alert_sent).toBe(true);
  });

  test("unflagged transaction does not trigger alert", async ({ request }) => {
    const txn = await createTransaction(request, token, {
      merchant: "City Water Utility",
      description: "Monthly bill",
      amount: 42.0,
    });

    expect(txn.flagged).toBe(false);
    expect(txn.alert_sent).toBe(false);
    expect(txn.accountability_alert_sent).toBe(false);
  });

  test.afterEach(async ({ request }) => {
    const partners = await listPartners(request, token);
    for (const p of partners) {
      await deletePartner(request, token, p.id);
    }
    const pacts = await getUserPacts(request, token);
    for (const p of pacts) {
      await deletePact(request, token, p.id);
    }
  });
});
