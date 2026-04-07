import { apiRequest } from '../../lib/api'
import { persistSession } from './session'

export async function loginWithPassword({ email, password }) {
  const result = await apiRequest('/api/auth/login', {
    method: 'POST',
    body: { email, password },
  })

  return result
}

export async function registerAccount({ name, email, password, phone }) {
  const result = await apiRequest('/api/auth/register', {
    method: 'POST',
    body: { name, email, password, phone },
  })

  const token = result?.access_token
  if (token) {
    persistSession({
      token,
      user: result.user ?? null,
    })
  }

  return result
}

export function requestPasswordReset({ email }) {
  return apiRequest('/api/auth/forgot-password', {
    method: 'POST',
    body: { email },
  })
}

export function resetPassword({ token, newPassword }) {
  return apiRequest('/api/auth/reset-password', {
    method: 'POST',
    body: {
      token,
      new_password: newPassword,
    },
  })
}

export function fetchCurrentUser(token) {
  return apiRequest('/api/auth/me', { token })
}