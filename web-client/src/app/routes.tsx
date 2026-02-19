import { Routes, Route, Navigate } from 'react-router-dom'
import DashboardPage from '../pages/DashboardPage'
import PlayPage from '../pages/PlayPage'

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<DashboardPage />} />
      <Route path="/play" element={<PlayPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
