export type Color = 'w' | 'b'
export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k'

export type Piece = {
  type: PieceType
  color: Color
}

export type Board = (Piece | null)[][]
