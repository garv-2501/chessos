import type { Board, Piece } from './types'
import { squareToCoords } from './notation'

export function createEmptyBoard(): Board {
  return Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => null))
}

export function setPieceAtCoords(
  board: Board,
  row: number,
  col: number,
  piece: Piece | null,
): Board {
  const next = board.map((rank) => rank.slice())
  next[row][col] = piece
  return next
}

export function setPieceAtSquare(
  board: Board,
  square: string,
  piece: Piece | null,
): Board {
  const { row, col } = squareToCoords(square)
  return setPieceAtCoords(board, row, col, piece)
}
