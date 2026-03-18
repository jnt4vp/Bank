import { Navigate, Route, Routes } from 'react-router-dom'

import AppLayout from '../components/AppLayout'
import Dashboard from '../pages/Dashboard'
import ForgotPassword from '../pages/ForgotPassword'
import Landing from '../pages/Landing'
import ResetPassword from '../pages/ResetPassword'
import Settings from '../pages/Settings'
import Signup from '../pages/Signup'
import Register from '../pages/Register'
import Transactions from '../pages/Transactions'
import Pacts from '../pages/Pacts'
import ProtectedRoute from './ProtectedRoute'

export default function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/transactions" element={<Transactions />} />
        <Route path="/pacts" element={<Pacts />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
