import { API_URL } from "./fixtures.js";

function headers(token) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

// ── Transactions ──────────────────────────────────────────────

export async function createTransaction(request, token, { merchant, description, amount }) {
  const res = await request.post(`${API_URL}/api/transactions/`, {
    headers: headers(token),
    data: { merchant, description, amount },
  });
  if (!res.ok()) {
    throw new Error(`createTransaction failed (${res.status()}): ${await res.text()}`);
  }
  return res.json();
}

export async function listTransactions(request, token, { flaggedOnly = false } = {}) {
  const url = flaggedOnly
    ? `${API_URL}/api/transactions/?flagged_only=true`
    : `${API_URL}/api/transactions/`;
  const res = await request.get(url, { headers: headers(token) });
  if (!res.ok()) {
    throw new Error(`listTransactions failed (${res.status()}): ${await res.text()}`);
  }
  return res.json();
}

// ── Pacts ─────────────────────────────────────────────────────

export async function createPact(request, token, { preset_category, custom_category, locked_until } = {}) {
  const res = await request.post(`${API_URL}/api/pacts`, {
    headers: headers(token),
    data: { preset_category, custom_category, locked_until },
  });
  if (!res.ok()) {
    throw new Error(`createPact failed (${res.status()}): ${await res.text()}`);
  }
  return res.json();
}

export async function deletePact(request, token, pactId) {
  const res = await request.delete(`${API_URL}/api/pacts/${pactId}`, {
    headers: headers(token),
  });
  // 204 is success
  if (res.status() !== 204 && !res.ok()) {
    throw new Error(`deletePact failed (${res.status()}): ${await res.text()}`);
  }
}

export async function getUserPacts(request, token) {
  // First get the user id
  const me = await getMe(request, token);
  const res = await request.get(`${API_URL}/api/pacts/user/${me.id}`, {
    headers: headers(token),
  });
  if (!res.ok()) {
    throw new Error(`getUserPacts failed (${res.status()}): ${await res.text()}`);
  }
  return res.json();
}

// ── Accountability Partners ───────────────────────────────────

export async function createPartner(request, token, { partner_name, partner_email, relationship_label }) {
  const res = await request.post(`${API_URL}/api/accountability-partners`, {
    headers: headers(token),
    data: { partner_name, partner_email, relationship_label },
  });
  if (!res.ok()) {
    throw new Error(`createPartner failed (${res.status()}): ${await res.text()}`);
  }
  return res.json();
}

export async function listPartners(request, token) {
  const res = await request.get(`${API_URL}/api/accountability-partners`, {
    headers: headers(token),
  });
  if (!res.ok()) {
    throw new Error(`listPartners failed (${res.status()}): ${await res.text()}`);
  }
  return res.json();
}

export async function deletePartner(request, token, partnerId) {
  const res = await request.delete(`${API_URL}/api/accountability-partners/${partnerId}`, {
    headers: headers(token),
  });
  if (res.status() !== 204 && !res.ok()) {
    throw new Error(`deletePartner failed (${res.status()}): ${await res.text()}`);
  }
}

// ── Accountability Settings ───────────────────────────────────

export async function upsertAccountabilitySettings(request, token, { pact_id, accountability_type, discipline_savings_percentage, accountability_note, accountability_partner_ids }) {
  const res = await request.post(`${API_URL}/api/accountability-settings`, {
    headers: headers(token),
    data: { pact_id, accountability_type, discipline_savings_percentage, accountability_note, accountability_partner_ids },
  });
  if (!res.ok()) {
    throw new Error(`upsertAccountabilitySettings failed (${res.status()}): ${await res.text()}`);
  }
  return res.json();
}

// ── Simulated Savings ─────────────────────────────────────────

export async function listSavingsTransfers(request, token) {
  const res = await request.get(`${API_URL}/api/simulated-savings-transfers/`, {
    headers: headers(token),
  });
  if (!res.ok()) {
    throw new Error(`listSavingsTransfers failed (${res.status()}): ${await res.text()}`);
  }
  const body = await res.json();
  // Response is SimulatedSavingsTransfersSummary { transfers: [...], total_recorded, simulated_transfers_enabled }
  return body.transfers;
}

// ── User ──────────────────────────────────────────────────────

export async function getMe(request, token) {
  const res = await request.get(`${API_URL}/api/auth/me`, {
    headers: headers(token),
  });
  if (!res.ok()) {
    throw new Error(`getMe failed (${res.status()}): ${await res.text()}`);
  }
  return res.json();
}

export async function updateMe(request, token, data) {
  const res = await request.patch(`${API_URL}/api/auth/me`, {
    headers: headers(token),
    data,
  });
  if (!res.ok()) {
    throw new Error(`updateMe failed (${res.status()}): ${await res.text()}`);
  }
  return res.json();
}

// ── Goals ─────────────────────────────────────────────────────

export async function getSpendingBreakdown(request, token, { goals, period_start, period_end }) {
  const res = await request.post(`${API_URL}/api/goals/spending-breakdown`, {
    headers: headers(token),
    data: { goals, period_start, period_end },
  });
  if (!res.ok()) {
    throw new Error(`getSpendingBreakdown failed (${res.status()}): ${await res.text()}`);
  }
  return res.json();
}
