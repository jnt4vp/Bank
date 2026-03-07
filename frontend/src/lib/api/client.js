const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')

export class ApiError extends Error {
  constructor(message, { status, data } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.data = data
  }
}

function buildUrl(path) {
  if (/^https?:\/\//.test(path)) {
    return path
  }

  return `${API_BASE_URL}${path}`
}

function getErrorMessage(response, data) {
  if (data && typeof data === 'object') {
    return data.detail || data.message || `Request failed (${response.status})`
  }

  if (typeof data === 'string' && data.trim()) {
    return data
  }

  return `Request failed (${response.status})`
}

export async function apiRequest(path, options = {}) {
  const {
    method = 'GET',
    body,
    headers = {},
    token,
    signal,
  } = options

  const response = await fetch(buildUrl(path), {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
    signal,
  })

  const contentType = response.headers.get('content-type') || ''
  const isJson = contentType.includes('application/json')

  let data = null
  if (isJson) {
    data = await response.json().catch(() => null)
  } else {
    const text = await response.text().catch(() => '')
    data = text || null
  }

  if (!response.ok) {
    throw new ApiError(getErrorMessage(response, data), {
      status: response.status,
      data,
    })
  }

  return data
}
