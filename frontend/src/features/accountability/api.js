import { apiRequest } from '../../lib/api/client'

function getToken(token) {
  return token || localStorage.getItem('token') || undefined
}

export async function saveAccountabilitySettings(payload, token) {
  return apiRequest('/api/accountability-settings', {
    method: 'POST',
    token: getToken(token),
    body: payload,
  })
}

export async function getAccountabilitySettings(pactId, token) {
  return apiRequest(`/api/accountability-settings/${pactId}`, {
    token: getToken(token),
  })
}
