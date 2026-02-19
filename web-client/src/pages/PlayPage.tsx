import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  findOpening,
  getPositionBook,
  openingBook as loadOpeningBook,
  type Opening,
  type OpeningCollection,
  type PositionBook,
} from '@chess-openings/eco.json'
import { pieceLabel, pieceToAsset } from '../chess/assets'
import {
  createInitialGameState,
  gameReducer,
  getLegalMovesForSquare,
  squareAt,
  type PlayedMove,
} from '../chess/game'
import type { Piece } from '../chess/types'

const fileLabels = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
const rankLabels = ['8', '7', '6', '5', '4', '3', '2', '1']

const SAN_SYMBOLS: Record<string, string> = {
  K: '♔',
  Q: '♕',
  R: '♖',
  B: '♗',
  N: '♘',
}

type DragState = {
  fromSquare: string
  piece: Piece
  pointerX: number
  pointerY: number
  hoverSquare: string | null
  cellSize: number
  legalMoves: string[]
}

type MoveRow = {
  moveNumber: number
  white: PlayedMove | null
  black: PlayedMove | null
  whiteIndex: number
  blackIndex: number
}

const squares = Array.from({ length: 64 }, (_, index) => {
  const row = Math.floor(index / 8)
  const col = index % 8
  const isDark = (row + col) % 2 === 1
  return { id: index, row, col, isDark }
})

function getSquareFromPoint(x: number, y: number): string | null {
  const element = document.elementFromPoint(x, y)
  const squareElement = element?.closest('[data-square]') as HTMLElement | null
  return squareElement?.dataset.square ?? null
}

function formatSanWithSymbols(san: string): string {
  return san.replace(/[KQRBN]/g, (symbol) => SAN_SYMBOLS[symbol] ?? symbol)
}

function buildMoveRows(history: PlayedMove[]): MoveRow[] {
  const rows: MoveRow[] = []

  for (let index = 0; index < history.length; index += 2) {
    rows.push({
      moveNumber: index / 2 + 1,
      white: history[index] ?? null,
      black: history[index + 1] ?? null,
      whiteIndex: index,
      blackIndex: index + 1,
    })
  }

  return rows
}

