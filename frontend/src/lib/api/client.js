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
  if ([502, 503, 504].includes(response.status)) {
    return 'Service temporarily unavailable. Please try again in a moment.'
  }

  if (data && typeof data === 'object') {
    return data.detail || data.message || `Request failed (${response.status})`
  }

  if (typeof data === 'string' && data.trim()) {
    const trimmed = data.trim()
    if (/^<!doctype html/i.test(trimmed) || /^<html/i.test(trimmed)) {
      return 'Service temporarily unavailable. Please try again in a moment.'
    }

    return data
  }

  return `Request failed (${response.status})`
}

function isLikelyNetworkFailure(err) {
  if (!(err instanceof TypeError)) {
    return false
  }
  const msg = typeof err.message === 'string' ? err.message : ''
  return /failed to fetch|load failed|networkerror|fetch/i.test(msg)
}

export async function apiRequest(path, options = {}) {
  const {
    method = 'GET',
    body,
    headers = {},
    token,
    signal,
  } = options

  const url = buildUrl(path)
  let response
  try {
    response = await fetch(url, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal,
    })
  } catch (err) {
    if (isLikelyNetworkFailure(err)) {
      const hint =
        API_BASE_URL === ''
          ? 'Cannot reach the API server. From the project root run `make dev` (starts Postgres, backend on port 8000, and frontend), or start the backend alone with `uvicorn backend.main:app --reload --port 8000`.'
          : 'Cannot reach the API server. Check VITE_API_BASE_URL and your network.'
      throw new ApiError(hint, { status: 0, data: null })
    }
    throw err
  }

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
