import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth'
import { DataProvider } from './data'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Orders from './pages/Orders'
import Users from './pages/Users'
import Analytics from './pages/Analytics'
import System from './pages/System'
import Live from './pages/Live'
import Activity from './pages/Activity'
import { ToastProvider } from './toast'

function Gate() {
  const { authed } = useAuth()
  if (!authed) return <Login />
  return (
    <ToastProvider>
      <DataProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="analytics" element={<Analytics />} />
            <Route path="activity" element={<Activity />} />
            <Route path="live" element={<Live />} />
            <Route path="orders" element={<Orders />} />
            <Route path="riders" element={<Users role="rider" key="rider" />} />
            <Route path="customers" element={<Users role="customer" key="customer" />} />
            <Route path="system" element={<System />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </DataProvider>
    </ToastProvider>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  )
}
