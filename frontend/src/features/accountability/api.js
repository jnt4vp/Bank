const API_BASE = "http://localhost:8000/api";

function getAuthHeaders() {
  const token = localStorage.getItem("token");
  const headers = {
    "Content-Type": "application/json",
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

async function parseError(response, fallbackMessage) {
  try {
    const data = await response.json();
    return data.detail || fallbackMessage;
  } catch {
    const text = await response.text();
    return text || fallbackMessage;
  }
}

export async function saveAccountabilitySettings(payload) {
  const response = await fetch(`${API_BASE}/accountability-settings`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(
      await parseError(response, "Failed to save accountability settings.")
    );
  }

  return response.json();
}

export async function getAccountabilitySettings() {
  const response = await fetch(`${API_BASE}/accountability-settings`, {
    method: "GET",
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error(
      await parseError(response, "Failed to load accountability settings.")
    );
  }

  return response.json();
}