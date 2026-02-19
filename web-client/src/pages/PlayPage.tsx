import {
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ChangeEvent,
} from 'react'
import { useNavigate } from 'react-router-dom'
import { Chess } from 'chess.js'
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
import { buildCaptureSummary } from '../chess/captures'
import { useStockfish } from '../engine/useStockfish'
import type { Piece } from '../chess/types'
import type { PieceType } from '../chess/types'
import { parseFEN } from '../chess/fen'

const fileLabels = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
const rankLabels = ['8', '7', '6', '5', '4', '3', '2', '1']

const SAN_SYMBOLS: Record<string, string> = {
  K: '♔',
  Q: '♕',
  R: '♖',
  B: '♗',
  N: '♘',
}

const CAPTURE_SYMBOLS: Record<'w' | 'b', Record<PieceType, string>> = {
  w: { p: '♙', n: '♘', b: '♗', r: '♖', q: '♕', k: '♔' },
  b: { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚' },
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

function renderSanWithEmphasizedSymbols(san: string) {
  const text = formatSanWithSymbols(san)
  return text.split(/([♔♕♖♗♘])/g).map((part, index) => {
    if (/[♔♕♖♗♘]/.test(part)) {
      return (
        <span key={`${part}-${index}`} className="san-symbol">
          {part}
        </span>
      )
    }
    return <span key={`${part}-${index}`}>{part}</span>
  })
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

function buildPlayedMovesFromVerboseHistory(
  verboseMoves: Array<{
    from: string
    to: string
    san: string
    color: 'w' | 'b'
    promotion?: string
  }>,
): PlayedMove[] {
  return verboseMoves.map((move) => ({
    from: move.from,
    to: move.to,
    san: move.san,
    color: move.color,
  }))
}

function renderCapturedPieces(pieces: PieceType[], pieceColor: 'w' | 'b') {
  if (pieces.length === 0) {
    return <span className="captures-empty">--</span>
  }

  return pieces.map((piece, index) => (
    <span key={`${piece}-${index}`} className="capture-piece">
      {CAPTURE_SYMBOLS[pieceColor][piece]}
    </span>
  ))
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
  const [opponentElo, setOpponentElo] = useState(1600)
  const [coachMode, setCoachMode] = useState(true)
  const [blunderAlerts, setBlunderAlerts] = useState(true)
  const [pgnInput, setPgnInput] = useState('')
  const [pgnError, setPgnError] = useState<string | null>(null)
  const [pgnMoveHistory, setPgnMoveHistory] = useState<PlayedMove[] | null>(null)
  const [pgnFens, setPgnFens] = useState<string[] | null>(null)
  const [pgnPlyIndex, setPgnPlyIndex] = useState(0)
  const [isPgnAutoplay, setIsPgnAutoplay] = useState(false)
  const dragStateRef = useRef<DragState | null>(null)
  const suppressNextClickRef = useRef(false)
  const isGameOver = state.status === 'checkmate' || state.status === 'draw'
  const { ready, evaluation, analyzeFen, toWhiteRatio, formatEvalValue } =
    useStockfish()

  const isPgnMode = Boolean(pgnFens && pgnMoveHistory)
  const activeFen = isPgnMode ? pgnFens![pgnPlyIndex] : state.fen
  const activeTurn = (activeFen.split(' ')[1] as 'w' | 'b') || state.turn
  const board = isPgnMode ? parseFEN(activeFen) : state.board
  const activeHistory = isPgnMode
    ? pgnMoveHistory!.slice(0, pgnPlyIndex)
    : state.moveHistory
  const hasPlayedMoves = activeHistory.length > 0
  const moveRows = useMemo(() => buildMoveRows(activeHistory), [activeHistory])
  const captures = useMemo(
    () => buildCaptureSummary(activeHistory),
    [activeHistory],
  )
  const lastMoveIndex = activeHistory.length - 1
  const activeLastMove = hasPlayedMoves ? activeHistory[lastMoveIndex] : null
  const maxPly = pgnMoveHistory?.length ?? 0
  const canStepBackward = isPgnMode && pgnPlyIndex > 0
  const canStepForward = isPgnMode && pgnPlyIndex < maxPly
  const whiteRatio = toWhiteRatio(evaluation.cpWhite, evaluation.mateWhite)
  const blackRatio = 1 - whiteRatio
  const whiteEvalLabel = formatEvalValue(evaluation.cpWhite, evaluation.mateWhite)
  const blackEvalLabel = formatEvalValue(
    evaluation.cpWhite !== null ? -evaluation.cpWhite : null,
    evaluation.mateWhite !== null ? -evaluation.mateWhite : null,
  )
  const principalVariation =
    evaluation.pv.length > 0 ? evaluation.pv.slice(0, 7).join(' ') : '--'
  const bestMoveText = evaluation.bestMove ?? '--'
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
    if (!openings || !positionBook || openingLookupStopped || !hasPlayedMoves) {
      return
    }

    const opening = findOpening(openings, activeFen, positionBook)
    if (opening) {
      setDetectedOpening(opening)
      return
    }

    // Freeze further lookups on first miss and keep last known opening.
    setOpeningLookupStopped(true)
  }, [openings, positionBook, activeFen, openingLookupStopped, hasPlayedMoves])

  useEffect(() => {
    analyzeFen(activeFen, activeTurn)
  }, [analyzeFen, activeFen, activeTurn])

  useEffect(() => {
    if (!isPgnAutoplay || !isPgnMode) {
      return
    }

    const timer = window.setInterval(() => {
      setPgnPlyIndex((current) => {
        const next = Math.min(current + 1, maxPly)
        if (next >= maxPly) {
          setIsPgnAutoplay(false)
        }
        return next
      })
    }, 650)

    return () => window.clearInterval(timer)
  }, [isPgnAutoplay, isPgnMode, maxPly])

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

  const loadPgn = (rawPgn: string) => {
    const normalized = rawPgn.trim()
    if (!normalized) {
      setPgnError('Paste or upload a PGN first.')
      return
    }

    try {
      const chess = new Chess()
      chess.loadPgn(normalized)

      const verbose = chess.history({ verbose: true })
      const moves = buildPlayedMovesFromVerboseHistory(verbose)
      const replay = new Chess()
      const fens = [replay.fen()]
      verbose.forEach((move) => {
        replay.move({
          from: move.from,
          to: move.to,
          promotion: move.promotion,
        })
        fens.push(replay.fen())
      })

      setPgnMoveHistory(moves)
      setPgnFens(fens)
      setPgnPlyIndex(moves.length)
      setPgnError(null)
      setIsPgnAutoplay(false)
    } catch {
      setPgnError('Invalid PGN format.')
    }
  }

  const clearPgnMode = () => {
    setPgnMoveHistory(null)
    setPgnFens(null)
    setPgnPlyIndex(0)
    setPgnError(null)
    setIsPgnAutoplay(false)
  }

  const handlePgnUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    try {
      const text = await file.text()
      setPgnInput(text)
      loadPgn(text)
    } catch {
      setPgnError('Could not read PGN file.')
    } finally {
      event.target.value = ''
    }
  }

  return (
    <main className="page play-page">
      <section className="play-left">
        <div className="player-row">
          <div className="avatar" />
          <div className="player-meta">
            <div className="player-name">{opponentPrefix}Opponent</div>
            <div className="player-sub">AI · Stockfish</div>
          </div>
          <div className="captures-row">
            {renderCapturedPieces(captures.byColor.b, 'w')}
            {captures.advantage.b > 0 ? (
              <span className="captures-advantage">+{captures.advantage.b}</span>
            ) : null}
          </div>
        </div>

        <div className="board-area">
          <aside className="eval-bar" aria-label="Evaluation bar">
            <div
              className="eval-bar-black"
              style={{ height: `${blackRatio * 100}%` }}
            />
            <div
              className="eval-bar-white"
              style={{ height: `${whiteRatio * 100}%` }}
            />
            <span className="eval-score eval-score-top">{blackEvalLabel}</span>
            <span className="eval-score eval-score-bottom">{whiteEvalLabel}</span>
            <span className="eval-ready-dot" aria-hidden="true">
              {ready ? '●' : '○'}
            </span>
          </aside>

          <div className="board-frame">
            <div className="board-grid">
              {squares.map((square) => {
                const piece = board[square.row][square.col]
                const currentSquare = squareAt(square.row, square.col)
                const isSelected = state.selectedSquare === currentSquare
                const isLegalMove = state.legalMoves.includes(currentSquare)
                const isLastMove =
                  activeLastMove?.from === currentSquare ||
                  activeLastMove?.to === currentSquare
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
                      if (
                        isGameOver ||
                        isPgnMode ||
                        !piece ||
                        piece.color !== state.turn
                      ) {
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
                      if (isGameOver || isPgnMode) {
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
          <div className="player-meta">
            <div className="player-name">{userPrefix}You</div>
            <div className="player-sub">Player</div>
          </div>
          <div className="captures-row">
            {renderCapturedPieces(captures.byColor.w, 'b')}
            {captures.advantage.w > 0 ? (
              <span className="captures-advantage">+{captures.advantage.w}</span>
            ) : null}
          </div>
        </div>
      </section>

      <aside className="play-right">
        <header className="dashboard-top">
          <h2 className="brand-title">ChessOS</h2>
          <p className="brand-subtitle">Play, analyze, improve</p>
          <div className="top-actions">
            <button className="action-button" type="button">
              Exit
            </button>
            <button className="action-button" type="button">
              Copy PGN
            </button>
          </div>
        </header>

        <div className="info-card move-list-card panel-moves">
          <div className="move-list-header">
            <h3>
              {openingLoadError
                ? openingLoadError
                : !openings
                  ? 'Loading opening database...'
                  : detectedOpening
                    ? `${detectedOpening.name} (${detectedOpening.eco})`
                    : 'Opening'}
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
                    fen: activeFen,
                  },
                })
              }}
              title="Open opening details"
              aria-label="Open opening details"
            >
              📖
            </button>
          </div>

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
                    {row.white ? renderSanWithEmphasizedSymbols(row.white.san) : ''}
                  </div>
                  <div
                    className={`move-cell${
                      row.blackIndex === lastMoveIndex ? ' move-cell-last' : ''
                    }`}
                    role="cell"
                  >
                    {row.black ? renderSanWithEmphasizedSymbols(row.black.san) : ''}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="info-card panel-pgn">
          <div className="panel-pgn-header">
            <h3>PGN</h3>
            {isPgnMode ? (
              <button
                className="action-button action-button-subtle"
                type="button"
                onClick={clearPgnMode}
              >
                Exit Review
              </button>
            ) : null}
          </div>
          <label className="pgn-upload">
            <span>Upload PGN File</span>
            <input type="file" accept=".pgn,text/plain" onChange={handlePgnUpload} />
          </label>
          <textarea
            className="pgn-textarea"
            value={pgnInput}
            onChange={(event) => setPgnInput(event.target.value)}
            placeholder='Paste PGN here, e.g. 1. e4 e5 2. Nf3 Nc6'
          />
          <div className="pgn-actions">
            <button
              className="action-button action-button-primary"
              type="button"
              onClick={() => loadPgn(pgnInput)}
            >
              Load PGN
            </button>
            <button
              className="action-button"
              type="button"
              onClick={() => {
                setPgnInput('')
                clearPgnMode()
              }}
            >
              Clear
            </button>
          </div>
          {pgnError ? <p className="pgn-error">{pgnError}</p> : null}
        </div>

        <div className="info-card panel-engine">
          <h3>Engine</h3>
          <p>Evaluation: {whiteEvalLabel}</p>
          <p>Depth: {evaluation.depth ?? '--'}</p>
          <p>Best move: {bestMoveText}</p>
          <p className="pv-line">PV: {principalVariation}</p>
        </div>

        <div className="info-card panel-strength">
          <h3>Opponent Strength</h3>
          <input
            className="elo-slider"
            type="range"
            min="800"
            max="2800"
            value={opponentElo}
            step="50"
            onChange={(event) => setOpponentElo(Number(event.target.value))}
          />
          <p>ELO: {opponentElo}</p>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={coachMode}
              onChange={(event) => setCoachMode(event.target.checked)}
            />
            Coach hints
          </label>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={blunderAlerts}
              onChange={(event) => setBlunderAlerts(event.target.checked)}
            />
            Blunder alerts
          </label>
        </div>

        <div className="action-row panel-actions">
          <div className="move-nav">
            <button
              className="arrow-button"
              type="button"
              disabled={!isPgnMode || pgnPlyIndex <= 0}
              onClick={() => {
                setIsPgnAutoplay(false)
                setPgnPlyIndex(0)
              }}
              title="Start"
            >
              |&lt;
            </button>
            <button
              className="arrow-button"
              type="button"
              disabled={!canStepBackward}
              onClick={() => {
                setIsPgnAutoplay(false)
                setPgnPlyIndex((current) => Math.max(0, current - 1))
              }}
              title="Previous"
            >
              &lt;
            </button>
            <button
              className="arrow-button"
              type="button"
              disabled={!isPgnMode || maxPly <= 0}
              onClick={() => setIsPgnAutoplay((current) => !current)}
              title={isPgnAutoplay ? 'Pause' : 'Play'}
            >
              {isPgnAutoplay ? '⏸' : '▶'}
            </button>
            <button
              className="arrow-button"
              type="button"
              disabled={!canStepForward}
              onClick={() => {
                setIsPgnAutoplay(false)
                setPgnPlyIndex((current) => Math.min(maxPly, current + 1))
              }}
              title="Next"
            >
              &gt;
            </button>
            <button
              className="arrow-button"
              type="button"
              disabled={!isPgnMode || pgnPlyIndex >= maxPly}
              onClick={() => {
                setIsPgnAutoplay(false)
                setPgnPlyIndex(maxPly)
              }}
              title="End"
            >
              &gt;|
            </button>
          </div>
          <button
            className="action-button action-button-primary"
            type="button"
            onClick={() => {
              clearPgnMode()
              dispatch({ type: 'RESET' })
            }}
          >
            Replay
          </button>
        </div>
      </aside>
    </main>
  )
}
