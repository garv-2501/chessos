import {
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type MutableRefObject,
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
import { useStockfishBot } from '../engine/useStockfishBot'
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

type MoveRank =
  | 'Best Move'
  | 'Book Move'
  | 'Excellent'
  | 'Good Move'
  | 'Inaccuracy'
  | 'Mistake'
  | 'Blunder'

type MoveRankBadge = {
  code: string
  label: string
}

type ParsedPgn = {
  normalized: string
  moves: PlayedMove[]
  fens: string[]
}

type PositionAnalysis = {
  fen: string
  cpWhite: number | null
  mateWhite: number | null
  best: string | null
  second: string | null
}

type MoveEvaluation = {
  ply: number
  color: 'w' | 'b'
  san: string
  rank: MoveRank
  cpLoss: number | null
}

type AccuracyScore = {
  white: number
  black: number
}

type AnalysisResult = {
  positions: PositionAnalysis[]
  moveEvaluations: MoveEvaluation[]
  accuracy: AccuracyScore
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

function uciToArrowEndpoints(uci: string): {
  fromX: number
  fromY: number
  toX: number
  toY: number
} | null {
  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) {
    return null
  }

  const fromFile = uci.charCodeAt(0) - 97
  const fromRank = Number(uci[1])
  const toFile = uci.charCodeAt(2) - 97
  const toRank = Number(uci[3])
  const fromRow = 8 - fromRank
  const toRow = 8 - toRank

  return {
    fromX: (fromFile + 0.5) * 12.5,
    fromY: (fromRow + 0.5) * 12.5,
    toX: (toFile + 0.5) * 12.5,
    toY: (toRow + 0.5) * 12.5,
  }
}

function buildArrowShape(endpoints: {
  fromX: number
  fromY: number
  toX: number
  toY: number
}): { d: string } | null {
  const dx = endpoints.toX - endpoints.fromX
  const dy = endpoints.toY - endpoints.fromY
  const length = Math.hypot(dx, dy)
  if (length < 0.01) {
    return null
  }

  const ux = dx / length
  const uy = dy / length
  const nx = -uy
  const ny = ux

  const tailHalfWidth = 1.15
  const headHalfWidth = 2.85
  const headLength = Math.min(4.8, length * 0.45)
  const shaftEndX = endpoints.toX - ux * headLength
  const shaftEndY = endpoints.toY - uy * headLength

  const p1x = endpoints.fromX + nx * tailHalfWidth
  const p1y = endpoints.fromY + ny * tailHalfWidth
  const p2x = shaftEndX + nx * tailHalfWidth
  const p2y = shaftEndY + ny * tailHalfWidth
  const p3x = shaftEndX + nx * headHalfWidth
  const p3y = shaftEndY + ny * headHalfWidth
  const p4x = shaftEndX - nx * headHalfWidth
  const p4y = shaftEndY - ny * headHalfWidth
  const p5x = shaftEndX - nx * tailHalfWidth
  const p5y = shaftEndY - ny * tailHalfWidth
  const p6x = endpoints.fromX - nx * tailHalfWidth
  const p6y = endpoints.fromY - ny * tailHalfWidth

  const d = [
    `M ${p1x.toFixed(2)} ${p1y.toFixed(2)}`,
    `L ${p2x.toFixed(2)} ${p2y.toFixed(2)}`,
    `L ${p3x.toFixed(2)} ${p3y.toFixed(2)}`,
    `L ${endpoints.toX.toFixed(2)} ${endpoints.toY.toFixed(2)}`,
    `L ${p4x.toFixed(2)} ${p4y.toFixed(2)}`,
    `L ${p5x.toFixed(2)} ${p5y.toFixed(2)}`,
    `L ${p6x.toFixed(2)} ${p6y.toFixed(2)}`,
    'Z',
  ].join(' ')

  return { d }
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

function uciToMoveObject(uci: string): { from: string; to: string; promotion?: string } | null {
  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) {
    return null
  }

  return {
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    promotion: uci.length > 4 ? uci[4] : undefined,
  }
}

function parsePromotionFromSan(san: string): 'q' | 'r' | 'b' | 'n' | undefined {
  const match = san.match(/=([QRBN])/)
  if (!match) {
    return undefined
  }

  return match[1].toLowerCase() as 'q' | 'r' | 'b' | 'n'
}

function getFenBeforeLastMove(history: PlayedMove[]): string | null {
  if (history.length === 0) {
    return null
  }

  const chess = new Chess()
  for (let index = 0; index < history.length - 1; index += 1) {
    const move = history[index]
    const result = chess.move({
      from: move.from,
      to: move.to,
      promotion: parsePromotionFromSan(move.san),
    })
    if (!result) {
      return null
    }
  }

  return chess.fen()
}

function formatPrincipalVariationForDisplay(fen: string, pv: string[]): string {
  if (pv.length === 0) {
    return '--'
  }

  try {
    const chess = new Chess(fen)
    const maxPlies = Math.min(6, pv.length)
    const sanMoves: string[] = []

    for (let i = 0; i < maxPlies; i += 1) {
      const move = uciToMoveObject(pv[i])
      if (!move) {
        break
      }
      const result = chess.move(move)
      if (!result) {
        break
      }
      sanMoves.push(result.san)
    }

    if (sanMoves.length === 0) {
      return '--'
    }

    return sanMoves
      .map((san, index) => {
        const moveNumber = Math.floor(index / 2) + 1
        if (index % 2 === 0) {
          return `${moveNumber}. ${san}`
        }
        return san
      })
      .join(' ')
  } catch {
    return '--'
  }
}

function getMoveRankBadge(
  moveRank: MoveRank | null,
): MoveRankBadge | null {
  if (!moveRank) {
    return null
  }

  const map: Record<MoveRank, MoveRankBadge> = {
    'Book Move': { code: 'BK', label: 'Book Move' },
    'Best Move': { code: '★', label: 'Best Move' },
    Excellent: { code: '!!', label: 'Excellent' },
    'Good Move': { code: '✓', label: 'Good Move' },
    Inaccuracy: { code: '?!', label: 'Inaccuracy' },
    Mistake: { code: '?', label: 'Mistake' },
    Blunder: { code: '??', label: 'Blunder' },
  }

  return map[moveRank]
}

type CachedPositionAnalysis = {
  best: string | null
  second: string | null
  cpWhite: number | null
}

function getCpSwing(
  mover: 'w' | 'b',
  beforeCpWhite: number | null,
  afterCpWhite: number | null,
): number | null {
  if (beforeCpWhite === null || afterCpWhite === null) {
    return null
  }

  return mover === 'w'
    ? beforeCpWhite - afterCpWhite
    : afterCpWhite - beforeCpWhite
}

function classifyMoveBySwing(cpSwing: number | null): MoveRank {
  if (cpSwing === null) {
    return 'Good Move'
  }

  if (cpSwing >= 240) {
    return 'Blunder'
  }
  if (cpSwing >= 130) {
    return 'Mistake'
  }
  if (cpSwing >= 70) {
    return 'Inaccuracy'
  }
  if (cpSwing <= 20) {
    return 'Excellent'
  }

  return 'Good Move'
}

function parsePgn(rawPgn: string): ParsedPgn {
  const normalized = rawPgn.trim()
  if (!normalized) {
    throw new Error('empty_pgn')
  }

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

  return { normalized, moves, fens }
}

function uciToWhiteCp(
  fen: string,
  cp: number | null,
  mate: number | null,
): { cpWhite: number | null; mateWhite: number | null } {
  const turn = fen.split(' ')[1] === 'b' ? 'b' : 'w'
  const cpWhite = cp === null ? null : turn === 'w' ? cp : -cp
  const mateWhite = mate === null ? null : turn === 'w' ? mate : -mate

  return { cpWhite, mateWhite }
}

async function analyzePositionList(
  fens: string[],
  shouldAbort: () => boolean,
  onProgress: (done: number, total: number) => void,
): Promise<PositionAnalysis[]> {
  const worker = new Worker(
    new URL('../../node_modules/stockfish/bin/stockfish-18-lite-single.js', import.meta.url),
    { type: 'classic' },
  )

  const post = (message: string) => worker.postMessage(message)
  const waitReady = () =>
    new Promise<void>((resolve) => {
      const onMessage = (event: MessageEvent<string>) => {
        if (String(event.data ?? '').trim() === 'readyok') {
          worker.removeEventListener('message', onMessage)
          resolve()
        }
      }
      worker.addEventListener('message', onMessage)
      post('isready')
    })

  const analyzeOne = (fen: string) =>
    new Promise<PositionAnalysis>((resolve) => {
      let best: string | null = null
      let second: string | null = null
      let cp: number | null = null
      let mate: number | null = null
      let bestDepth = -1
      let secondDepth = -1

      const onMessage = (event: MessageEvent<string>) => {
        const line = String(event.data ?? '').trim()
        if (!line) {
          return
        }

        if (line.startsWith('info ') && line.includes(' score ')) {
          const depth = Number(line.match(/\bdepth\s+(\d+)/)?.[1] ?? '0')
          const multiPv = Number(line.match(/\bmultipv\s+(\d+)/)?.[1] ?? '1')
          const cpMatch = line.match(/\bscore\s+cp\s+(-?\d+)/)
          const mateMatch = line.match(/\bscore\s+mate\s+(-?\d+)/)
          const pvHead = line.match(/\bpv\s+([a-h][1-8][a-h][1-8][qrbn]?)/)?.[1]

          if (multiPv === 1 && depth >= bestDepth) {
            bestDepth = depth
            cp = cpMatch ? Number(cpMatch[1]) : null
            mate = mateMatch ? Number(mateMatch[1]) : null
            if (pvHead) {
              best = pvHead
            }
          }

          if (multiPv === 2 && depth >= secondDepth) {
            secondDepth = depth
            if (pvHead) {
              second = pvHead
            }
          }
          return
        }

        if (line.startsWith('bestmove ')) {
          const bestmove = line.split(/\s+/)[1]
          if (bestmove && bestmove !== '(none)') {
            best = best ?? bestmove
          }
          worker.removeEventListener('message', onMessage)
          const perspective = uciToWhiteCp(fen, cp, mate)
          resolve({
            fen,
            cpWhite: perspective.cpWhite,
            mateWhite: perspective.mateWhite,
            best,
            second,
          })
        }
      }

      worker.addEventListener('message', onMessage)
      post('stop')
      post(`position fen ${fen}`)
      post('go movetime 180')
    })

  try {
    post('uci')
    post('setoption name Threads value 1')
    post('setoption name Hash value 16')
    post('setoption name MultiPV value 2')
    post('ucinewgame')
    await waitReady()

    const result: PositionAnalysis[] = []
    for (let index = 0; index < fens.length; index += 1) {
      if (shouldAbort()) {
        throw new Error('analysis_aborted')
      }
      const analysis = await analyzeOne(fens[index])
      result.push(analysis)
      onProgress(index + 1, fens.length)
    }

    return result
  } finally {
    post('quit')
    worker.terminate()
  }
}

function classifyMove(
  index: number,
  move: PlayedMove,
  before: PositionAnalysis,
  after: PositionAnalysis,
  openings: OpeningCollection | null,
  positionBook: PositionBook | null,
): MoveEvaluation {
  const moveUci = `${move.from}${move.to}`
  const cpSwing = getCpSwing(move.color, before.cpWhite, after.cpWhite)
  const cpLoss = cpSwing === null ? null : Math.max(0, cpSwing)
  const openingAtMove =
    openings && positionBook && index < 20
      ? findOpening(openings, after.fen, positionBook)
      : undefined

  let rank: MoveRank
  if (openingAtMove) {
    rank = 'Book Move'
  } else if (before.best && moveUci === before.best) {
    rank = 'Best Move'
  } else if (before.second && moveUci === before.second) {
    rank = 'Excellent'
  } else {
    rank = classifyMoveBySwing(cpLoss)
  }

  return {
    ply: index + 1,
    color: move.color,
    san: move.san,
    rank,
    cpLoss,
  }
}

function computeAccuracy(moveEvaluations: MoveEvaluation[]): AccuracyScore {
  const byColor: Record<'w' | 'b', number[]> = { w: [], b: [] }

  moveEvaluations.forEach((evaluation) => {
    byColor[evaluation.color].push(evaluation.cpLoss ?? 0)
  })

  const toAccuracy = (losses: number[]) => {
    if (losses.length === 0) {
      return 100
    }
    const avgLoss = losses.reduce((sum, value) => sum + value, 0) / losses.length
    return Math.max(0, Math.min(100, 100 - avgLoss * 0.12))
  }

  return {
    white: Number(toAccuracy(byColor.w).toFixed(1)),
    black: Number(toAccuracy(byColor.b).toFixed(1)),
  }
}

function buildEvalGraphPath(positions: PositionAnalysis[]): string {
  if (positions.length === 0) {
    return ''
  }

  const clamp = (value: number, min: number, max: number) =>
    Math.max(min, Math.min(max, value))
  const points = positions.map((position, index) => {
    const x = positions.length === 1 ? 0 : (index / (positions.length - 1)) * 100
    const cp = clamp(position.cpWhite ?? 0, -500, 500)
    const y = 50 - (cp / 500) * 44
    return `${x.toFixed(2)},${y.toFixed(2)}`
  })

  return `M ${points.join(' L ')}`
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
  const [stockfishLevel, setStockfishLevel] = useState(10)
  const [showBestMoveArrow, setShowBestMoveArrow] = useState(true)
  const [showSecondBestArrow, setShowSecondBestArrow] = useState(true)
  const [showOpponentArrows, setShowOpponentArrows] = useState(false)
  const [showMoveRankInsight, setShowMoveRankInsight] = useState(true)
  const [showPvInsight, setShowPvInsight] = useState(false)
  const [pgnInput, setPgnInput] = useState('')
  const [pgnError, setPgnError] = useState<string | null>(null)
  const [pgnMoveHistory, setPgnMoveHistory] = useState<PlayedMove[] | null>(null)
  const [pgnFens, setPgnFens] = useState<string[] | null>(null)
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null)
  const [analysisProgress, setAnalysisProgress] = useState<{
    done: number
    total: number
  } | null>(null)
  const [isAnalyzingPgn, setIsAnalyzingPgn] = useState(false)
  const [pgnPlyIndex, setPgnPlyIndex] = useState(0)
  const [isPgnAutoplay, setIsPgnAutoplay] = useState(false)
  const dragStateRef = useRef<DragState | null>(null)
  const analysisCacheRef: MutableRefObject<Record<string, CachedPositionAnalysis>> =
    useRef({})
  const analysisSessionRef = useRef(0)
  const analysisResultCacheRef = useRef<Record<string, AnalysisResult>>({})
  const suppressNextClickRef = useRef(false)
  const [isBotThinking, setIsBotThinking] = useState(false)
  const isGameOver = state.status === 'checkmate' || state.status === 'draw'
  const { ready: analysisReady, evaluation, analyzeFen, toWhiteRatio, formatEvalValue } =
    useStockfish()
  const { ready: botReady, getBestMove, stop: stopBot } =
    useStockfishBot(stockfishLevel)

  const isPgnMode = Boolean(pgnFens && pgnMoveHistory)
  const isPgnAnalysisMode = isPgnMode && Boolean(analysisResult)
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
  const isUserTurn = !isPgnMode && !isGameOver && state.turn === 'w'
  const isBotTurn = !isPgnMode && !isGameOver && state.turn === 'b'
  const whiteRatio = toWhiteRatio(evaluation.cpWhite, evaluation.mateWhite)
  const blackRatio = 1 - whiteRatio
  const whiteEvalLabel = formatEvalValue(evaluation.cpWhite, evaluation.mateWhite)
  const blackEvalLabel = formatEvalValue(
    evaluation.cpWhite !== null ? -evaluation.cpWhite : null,
    evaluation.mateWhite !== null ? -evaluation.mateWhite : null,
  )
  const principalVariationDisplay = useMemo(
    () => formatPrincipalVariationForDisplay(activeFen, evaluation.pv),
    [activeFen, evaluation.pv],
  )
  const bestMoveText = evaluation.bestMove ?? '--'
  const secondBestMoveText = evaluation.secondBestMove ?? '--'
  const bestMoveArrow = useMemo(
    () => (evaluation.bestMove ? uciToArrowEndpoints(evaluation.bestMove) : null),
    [evaluation.bestMove],
  )
  const secondBestMoveArrow = useMemo(
    () =>
      evaluation.secondBestMove
        ? uciToArrowEndpoints(evaluation.secondBestMove)
        : null,
    [evaluation.secondBestMove],
  )
  const bestMoveArrowShape = useMemo(
    () => (bestMoveArrow ? buildArrowShape(bestMoveArrow) : null),
    [bestMoveArrow],
  )
  const secondBestMoveArrowShape = useMemo(
    () => (secondBestMoveArrow ? buildArrowShape(secondBestMoveArrow) : null),
    [secondBestMoveArrow],
  )
  const shouldRenderArrowsForTurn = activeTurn === 'w' || showOpponentArrows
  const lastMoveUci = activeLastMove
    ? `${activeLastMove.from}${activeLastMove.to}`
    : null
  if (evaluation.bestMove) {
    analysisCacheRef.current[activeFen] = {
      best: evaluation.bestMove,
      second: evaluation.secondBestMove,
      cpWhite: evaluation.cpWhite,
    }
  }
  const fenBeforeLastMove = useMemo(
    () => getFenBeforeLastMove(activeHistory),
    [activeHistory],
  )
  const previousPositionAnalysis =
    fenBeforeLastMove ? analysisCacheRef.current[fenBeforeLastMove] : undefined
  const moveRank: MoveRank | null = useMemo(() => {
    if (!activeLastMove) {
      return null
    }

    if (
      lastMoveUci &&
      previousPositionAnalysis?.best &&
      lastMoveUci === previousPositionAnalysis.best
    ) {
      return 'Best Move'
    }

    if (
      lastMoveUci &&
      previousPositionAnalysis?.second &&
      lastMoveUci === previousPositionAnalysis.second
    ) {
      return 'Excellent'
    }

    if (!openingLookupStopped && detectedOpening && !isPgnMode) {
      return 'Book Move'
    }

    const cpSwing = getCpSwing(
      activeLastMove.color,
      previousPositionAnalysis?.cpWhite ?? null,
      evaluation.cpWhite,
    )

    return classifyMoveBySwing(cpSwing)
  }, [
    activeLastMove,
    detectedOpening,
    evaluation.cpWhite,
    isPgnMode,
    lastMoveUci,
    openingLookupStopped,
    previousPositionAnalysis,
  ])
  const moveRankBadge = useMemo(() => getMoveRankBadge(moveRank), [moveRank])
  const currentAnalyzedMove =
    analysisResult && pgnPlyIndex > 0
      ? analysisResult.moveEvaluations[pgnPlyIndex - 1] ?? null
      : null
  const currentAnalyzedMoveBadge = useMemo(
    () => getMoveRankBadge(currentAnalyzedMove?.rank ?? null),
    [currentAnalyzedMove],
  )
  const activeMoveRankBadge = isPgnAnalysisMode
    ? currentAnalyzedMoveBadge
    : moveRankBadge
  const analysisMoveRows = useMemo(() => {
    if (!analysisResult || !pgnMoveHistory) {
      return []
    }

    const rows: Array<{
      moveNumber: number
      white: MoveEvaluation | null
      black: MoveEvaluation | null
      whiteIndex: number
      blackIndex: number
    }> = []

    for (let index = 0; index < pgnMoveHistory.length; index += 2) {
      rows.push({
        moveNumber: index / 2 + 1,
        white: analysisResult.moveEvaluations[index] ?? null,
        black: analysisResult.moveEvaluations[index + 1] ?? null,
        whiteIndex: index,
        blackIndex: index + 1,
      })
    }

    return rows
  }, [analysisResult, pgnMoveHistory])
  const analysisGraphPath = useMemo(
    () => (analysisResult ? buildEvalGraphPath(analysisResult.positions) : ''),
    [analysisResult],
  )
  const analysisGraphPoints = useMemo(() => {
    if (!analysisResult || analysisResult.positions.length <= 1) {
      return []
    }

    const clamp = (value: number, min: number, max: number) =>
      Math.max(min, Math.min(max, value))

    return analysisResult.moveEvaluations.map((evaluation, index) => {
      const position = analysisResult.positions[index + 1]
      const x = ((index + 1) / (analysisResult.positions.length - 1)) * 100
      const cp = clamp(position.cpWhite ?? 0, -500, 500)
      const y = 50 - (cp / 500) * 44
      return {
        x,
        y,
        rankClass: `move-rank-${evaluation.rank.toLowerCase().replace(/\s+/g, '-')}`,
      }
    })
  }, [analysisResult])
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
    if (!isBotTurn || !botReady) {
      return
    }

    let cancelled = false

    const playBotMove = async () => {
      setIsBotThinking(true)
      const bestMove = await getBestMove(state.fen)

      if (cancelled) {
        return
      }

      setIsBotThinking(false)

      if (!bestMove) {
        return
      }

      const move = uciToMoveObject(bestMove)
      if (!move) {
        return
      }

      dispatch({
        type: 'APPLY_UCI_MOVE',
        from: move.from,
        to: move.to,
        promotion: move.promotion as 'q' | 'r' | 'b' | 'n' | undefined,
      })
    }

    void playBotMove()

    return () => {
      cancelled = true
      stopBot()
    }
  }, [botReady, getBestMove, isBotTurn, state.fen, stopBot])

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

  const loadPgn = (rawPgn: string): ParsedPgn | null => {
    try {
      const parsed = parsePgn(rawPgn)
      setPgnMoveHistory(parsed.moves)
      setPgnFens(parsed.fens)
      setPgnPlyIndex(parsed.moves.length)
      setPgnError(null)
      setIsPgnAutoplay(false)
      return parsed
    } catch {
      setPgnError('Invalid PGN format.')
      return null
    }
  }

  const analyzePgn = async () => {
    const parsed = loadPgn(pgnInput)
    if (!parsed) {
      return
    }

    if (analysisResultCacheRef.current[parsed.normalized]) {
      setAnalysisResult(analysisResultCacheRef.current[parsed.normalized])
      setAnalysisProgress(null)
      setIsAnalyzingPgn(false)
      return
    }

    const sessionId = analysisSessionRef.current + 1
    analysisSessionRef.current = sessionId
    setIsAnalyzingPgn(true)
    setAnalysisResult(null)
    setAnalysisProgress({ done: 0, total: parsed.fens.length })

    try {
      const positions = await analyzePositionList(
        parsed.fens,
        () => sessionId !== analysisSessionRef.current,
        (done, total) => {
          if (sessionId !== analysisSessionRef.current) {
            return
          }
          setAnalysisProgress({ done, total })
        },
      )

      if (sessionId !== analysisSessionRef.current) {
        return
      }

      const moveEvaluations = parsed.moves.map((move, index) =>
        classifyMove(
          index,
          move,
          positions[index],
          positions[index + 1],
          openings,
          positionBook,
        ),
      )

      const result: AnalysisResult = {
        positions,
        moveEvaluations,
        accuracy: computeAccuracy(moveEvaluations),
      }

      analysisResultCacheRef.current[parsed.normalized] = result
      setAnalysisResult(result)
    } catch (error) {
      if (
        error instanceof Error &&
        error.message !== 'analysis_aborted' &&
        sessionId === analysisSessionRef.current
      ) {
        setPgnError('Could not analyze this PGN.')
      }
    } finally {
      if (sessionId === analysisSessionRef.current) {
        setIsAnalyzingPgn(false)
        setAnalysisProgress(null)
      }
    }
  }

  const clearPgnMode = () => {
    analysisSessionRef.current += 1
    setPgnMoveHistory(null)
    setPgnFens(null)
    setPgnPlyIndex(0)
    setPgnError(null)
    setIsPgnAutoplay(false)
    setIsAnalyzingPgn(false)
    setAnalysisProgress(null)
    setAnalysisResult(null)
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
      setAnalysisResult(null)
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
            <div className="player-sub">
              AI · Stockfish Level {stockfishLevel}
              {isBotThinking ? ' · Thinking...' : ''}
            </div>
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
              {analysisReady ? '●' : '○'}
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
                const isLastMoveTo = activeLastMove?.to === currentSquare
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
                        !isUserTurn ||
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
                      if (isGameOver || isPgnMode || !isUserTurn) {
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
                    {showMoveRankInsight && isLastMoveTo && activeMoveRankBadge ? (
                      <span
                        className={`move-rank-badge move-rank-${activeMoveRankBadge.label
                          .toLowerCase()
                          .replace(/\s+/g, '-')}`}
                        title={activeMoveRankBadge.label}
                      >
                        {activeMoveRankBadge.code}
                      </span>
                    ) : null}
                  </button>
                )
              })}
            </div>

            {shouldRenderArrowsForTurn &&
            (showBestMoveArrow || showSecondBestArrow) &&
            (bestMoveArrowShape || secondBestMoveArrowShape) ? (
              <svg
                className="board-arrows"
                viewBox="0 0 100 100"
                aria-hidden="true"
              >
                {showSecondBestArrow && secondBestMoveArrowShape ? (
                  <g className="board-arrow board-arrow-second">
                    <path d={secondBestMoveArrowShape.d} className="board-arrow-fill" />
                  </g>
                ) : null}

                {showBestMoveArrow && bestMoveArrowShape ? (
                  <g className="board-arrow board-arrow-best">
                    <path d={bestMoveArrowShape.d} className="board-arrow-fill" />
                  </g>
                ) : null}
              </svg>
            ) : null}

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
          <div className="brand-block">
            <img className="brand-logo" src="/logo.png" alt="ChessOS logo" />
            <div className="brand-text">
              <h2 className="brand-title">ChessOS</h2>
              <p className="brand-subtitle">Play, analyze, improve</p>
            </div>
          </div>
          <div className="top-actions">
            <button className="action-button" type="button">
              Exit
            </button>
            <button className="action-button" type="button">
              Copy PGN
            </button>
          </div>
        </header>

        {isPgnAnalysisMode ? (
          <>
            <div className="info-card panel-analysis-graph">
              <div className="move-list-header">
                <h3>Game Analysis Graph</h3>
                <span className="analysis-count">{analysisResult!.moveEvaluations.length} plies</span>
              </div>
              <div className="analysis-graph-wrap">
                <svg
                  className="analysis-graph"
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                  aria-label="Evaluation graph"
                >
                  <rect x="0" y="0" width="100" height="100" className="analysis-graph-bg" />
                  <line x1="0" y1="50" x2="100" y2="50" className="analysis-graph-midline" />
                  {analysisGraphPath ? (
                    <path d={analysisGraphPath} className="analysis-graph-line" />
                  ) : null}
                  {analysisGraphPoints.map((point, index) => (
                    <circle
                      key={`${index}-${point.rankClass}`}
                      cx={point.x}
                      cy={point.y}
                      r="1.4"
                      className={`analysis-graph-point ${point.rankClass}`}
                    />
                  ))}
                </svg>
              </div>
            </div>

            <div className="info-card panel-analysis-accuracy">
              <h3>Accuracy</h3>
              <div className="accuracy-grid">
                <div className="accuracy-item">
                  <span className="accuracy-label">White</span>
                  <span className="accuracy-value">{analysisResult!.accuracy.white}%</span>
                </div>
                <div className="accuracy-item">
                  <span className="accuracy-label">Black</span>
                  <span className="accuracy-value">{analysisResult!.accuracy.black}%</span>
                </div>
              </div>
            </div>

            <div className="info-card move-list-card panel-analysis-moves">
              <div className="move-list-header">
                <h3>Move Ranks</h3>
              </div>
              <div className="moves-table" role="table" aria-label="Analyzed move list">
                {analysisMoveRows.map((row) => (
                  <div className="move-row" role="row" key={row.moveNumber}>
                    <div className="move-number" role="cell">
                      {row.moveNumber}.
                    </div>
                    <div className="move-cell move-cell-analysis" role="cell">
                      {row.white ? (
                        <>
                          <span>{renderSanWithEmphasizedSymbols(row.white.san)}</span>
                          <span
                            className={`inline-rank-badge move-rank-${row.white.rank
                              .toLowerCase()
                              .replace(/\s+/g, '-')}`}
                          >
                            {getMoveRankBadge(row.white.rank)?.code}
                          </span>
                        </>
                      ) : (
                        ''
                      )}
                    </div>
                    <div className="move-cell move-cell-analysis" role="cell">
                      {row.black ? (
                        <>
                          <span>{renderSanWithEmphasizedSymbols(row.black.san)}</span>
                          <span
                            className={`inline-rank-badge move-rank-${row.black.rank
                              .toLowerCase()
                              .replace(/\s+/g, '-')}`}
                          >
                            {getMoveRankBadge(row.black.rank)?.code}
                          </span>
                        </>
                      ) : (
                        ''
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          <>
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

              <div className="insights-strip">
                <span className="insight-pill">Best: {bestMoveText}</span>
                {showSecondBestArrow ? (
                  <span className="insight-pill">2nd: {secondBestMoveText}</span>
                ) : null}
                {showMoveRankInsight && moveRankBadge ? (
                  <span className="insight-pill">Rank: {moveRankBadge.label}</span>
                ) : null}
                <span className="insight-pill">Eval: {whiteEvalLabel}</span>
                {showPvInsight ? (
                  <span className="insight-pill insight-pill-wide">
                    Principal Variation: {principalVariationDisplay}
                  </span>
                ) : null}
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
                onChange={(event) => {
                  setPgnInput(event.target.value)
                  setAnalysisResult(null)
                }}
                placeholder='Paste PGN here, e.g. 1. e4 e5 2. Nf3 Nc6'
              />
              <div className="pgn-actions">
                <button
                  className="action-button action-button-primary"
                  type="button"
                  onClick={() => void analyzePgn()}
                  disabled={isAnalyzingPgn}
                >
                  {isAnalyzingPgn ? 'Analyzing...' : 'Analyze'}
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
              {analysisProgress ? (
                <p className="pgn-progress">
                  Analyzing {analysisProgress.done}/{analysisProgress.total}
                </p>
              ) : null}
              {pgnError ? <p className="pgn-error">{pgnError}</p> : null}
            </div>

            <div className="info-card panel-strength">
              <h3>Opponent Strength</h3>
              <input
                className="elo-slider"
                type="range"
                min="0"
                max="20"
                value={stockfishLevel}
                step="1"
                onChange={(event) => setStockfishLevel(Number(event.target.value))}
              />
              <p>Level: {stockfishLevel}/20</p>
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={showBestMoveArrow}
                  onChange={(event) => setShowBestMoveArrow(event.target.checked)}
                />
                Show best move arrow
              </label>
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={showSecondBestArrow}
                  onChange={(event) => setShowSecondBestArrow(event.target.checked)}
                />
                Show second move arrow
              </label>
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={showOpponentArrows}
                  onChange={(event) => setShowOpponentArrows(event.target.checked)}
                />
                Show arrows for opponent turn
              </label>
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={showMoveRankInsight}
                  onChange={(event) => setShowMoveRankInsight(event.target.checked)}
                />
                Show move rank
              </label>
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={showPvInsight}
                  onChange={(event) => setShowPvInsight(event.target.checked)}
                />
                Show principal variation
              </label>
            </div>
          </>
        )}

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
