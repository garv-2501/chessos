import type { Piece } from './types'

const pieceNameMap: Record<Piece['type'], string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
}

export function pieceToAsset(piece: Piece): string {
  const name = pieceNameMap[piece.type]
  return `/pieces-svg/${name}-${piece.color}.svg`
}

export function pieceLabel(piece: Piece): string {
  const color = piece.color === 'w' ? 'White' : 'Black'
  return `${color} ${pieceNameMap[piece.type]}`
}
