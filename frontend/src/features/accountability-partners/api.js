import { apiRequest } from '../../lib/api/client'
import { readStoredSession } from '../auth/session'

function getToken(explicitToken) {
  if (explicitToken) return explicitToken
  return readStoredSession()?.token || undefined
}

export async function listAccountabilityPartners(token) {
  return apiRequest('/api/accountability-partners', { token: getToken(token) })
}

export async function createAccountabilityPartner(payload, token) {
  return apiRequest('/api/accountability-partners', {
    method: 'POST',
    token: getToken(token),
    body: payload,
  })
}

export async function updateAccountabilityPartner(partnerId, payload, token) {
  return apiRequest(`/api/accountability-partners/${partnerId}`, {
    method: 'PUT',
    token: getToken(token),
    body: payload,
  })
}

export async function deleteAccountabilityPartner(partnerId, token) {
  return apiRequest(`/api/accountability-partners/${partnerId}`, {
    method: 'DELETE',
    token: getToken(token),
  })
}

export async function getAccountabilityAlertSettings(token) {
  return apiRequest('/api/accountability-partners/settings', { token: getToken(token) })
}

export async function updateAccountabilityAlertSettings(payload, token) {
  return apiRequest('/api/accountability-partners/settings', {
    method: 'PUT',
    token: getToken(token),
    body: payload,
  })
}
