import { coordsToSquare, squareToCoords } from './notation'
import type { Board, Color, Piece, PieceType } from './types'

const SAN_TO_PIECE: Record<string, PieceType> = {
  P: 'p',
  N: 'n',
  B: 'b',
  R: 'r',
  Q: 'q',
  K: 'k',
}

const KNIGHT_OFFSETS = [
  [-2, -1],
  [-2, 1],
  [-1, -2],
  [-1, 2],
  [1, -2],
  [1, 2],
  [2, -1],
  [2, 1],
] as const

const KING_OFFSETS = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 0],
  [1, 1],
] as const

const ROOK_DIRECTIONS = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
] as const

const BISHOP_DIRECTIONS = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
] as const

export function getPieceAtSquare(board: Board, square: string): Piece | null {
  const { row, col } = squareToCoords(square)
  return board[row][col]
}

export function isSquareOnBoard(row: number, col: number): boolean {
  return row >= 0 && row <= 7 && col >= 0 && col <= 7
}

function isEmpty(board: Board, row: number, col: number): boolean {
  return board[row][col] === null
}

function isEnemy(board: Board, row: number, col: number, color: Color): boolean {
  const piece = board[row][col]
  return piece !== null && piece.color !== color
}

function isAlly(board: Board, row: number, col: number, color: Color): boolean {
  const piece = board[row][col]
  return piece !== null && piece.color === color
}

function pushIfValid(
  board: Board,
  moves: string[],
  row: number,
  col: number,
  color: Color,
): void {
  if (!isSquareOnBoard(row, col) || isAlly(board, row, col, color)) {
    return
  }
  moves.push(coordsToSquare(row, col))
}

function slidingMoves(
  board: Board,
  row: number,
  col: number,
  color: Color,
  directions: ReadonlyArray<readonly [number, number]>,
): string[] {
  const moves: string[] = []

  directions.forEach(([dRow, dCol]) => {
    let nextRow = row + dRow
    let nextCol = col + dCol

    while (isSquareOnBoard(nextRow, nextCol)) {
      if (isAlly(board, nextRow, nextCol, color)) {
        break
      }

      moves.push(coordsToSquare(nextRow, nextCol))

      if (isEnemy(board, nextRow, nextCol, color)) {
        break
      }

      nextRow += dRow
      nextCol += dCol
    }
  })

  return moves
}

function pawnMoves(board: Board, row: number, col: number, color: Color): string[] {
  const moves: string[] = []
  const direction = color === 'w' ? -1 : 1
  const startRow = color === 'w' ? 6 : 1

  const oneStep = row + direction
  if (isSquareOnBoard(oneStep, col) && isEmpty(board, oneStep, col)) {
    moves.push(coordsToSquare(oneStep, col))

    const twoStep = row + direction * 2
    if (row === startRow && isEmpty(board, twoStep, col)) {
      moves.push(coordsToSquare(twoStep, col))
    }
  }

  ;[-1, 1].forEach((offset) => {
    const captureCol = col + offset
    const captureRow = row + direction
    if (
      isSquareOnBoard(captureRow, captureCol) &&
      isEnemy(board, captureRow, captureCol, color)
    ) {
      moves.push(coordsToSquare(captureRow, captureCol))
    }
  })

  return moves
}

function knightMoves(board: Board, row: number, col: number, color: Color): string[] {
  const moves: string[] = []
  KNIGHT_OFFSETS.forEach(([dRow, dCol]) => {
    pushIfValid(board, moves, row + dRow, col + dCol, color)
  })
  return moves
}

function kingMoves(board: Board, row: number, col: number, color: Color): string[] {
  const moves: string[] = []
  KING_OFFSETS.forEach(([dRow, dCol]) => {
    pushIfValid(board, moves, row + dRow, col + dCol, color)
  })
  return moves
}

export function getPossibleMovesFromSquare(board: Board, square: string): string[] {
  const piece = getPieceAtSquare(board, square)
  if (!piece) {
    return []
  }

  const { row, col } = squareToCoords(square)

  switch (piece.type) {
    case 'p':
      return pawnMoves(board, row, col, piece.color)
    case 'n':
      return knightMoves(board, row, col, piece.color)
    case 'b':
      return slidingMoves(board, row, col, piece.color, BISHOP_DIRECTIONS)
    case 'r':
      return slidingMoves(board, row, col, piece.color, ROOK_DIRECTIONS)
    case 'q':
      return slidingMoves(board, row, col, piece.color, [
        ...ROOK_DIRECTIONS,
        ...BISHOP_DIRECTIONS,
      ])
    case 'k':
      return kingMoves(board, row, col, piece.color)
    default:
      return []
  }
}

export function getPossibleMovesForPgnPiece(
  board: Board,
  fromSquare: string,
  pgnPiece: string,
): string[] {
  const piece = getPieceAtSquare(board, fromSquare)
  if (!piece) {
    return []
  }

  const normalized = pgnPiece.trim().toUpperCase()
  const expectedType = SAN_TO_PIECE[normalized]
  if (!expectedType) {
    return []
  }

  if (piece.type !== expectedType) {
    return []
  }

  return getPossibleMovesFromSquare(board, fromSquare)
}

export function movePiece(board: Board, fromSquare: string, toSquare: string): Board {
  const from = squareToCoords(fromSquare)
  const to = squareToCoords(toSquare)
  const piece = board[from.row][from.col]

  if (!piece) {
    return board
  }

  const next = board.map((rank) => rank.slice())
  next[from.row][from.col] = null
  next[to.row][to.col] = piece
  return next
}
