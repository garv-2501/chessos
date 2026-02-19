import { Routes, Route, Navigate } from 'react-router-dom'
import DashboardPage from '../pages/DashboardPage'
import OpeningDetailPage from '../pages/OpeningDetailPage'
import PlayPage from '../pages/PlayPage'

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<DashboardPage />} />
      <Route path="/play" element={<PlayPage />} />
      <Route path="/openings/:eco" element={<OpeningDetailPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
