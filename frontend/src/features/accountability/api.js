const API_BASE = "http://localhost:8000/api";

function getAuthHeaders() {
  const token = localStorage.getItem("token");

  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

export async function saveAccountabilitySettings(payload) {
  const response = await fetch(`${API_BASE}/accountability-settings`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || "Failed to save accountability settings.");
  }

  return response.json();
}

export async function getAccountabilitySettings() {
  const response = await fetch(`${API_BASE}/accountability-settings`, {
    method: "GET",
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || "Failed to load accountability settings.");
  }

  return response.json();
}