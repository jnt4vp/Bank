import { apiRequest } from '../../lib/api'

export function loginWithPassword({ email, password }) {
  return apiRequest('/api/auth/login', {
    method: 'POST',
    body: { email, password },
  })
}

export function registerAccount({ name, email, password, phone }) {
  return apiRequest('/api/auth/register', {
    method: 'POST',
    body: { name, email, password, phone },
  })
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
