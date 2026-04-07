import { useEffect, useState } from 'react'

import { loginWithPassword, fetchCurrentUser } from '../features/auth/api'
import { AuthContext } from '../features/auth/context'
import {
  clearStoredSession,
  persistSession,
  readStoredSession,
} from '../features/auth/session'

export default function AuthProvider({ children }) {
  const [session, setSession] = useState(() => readStoredSession())
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    let isActive = true
    const storedSession = readStoredSession()

    if (!storedSession?.token) {
      setIsReady(true)
      return () => {
        isActive = false
      }
    }

    async function hydrateSession() {
      try {
        const user = await fetchCurrentUser(storedSession.token)
        if (!isActive) {
          return
        }

        const nextSession = {
          token: storedSession.token,
          user,
        }
        persistSession(nextSession)
        setSession(nextSession)
      } catch {
        if (!isActive) {
          return
        }

        clearStoredSession()
        setSession(null)
      } finally {
        if (isActive) {
          setIsReady(true)
        }
      }
    }

    // Always refresh from API when a token exists so profile fields (e.g. discipline window)
    // stay current instead of sticking to stale localStorage after deploy.
    hydrateSession()

    return () => {
      isActive = false
    }
  }, [])

  async function login(credentials) {
    const authResult = await loginWithPassword(credentials)
    const user = await fetchCurrentUser(authResult.access_token)
    const nextSession = {
      token: authResult.access_token,
      user,
    }

    persistSession(nextSession)
    setSession(nextSession)
    return nextSession
  }

  async function refreshUser(overrideToken) {
    const tok = overrideToken ?? session?.token
    if (!tok) return
    try {
      const user = await fetchCurrentUser(tok)
      const nextSession = { token: tok, user }
      persistSession(nextSession)
      setSession(nextSession)
    } catch (err) {
      const fromDisk = readStoredSession()
      if (fromDisk?.token === tok && fromDisk.user) {
        setSession(fromDisk)
      }
      throw err
    }
  }

  function logout() {
    clearStoredSession()
    setSession(null)
  }

  const value = {
    user: session?.user || null,
    token: session?.token || null,
    isAuthenticated: Boolean(session?.token),
    isReady,
    login,
    logout,
    refreshUser,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
