import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './lib/auth'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Courses from './pages/Courses'
import Instructors from './pages/Instructors'
import History from './pages/History'
import MyPreferences from './pages/MyPreferences'
import Cycles from './pages/Cycles'
import Responses from './pages/Responses'
import AccessLog from './pages/AccessLog'

export default function App() {
  const { session, loading, isCoordinator } = useAuth()

  if (loading && session) return <div className="p-8 text-slate-500">Loading…</div>
  if (!session) return <Login />

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/preferences" element={<MyPreferences />} />
        <Route path="/courses" element={<Courses />} />
        <Route path="/instructors" element={<Instructors />} />
        <Route path="/history" element={<History />} />
        {isCoordinator && <Route path="/cycles" element={<Cycles />} />}
        {isCoordinator && <Route path="/responses" element={<Responses />} />}
        {isCoordinator && <Route path="/access" element={<AccessLog />} />}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  )
}
