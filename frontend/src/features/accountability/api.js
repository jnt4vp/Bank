import { apiRequest } from '../../lib/api/client'
import { readStoredSession } from '../auth/session'

function getToken(explicitToken) {
  if (explicitToken) return explicitToken
  return readStoredSession()?.token || undefined
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