export default function PlayPage() {
  const navigate = useNavigate()
  const [state, dispatch] = useReducer(
    gameReducer,
    undefined,
    createInitialGameState,
  )
  const [dragState, setDragState] = useState<DragState | null>(null)
  const [openings, setOpenings] = useState<OpeningCollection | null>(null)
  const [positionBook, setPositionBook] = useState<PositionBook | null>(null)
  const [detectedOpening, setDetectedOpening] = useState<Opening | null>(null)
  const [openingLoadError, setOpeningLoadError] = useState<string | null>(null)
  const [openingLookupStopped, setOpeningLookupStopped] = useState(false)
  const [openingLookupAttempted, setOpeningLookupAttempted] = useState(false)
  const dragStateRef = useRef<DragState | null>(null)
  const suppressNextClickRef = useRef(false)
  const isGameOver = state.status === 'checkmate' || state.status === 'draw'

  const board = state.board
  const moveRows = useMemo(() => buildMoveRows(state.moveHistory), [state.moveHistory])
  const lastMoveIndex = state.moveHistory.length - 1
  const opponentPrefix =
    state.status === 'checkmate'
      ? state.winner === 'b'
        ? 'Winner - '
        : 'Lost - '
      : ''
  const userPrefix =
    state.status === 'checkmate'
      ? state.winner === 'w'
        ? 'Winner - '
        : 'Lost - '
      : ''

  useEffect(() => {
    let active = true

    const load = async () => {
      try {
        const book = await loadOpeningBook()
        if (!active) {
          return
        }
        setOpenings(book)
        setPositionBook(getPositionBook(book))
      } catch {
        if (!active) {
          return
        }
        setOpeningLoadError('Unable to load opening database')
      }
    }

    void load()

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!openings || !positionBook || openingLookupStopped) {
      return
    }

    setOpeningLookupAttempted(true)
    const opening = findOpening(openings, state.fen, positionBook)
    if (opening) {
      setDetectedOpening(opening)
      return
    }

    // Freeze further lookups on first miss.
    // If we already had a known opening, keep displaying that as fallback.
    setOpeningLookupStopped(true)
  }, [openings, positionBook, state.fen, openingLookupStopped])

  useEffect(() => {
    dragStateRef.current = dragState
  }, [dragState])

  useEffect(() => {
    if (!dragState) {
      return
    }

    const onPointerMove = (event: PointerEvent) => {
      const hoverSquare = getSquareFromPoint(event.clientX, event.clientY)
      setDragState((current) =>
        current
          ? {
              ...current,
              pointerX: event.clientX,
              pointerY: event.clientY,
              hoverSquare,
            }
          : null,
      )
    }

    const onPointerUp = (event: PointerEvent) => {
      const current = dragStateRef.current
      if (!current) {
        return
      }

      suppressNextClickRef.current = true
      const dropSquare = getSquareFromPoint(event.clientX, event.clientY)

      if (
        dropSquare &&
        dropSquare !== current.fromSquare &&
        current.legalMoves.includes(dropSquare)
      ) {
        dispatch({ type: 'MOVE_SELECTED_TO', square: dropSquare })
      }

      setDragState(null)
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerUp)

    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerUp)
    }
  }, [dragState])

  return (
    <main className="page play-page">
      <section className="play-left">
        <div className="player-row">
          <div className="avatar" />
          <div>
            <div className="player-name">{opponentPrefix}Opponent</div>
            <div className="player-sub">AI · Stockfish</div>
          </div>
        </div>

        <div className="board-area">
          <aside className="eval-bar" aria-label="Evaluation bar">
            <div className="eval-bar-black" />
            <div className="eval-bar-white" />
            <span className="eval-score eval-score-top">+0.0</span>
            <span className="eval-score eval-score-bottom">0.0</span>
          </aside>

          <div className="board-frame">
            <div className="board-grid">
              {squares.map((square) => {
              const piece = board[square.row][square.col]
              const currentSquare = squareAt(square.row, square.col)
              const isSelected = state.selectedSquare === currentSquare
              const isLegalMove = state.legalMoves.includes(currentSquare)
              const isLastMove =
                state.lastMove?.from === currentSquare ||
                state.lastMove?.to === currentSquare
              const isDropTarget = dragState?.hoverSquare === currentSquare
              const isDraggingSource = dragState?.fromSquare === currentSquare
              const isCheckedKing =
                piece?.type === 'k' && piece.color === state.inCheckColor
              const showRank = square.col === 0
              const showFile = square.row === 7

                return (
                  <button
                    key={square.id}
                    className={[
                      'square',
                      square.isDark ? 'dark' : 'light',
                      isLastMove ? 'last-move' : '',
                      isSelected ? 'selected' : '',
                      isLegalMove ? 'legal' : '',
                      isDropTarget ? 'drop-target' : '',
                    ]
                      .join(' ')
                      .trim()}
                    type="button"
                    data-square={currentSquare}
                    onPointerDown={(event) => {
                      if (isGameOver || !piece || piece.color !== state.turn) {
                        return
                      }

                      event.preventDefault()
                      dispatch({ type: 'SELECT_SQUARE', square: currentSquare })

                      const rect = event.currentTarget.getBoundingClientRect()
                      setDragState({
                        fromSquare: currentSquare,
                        piece,
                        pointerX: event.clientX,
                        pointerY: event.clientY,
                        hoverSquare: currentSquare,
                        cellSize: rect.width,
                        legalMoves: getLegalMovesForSquare(state.fen, currentSquare),
                      })
                    }}
                    onClick={() => {
                      if (suppressNextClickRef.current) {
                        suppressNextClickRef.current = false
                        return
                      }
                      if (isGameOver) {
                        return
                      }

                      dispatch({ type: 'CLICK_SQUARE', square: currentSquare })
                    }}
                  >
                    {piece && !isDraggingSource ? (
                      <img
                        className={`piece${isCheckedKing ? ' king-in-check' : ''}`}
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
                  </button>
                )
              })}
            </div>

            {dragState ? (
              <img
                className="piece piece-dragging"
                src={pieceToAsset(dragState.piece)}
                alt={pieceLabel(dragState.piece)}
                style={{
                  width: dragState.cellSize,
                  height: dragState.cellSize,
                  left: dragState.pointerX - dragState.cellSize / 2,
                  top: dragState.pointerY - dragState.cellSize / 2,
                }}
              />
            ) : null}
          </div>
        </div>

        <div className="player-row">
          <div className="avatar user" />
          <div>
            <div className="player-name">{userPrefix}You</div>
            <div className="player-sub">Player</div>
          </div>
        </div>
      </section>

      <aside className="play-right">
        <header className="panel-header panel-span-2">
          <h2>Play Chess</h2>
        </header>

        <div className="info-card move-list-card panel-left">
          <div className="move-list-header">
            <h3>
              {openingLoadError
                ? openingLoadError
                : !openings
                  ? 'Loading opening database...'
                  : detectedOpening
                    ? `${detectedOpening.name} (${detectedOpening.eco})`
                    : openingLookupAttempted
                      ? 'Opening not identified yet'
                      : 'Detecting opening...'}
            </h3>
            <button
              className="opening-book-button"
              type="button"
              disabled={!detectedOpening}
              onClick={() => {
                if (!detectedOpening) {
                  return
                }
                navigate(`/openings/${detectedOpening.eco}`, {
                  state: {
                    opening: detectedOpening,
                    fen: state.fen,
                  },
                })
              }}
              title="Open opening details"
              aria-label="Open opening details"
            >
              📖
            </button>
          </div>

          {detectedOpening ? (
            <p className="opening-moves">{detectedOpening.moves}</p>
          ) : null}

          <div className="moves-table" role="table" aria-label="Move list">
            {moveRows.length === 0 ? (
              <div className="moves-empty">No moves yet</div>
            ) : (
              moveRows.map((row) => (
                <div className="move-row" role="row" key={row.moveNumber}>
                  <div className="move-number" role="cell">
                    {row.moveNumber}.
                  </div>
                  <div
                    className={`move-cell${
                      row.whiteIndex === lastMoveIndex ? ' move-cell-last' : ''
                    }`}
                    role="cell"
                  >
                    {row.white ? formatSanWithSymbols(row.white.san) : ''}
                  </div>
                  <div
                    className={`move-cell${
                      row.blackIndex === lastMoveIndex ? ' move-cell-last' : ''
                    }`}
                    role="cell"
                  >
                    {row.black ? formatSanWithSymbols(row.black.san) : ''}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="info-card panel-right">
          <h3>Bot Rating</h3>
          <p>Selected difficulty and engine strength.</p>
        </div>
        <div className="info-card panel-right">
          <h3>Live ELO</h3>
          <p>Estimated rating based on current play.</p>
        </div>
        <div className="info-card panel-right">
          <h3>Analysis</h3>
          <p>Stockfish evaluation and best lines.</p>
        </div>
        <div className="info-card panel-right">
          <h3>Game Plan</h3>
          <p>Use opening ideas and keep pieces active toward the center.</p>
        </div>
        <button
          className="primary replay-button panel-span-2"
          type="button"
          onClick={() => dispatch({ type: 'RESET' })}
        >
          Replay
        </button>
      </aside>
    </main>
  )
}
