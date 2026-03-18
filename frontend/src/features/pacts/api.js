import { apiRequest } from "../../lib/api";

export function createPact(payload, token) {
  return apiRequest("/api/pacts", {
    method: "POST",
    body: payload,
    token,
  });
}

export function getUserPacts(userId) {
  return apiRequest(`/api/pacts/user/${userId}`, {
    method: "GET",
  });
}

export function getPact(pactId) {
  return apiRequest(`/api/pacts/${pactId}`, {
    method: "GET",
  });
}

export function updatePact(pactId, payload) {
  return apiRequest(`/api/pacts/${pactId}`, {
    method: "PUT",
    body: payload,
  });
}

export function deletePact(pactId) {
  return apiRequest(`/api/pacts/${pactId}`, {
    method: "DELETE",
  });
}