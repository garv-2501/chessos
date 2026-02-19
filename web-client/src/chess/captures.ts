import { Chess } from 'chess.js'
import type { Square } from 'chess.js'
import type { PieceType } from './types'
import type { PlayedMove } from './game'

type Color = 'w' | 'b'

type CaptureBuckets = {
  w: PieceType[]
  b: PieceType[]
}

type Material = {
  w: number
  b: number
}

export type CaptureSummary = {
  byColor: CaptureBuckets
  material: Material
  advantage: Material
}

const PIECE_VALUE: Record<PieceType, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0,
}

function opposite(color: Color): Color {
  return color === 'w' ? 'b' : 'w'
}

function sortForDisplay(pieces: PieceType[]): PieceType[] {
  const order: Record<PieceType, number> = {
    q: 0,
    r: 1,
    b: 2,
    n: 3,
    p: 4,
    k: 5,
  }

  return [...pieces].sort((a, b) => order[a] - order[b])
}

export function buildCaptureSummary(moveHistory: PlayedMove[]): CaptureSummary {
  const chess = new Chess()
  const byColor: CaptureBuckets = { w: [], b: [] }

  moveHistory.forEach((move) => {
    const movingPiece = chess.get(move.from as Square)
    if (!movingPiece) {
      return
    }

    let capturedType: PieceType | null = null
    const directTarget = chess.get(move.to as Square)

    if (directTarget) {
      capturedType = directTarget.type
    } else if (
      movingPiece.type === 'p' &&
      move.san.includes('x') &&
      move.from[0] !== move.to[0]
    ) {
      // En passant capture lands on an empty destination square.
      capturedType = 'p'
    }

    const applied = chess.move({
      from: move.from as Square,
      to: move.to as Square,
      promotion: 'q',
    })

    if (!applied || !capturedType) {
      return
    }

    byColor[move.color].push(capturedType)
  })

  const material: Material = {
    w: byColor.w.reduce((sum, type) => sum + PIECE_VALUE[type], 0),
    b: byColor.b.reduce((sum, type) => sum + PIECE_VALUE[type], 0),
  }

  return {
    byColor: {
      w: sortForDisplay(byColor.w),
      b: sortForDisplay(byColor.b),
    },
    material,
    advantage: {
      w: material.w - material[opposite('w')],
      b: material.b - material[opposite('b')],
    },
  }
}
