export function squareToCoords(square: string): { row: number; col: number } {
  if (!/^[a-h][1-8]$/i.test(square)) {
    throw new Error(`Invalid square: ${square}`)
  }

  const file = square[0].toLowerCase()
  const rank = Number(square[1])
  const col = file.charCodeAt(0) - 'a'.charCodeAt(0)
  const row = 8 - rank

  return { row, col }
}

export function coordsToSquare(row: number, col: number): string {
  if (row < 0 || row > 7 || col < 0 || col > 7) {
    throw new Error(`Invalid coords: ${row}, ${col}`)
  }

  const file = String.fromCharCode('a'.charCodeAt(0) + col)
  const rank = String(8 - row)
  return `${file}${rank}`
}
