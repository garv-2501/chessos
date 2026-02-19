import { Chess } from 'chess.js'
import type { Move, Square } from 'chess.js'
import { parseFEN } from './fen'
import { coordsToSquare } from './notation'
import type { Board, Color } from './types'

export type GameStatus = 'playing' | 'check' | 'checkmate' | 'draw'

export type LastMoveMeta = {
  isCastle: boolean
  isEnPassant: boolean
}

export type PlayedMove = {
  from: string
  to: string
  san: string
  color: Color
}

export type GameState = {
  board: Board
  fen: string
  turn: Color
  selectedSquare: string | null
  legalMoves: string[]
  lastMove: { from: string; to: string } | null
  lastMoveMeta: LastMoveMeta | null
  status: GameStatus
  winner: Color | null
  loser: Color | null
  inCheckColor: Color | null
  moveHistory: PlayedMove[]
}

export type GameAction =
  | { type: 'CLICK_SQUARE'; square: string }
  | { type: 'SELECT_SQUARE'; square: string }
  | { type: 'MOVE_SELECTED_TO'; square: string }
  | { type: 'CLEAR_SELECTION' }
  | { type: 'RESET' }

function nextTurn(turn: Color): Color {
  return turn === 'w' ? 'b' : 'w'
}

function isGameLocked(state: GameState): boolean {
  return state.status === 'checkmate' || state.status === 'draw'
}

export function isCastlingMove(flags: string): boolean {
  return flags.includes('k') || flags.includes('q')
}

export function isEnPassantMove(flags: string): boolean {
  return flags.includes('e')
}

export function getLegalMovesForSquare(fen: string, square: string): string[] {
  const chess = new Chess(fen)
  const piece = chess.get(square as Square)

  if (!piece || piece.color !== chess.turn()) {
    return []
  }

  const verboseMoves = chess.moves({ square: square as Square, verbose: true })
  const destinations = new Set(verboseMoves.map((move) => move.to))
  return Array.from(destinations)
}

function isOwnTurnPieceAtSquare(fen: string, square: string): boolean {
  const chess = new Chess(fen)
  const piece = chess.get(square as Square)
  return piece !== undefined && piece !== null && piece.color === chess.turn()
}

function evaluatePosition(chess: Chess): {
  turn: Color
  status: GameStatus
  winner: Color | null
  loser: Color | null
  inCheckColor: Color | null
} {
  const turn = chess.turn() as Color

  if (chess.isCheckmate()) {
    return {
      turn,
      status: 'checkmate',
      winner: nextTurn(turn),
      loser: turn,
      inCheckColor: turn,
    }
  }

  if (chess.isDraw()) {
    return {
      turn,
      status: 'draw',
      winner: null,
      loser: null,
      inCheckColor: null,
    }
  }

  if (chess.isCheck()) {
    return {
      turn,
      status: 'check',
      winner: null,
      loser: null,
      inCheckColor: turn,
    }
  }

  return {
    turn,
    status: 'playing',
    winner: null,
    loser: null,
    inCheckColor: null,
  }
}

function clearSelection(state: GameState): GameState {
  return {
    ...state,
    selectedSquare: null,
    legalMoves: [],
  }
}

function selectSquare(state: GameState, square: string): GameState {
  if (isGameLocked(state)) {
    return state
  }

  if (!isOwnTurnPieceAtSquare(state.fen, square)) {
    return state
  }

  const legalMoves = getLegalMovesForSquare(state.fen, square)
  return {
    ...state,
    selectedSquare: square,
    legalMoves,
  }
}

function moveSelectedTo(state: GameState, toSquare: string): GameState {
  if (isGameLocked(state) || !state.selectedSquare) {
    return state
  }

  const chess = new Chess(state.fen)
  const move = chess.move({
    from: state.selectedSquare as Square,
    to: toSquare as Square,
    promotion: 'q',
  }) as Move | null

  if (!move) {
    return state
  }

  const fen = chess.fen()
  const board = parseFEN(fen)
  const position = evaluatePosition(chess)

  return {
    ...state,
    board,
    fen,
    turn: position.turn,
    selectedSquare: null,
    legalMoves: [],
    lastMove: { from: move.from, to: move.to },
    lastMoveMeta: {
      isCastle: isCastlingMove(move.flags),
      isEnPassant: isEnPassantMove(move.flags),
    },
    status: position.status,
    winner: position.winner,
    loser: position.loser,
    inCheckColor: position.inCheckColor,
    moveHistory: [
      ...state.moveHistory,
      {
        from: move.from,
        to: move.to,
        san: move.san,
        color: move.color as Color,
      },
    ],
  }
}

export function createInitialGameState(): GameState {
  const chess = new Chess()
  const fen = chess.fen()
  const position = evaluatePosition(chess)

  return {
    board: parseFEN(fen),
    fen,
    turn: position.turn,
    selectedSquare: null,
    legalMoves: [],
    lastMove: null,
    lastMoveMeta: null,
    status: position.status,
    winner: position.winner,
    loser: position.loser,
    inCheckColor: position.inCheckColor,
    moveHistory: [],
  }
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  if (action.type === 'RESET') {
    return createInitialGameState()
  }
  if (action.type === 'CLEAR_SELECTION') {
    return clearSelection(state)
  }
  if (action.type === 'SELECT_SQUARE') {
    return selectSquare(state, action.square)
  }
  if (action.type === 'MOVE_SELECTED_TO') {
    return moveSelectedTo(state, action.square)
  }

  const clickedSquare = action.square

  if (!state.selectedSquare) {
    return selectSquare(state, clickedSquare)
  }

  if (clickedSquare === state.selectedSquare) {
    return clearSelection(state)
  }

  if (isOwnTurnPieceAtSquare(state.fen, clickedSquare)) {
    return {
      ...state,
      selectedSquare: clickedSquare,
      legalMoves: getLegalMovesForSquare(state.fen, clickedSquare),
    }
  }

  if (!state.legalMoves.includes(clickedSquare)) {
    return clearSelection(state)
  }

  return moveSelectedTo(state, clickedSquare)
}

export function squareAt(row: number, col: number): string {
  return coordsToSquare(row, col)
}
