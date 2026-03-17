import { apiRequest } from '../../lib/api'

export function createLinkToken(token) {
  return apiRequest('/api/plaid/create-link-token', {
    method: 'POST',
    token,
  })
}

export function exchangePublicToken({ publicToken, institutionName, token }) {
  return apiRequest('/api/plaid/exchange-token', {
    method: 'POST',
    body: { public_token: publicToken, institution_name: institutionName },
    token,
  })
}

export function getPlaidItems(token) {
  return apiRequest('/api/plaid/items', { token })
}

export function syncPlaidItem({ itemId, token }) {
  return apiRequest(`/api/plaid/sync/${itemId}`, {
    method: 'POST',
    token,
  })
}

export function removePlaidItem({ itemId, token }) {
  return apiRequest(`/api/plaid/items/${itemId}`, {
    method: 'DELETE',
    token,
  })
}
