import type { Board, Color, Piece, PieceType } from './types'
import { createEmptyBoard } from './board'

const fenPieceMap: Record<string, PieceType> = {
  p: 'p',
  n: 'n',
  b: 'b',
  r: 'r',
  q: 'q',
  k: 'k',
}

export const INITIAL_FEN =
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR'

export function parseFEN(fen: string): Board {
  const placement = fen.trim().split(/\s+/)[0]
  const ranks = placement.split('/')

  if (ranks.length !== 8) {
    throw new Error(`Invalid FEN: ${fen}`)
  }

  const board = createEmptyBoard()

  ranks.forEach((rank, row) => {
    let col = 0

    for (const char of rank) {
      if (char >= '1' && char <= '8') {
        col += Number(char)
        continue
      }

      const color: Color = char === char.toUpperCase() ? 'w' : 'b'
      const type = fenPieceMap[char.toLowerCase()]

      if (!type) {
        throw new Error(`Invalid piece in FEN: ${char}`)
      }

      const piece: Piece = { type, color }
      board[row][col] = piece
      col += 1
    }

    if (col !== 8) {
      throw new Error(`Invalid rank in FEN: ${rank}`)
    }
  })

  return board
}
