import { Routes, Route, Navigate } from 'react-router-dom'
import OpeningDetailPage from '../pages/OpeningDetailPage'
import PlayPage from '../pages/PlayPage'

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<PlayPage />} />
      <Route path="/play" element={<Navigate to="/" replace />} />
      <Route path="/openings/:eco" element={<OpeningDetailPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
