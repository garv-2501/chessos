import { useMemo } from 'react'
import { pieceLabel, pieceToAsset } from '../chess/assets'
import { INITIAL_FEN, parseFEN } from '../chess/fen'

const fileLabels = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
const rankLabels = ['8', '7', '6', '5', '4', '3', '2', '1']

const squares = Array.from({ length: 64 }, (_, index) => {
  const row = Math.floor(index / 8)
  const col = index % 8
  const isDark = (row + col) % 2 === 1
  return { id: index, row, col, isDark }
})

export default function PlayPage() {
  const board = useMemo(() => parseFEN(INITIAL_FEN), [])

  return (
    <main className="page play-page">
      <section className="play-left">
        <div className="player-row">
          <div className="avatar" />
          <div>
            <div className="player-name">Opponent</div>
            <div className="player-sub">AI · Stockfish</div>
          </div>
        </div>

        <div className="board-frame">
          <div className="board-grid">
            {squares.map((square) => {
              const piece = board[square.row][square.col]
              const showRank = square.col === 0
              const showFile = square.row === 7
              return (
                <div
                  key={square.id}
                  className={square.isDark ? 'square dark' : 'square light'}
                >
                  {piece ? (
                    <img
                      className="piece"
                      src={pieceToAsset(piece)}
                      alt={pieceLabel(piece)}
                    />
                  ) : null}
                  {showRank ? (
                    <span className="square-rank">{rankLabels[square.row]}</span>
                  ) : null}
                  {showFile ? (
                    <span className="square-file">{fileLabels[square.col]}</span>
                  ) : null}
                </div>
              )
            })}
          </div>
        </div>

        <div className="player-row">
          <div className="avatar user" />
          <div>
            <div className="player-name">You</div>
            <div className="player-sub">Player</div>
          </div>
        </div>
      </section>

      <aside className="play-right">
        <header className="panel-header">
          <h2>Play Chess</h2>
          <p className="muted">Live analysis and game stats</p>
        </header>

        <div className="info-card">
          <h3>Move List</h3>
          <p>Track moves as the game progresses.</p>
        </div>
        <div className="info-card">
          <h3>Bot Rating</h3>
          <p>Selected difficulty and engine strength.</p>
        </div>
        <div className="info-card">
          <h3>Live ELO</h3>
          <p>Estimated rating based on current play.</p>
        </div>
        <div className="info-card">
          <h3>Analysis</h3>
          <p>Stockfish evaluation and best lines.</p>
        </div>
      </aside>
    </main>
  )
}
