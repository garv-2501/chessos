import DashboardCard from '../components/DashboardCard/DashboardCard'

export default function DashboardPage() {
  return (
    <main className="page">
      <header className="page-header">
        <h1>chessOS</h1>
        <p className="muted">Play the bot and view live analysis.</p>
      </header>
      <div className="grid">
        <DashboardCard />
      </div>
    </main>
  )
}
