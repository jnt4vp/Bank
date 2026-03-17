import { apiRequest } from '../../lib/api/client'

function getToken() {
  return localStorage.getItem('token') || undefined
}

export async function saveAccountabilitySettings(payload) {
  return apiRequest('/api/accountability-settings', {
    method: 'POST',
    token: getToken(),
    body: payload,
  })
}

export async function getAccountabilitySettings(pactId) {
  return apiRequest(`/api/accountability-settings/${pactId}`, {
    token: getToken(),
  })
}
