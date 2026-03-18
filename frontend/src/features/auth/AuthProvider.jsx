import { useCallback, useEffect, useMemo, useState } from 'react'
import { AuthContext } from './context'
import { readStoredSession, persistSession, clearStoredSession } from './session'
import { apiRequest } from '../../lib/api'

export function AuthProvider({ children }) {
  const storedSession = readStoredSession()

  const [token, setToken] = useState(storedSession?.token || null)
  const [user, setUser] = useState(storedSession?.user || null)
  const [loading, setLoading] = useState(Boolean(storedSession?.token))

  const refreshUser = useCallback(
    async (nextToken = token) => {
      if (!nextToken) {
        setUser(null)
        setLoading(false)
        return null
      }

      try {
        const me = await apiRequest('/api/auth/me', { token: nextToken })
        setUser(me)
        persistSession({ token: nextToken, user: me })
        return me
      } catch (error) {
        clearStoredSession()
        setToken(null)
        setUser(null)
        throw error
      } finally {
        setLoading(false)
      }
    },
    [token]
  )

  useEffect(() => {
    if (storedSession?.token) {
      refreshUser(storedSession.token).catch(() => {})
    } else {
      setLoading(false)
    }
  }, [storedSession?.token, refreshUser])

  const login = useCallback(
    async (email, password) => {
      const data = await apiRequest('/api/auth/login', {
        method: 'POST',
        body: { email, password },
      })

      const nextToken = data.access_token || data.token
      setToken(nextToken)
      persistSession({ token: nextToken, user: null })
      await refreshUser(nextToken)
      return data
    },
    [refreshUser]
  )

  const logout = useCallback(() => {
    clearStoredSession()
    setToken(null)
    setUser(null)
  }, [])

  const value = useMemo(
    () => ({
      token,
      user,
      loading,
      login,
      logout,
      refreshUser,
      isAuthenticated: Boolean(token),
    }),
    [token, user, loading, login, logout, refreshUser]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}