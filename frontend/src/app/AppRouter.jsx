import { Navigate, Route, Routes } from 'react-router-dom'

import Dashboard from '../pages/Dashboard'
import ForgotPassword from '../pages/ForgotPassword'
import Landing from '../pages/Landing'
import Register from '../pages/Register'
import ResetPassword from '../pages/ResetPassword'
import ProtectedRoute from './ProtectedRoute'

export default function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
