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
import Scenarios from './pages/Scenarios'
import Board from './pages/Board'
import Report from './pages/Report'
import Compare from './pages/Compare'
import StudentCheck from './pages/StudentCheck'

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
        <Route path="/student-check" element={<StudentCheck />} />
        {isCoordinator && <Route path="/scenarios" element={<Scenarios />} />}
        {isCoordinator && <Route path="/board" element={<Board />} />}
        {isCoordinator && <Route path="/board/:scenarioId" element={<Board />} />}
        {isCoordinator && <Route path="/report" element={<Report />} />}
        {isCoordinator && <Route path="/report/:scenarioId" element={<Report />} />}
        {isCoordinator && <Route path="/compare" element={<Compare />} />}
        {isCoordinator && <Route path="/cycles" element={<Cycles />} />}
        {isCoordinator && <Route path="/responses" element={<Responses />} />}
        {isCoordinator && <Route path="/access" element={<AccessLog />} />}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  )
}
