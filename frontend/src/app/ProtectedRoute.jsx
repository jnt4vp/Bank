import { Navigate } from 'react-router-dom'

import { useAuth } from '../features/auth/context'

export default function ProtectedRoute({ children }) {
  const { isAuthenticated, isReady } = useAuth()

  if (!isReady) {
    return null
  }

  if (!isAuthenticated) {
    return <Navigate to="/" replace />
  }

  return children
}
