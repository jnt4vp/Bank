const SESSION_STORAGE_KEY = 'bank.auth.session'
const LEGACY_TOKEN_KEY = 'token'
const LEGACY_USER_EMAIL_KEY = 'userEmail'
const LEGACY_USER_KEY = 'user'

function parseJson(rawValue) {
  if (!rawValue) {
    return null
  }

  try {
    return JSON.parse(rawValue)
  } catch {
    return null
  }
}

function normalizeSession(session) {
  if (!session?.token) {
    return null
  }

  return {
    token: session.token,
    user: session.user || null,
  }
}

function migrateLegacySession() {
  const token = window.localStorage.getItem(LEGACY_TOKEN_KEY)
  if (!token) {
    return null
  }

  const legacyUser = parseJson(window.localStorage.getItem(LEGACY_USER_KEY))
  const legacyEmail = window.localStorage.getItem(LEGACY_USER_EMAIL_KEY)

  const session = normalizeSession({
    token,
    user: legacyUser || (legacyEmail ? { email: legacyEmail, name: legacyEmail } : null),
  })

  window.localStorage.removeItem(LEGACY_TOKEN_KEY)
  window.localStorage.removeItem(LEGACY_USER_EMAIL_KEY)
  window.localStorage.removeItem(LEGACY_USER_KEY)

  if (session) {
    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session))
  }

  return session
}

export function readStoredSession() {
  if (typeof window === 'undefined') {
    return null
  }

  const stored = normalizeSession(
    parseJson(window.localStorage.getItem(SESSION_STORAGE_KEY)),
  )

  return stored || migrateLegacySession()
}

export function persistSession(session) {
  if (typeof window === 'undefined') {
    return
  }

  const normalizedSession = normalizeSession(session)
  if (!normalizedSession) {
    clearStoredSession()
    return
  }

  window.localStorage.setItem(
    SESSION_STORAGE_KEY,
    JSON.stringify(normalizedSession),
  )
}

export function clearStoredSession() {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.removeItem(SESSION_STORAGE_KEY)
}
