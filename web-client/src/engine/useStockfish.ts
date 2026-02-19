import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Color } from '../chess/types'

type EngineInfo = {
  depth: number | null
  cp: number | null
  mate: number | null
  pv: string[]
}

export type StockfishEvaluation = {
  depth: number | null
  cpWhite: number | null
  mateWhite: number | null
  pv: string[]
  bestMove: string | null
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function cpToWhitePerspective(cp: number, turn: Color): number {
  return turn === 'w' ? cp : -cp
}

function mateToWhitePerspective(mate: number, turn: Color): number {
  return turn === 'w' ? mate : -mate
}

function formatEvalValue(cpWhite: number | null, mateWhite: number | null): string {
  if (mateWhite !== null) {
    return mateWhite > 0 ? `#${mateWhite}` : `#-${Math.abs(mateWhite)}`
  }

  if (cpWhite === null) {
    return '0.0'
  }

  const pawns = cpWhite / 100
  return pawns > 0 ? `+${pawns.toFixed(1)}` : pawns.toFixed(1)
}

function toWhiteRatio(cpWhite: number | null, mateWhite: number | null): number {
  if (mateWhite !== null) {
    return mateWhite > 0 ? 0.98 : 0.02
  }

  if (cpWhite === null) {
    return 0.5
  }

  return clamp(0.5 + cpWhite / 1200, 0.05, 0.95)
}

function parseInfo(line: string): EngineInfo | null {
  if (!line.startsWith('info ') || !line.includes(' score ')) {
    return null
  }

  const depthMatch = line.match(/\bdepth\s+(\d+)/)
  const cpMatch = line.match(/\bscore\s+cp\s+(-?\d+)/)
  const mateMatch = line.match(/\bscore\s+mate\s+(-?\d+)/)
  const pvMatch = line.match(/\bpv\s+(.+)$/)

  return {
    depth: depthMatch ? Number(depthMatch[1]) : null,
    cp: cpMatch ? Number(cpMatch[1]) : null,
    mate: mateMatch ? Number(mateMatch[1]) : null,
    pv: pvMatch ? pvMatch[1].trim().split(/\s+/) : [],
  }
}

export function useStockfish() {
  const workerRef = useRef<Worker | null>(null)
  const [ready, setReady] = useState(false)
  const [engineInfo, setEngineInfo] = useState<EngineInfo>({
    depth: null,
    cp: null,
    mate: null,
    pv: [],
  })
  const [bestMove, setBestMove] = useState<string | null>(null)
  const [currentTurn, setCurrentTurn] = useState<Color>('w')

  useEffect(() => {
    const worker = new Worker(
      new URL('../../node_modules/stockfish/bin/stockfish-18-lite-single.js', import.meta.url),
      { type: 'classic' },
    )
    workerRef.current = worker

    worker.onmessage = (event: MessageEvent<string>) => {
      const line = String(event.data ?? '').trim()
      if (!line) {
        return
      }

      if (line === 'readyok') {
        setReady(true)
        return
      }

      if (line.startsWith('bestmove ')) {
        const move = line.split(/\s+/)[1]
        if (move) {
          setBestMove(move)
        }
        return
      }

      const info = parseInfo(line)
      if (info) {
        setEngineInfo(info)
      }
    }

    worker.postMessage('uci')
    worker.postMessage('setoption name Threads value 1')
    worker.postMessage('setoption name Hash value 16')
    worker.postMessage('ucinewgame')
    worker.postMessage('isready')

    return () => {
      worker.postMessage('quit')
      worker.terminate()
      workerRef.current = null
    }
  }, [])

  const analyzeFen = useCallback((fen: string, turn: Color, movetime = 150) => {
    const worker = workerRef.current
    if (!worker) {
      return
    }

    setCurrentTurn(turn)
    worker.postMessage('stop')
    worker.postMessage(`position fen ${fen}`)
    worker.postMessage(`go movetime ${movetime}`)
  }, [])

  const stop = useCallback(() => {
    workerRef.current?.postMessage('stop')
  }, [])

  const evaluation: StockfishEvaluation = useMemo(() => {
    const cpWhite =
      engineInfo.cp === null
        ? null
        : cpToWhitePerspective(engineInfo.cp, currentTurn)
    const mateWhite =
      engineInfo.mate === null
        ? null
        : mateToWhitePerspective(engineInfo.mate, currentTurn)

    return {
      depth: engineInfo.depth,
      cpWhite,
      mateWhite,
      pv: engineInfo.pv,
      bestMove,
    }
  }, [bestMove, currentTurn, engineInfo])

  return {
    ready,
    evaluation,
    analyzeFen,
    stop,
    toWhiteRatio,
    formatEvalValue,
  }
}
