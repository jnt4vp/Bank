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

    if (storedSession.user) {
      setSession(storedSession)
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
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
