import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

type Difficulty = 'Easy' | 'Medium' | 'Hard'

const difficulties: Difficulty[] = ['Easy', 'Medium', 'Hard']

export default function DashboardCard() {
  const [difficulty, setDifficulty] = useState<Difficulty>('Easy')
  const navigate = useNavigate()

  return (
    <section className="card">
      <h2>Play the Bot</h2>
      <p className="muted">Choose a difficulty and start a game.</p>

      <label className="field">
        <span>Bot difficulty</span>
        <select
          value={difficulty}
          onChange={(event) => setDifficulty(event.target.value as Difficulty)}
        >
          {difficulties.map((level) => (
            <option key={level} value={level}>
              {level}
            </option>
          ))}
        </select>
      </label>

      <button className="primary" onClick={() => navigate('/play')}>
        Play
      </button>
    </section>
  )
}
