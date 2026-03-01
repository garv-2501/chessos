import { useCallback, useEffect, useRef, useState } from 'react'

type BotMoveResolver = (move: string | null) => void

function clampElo(elo: number): number {
  return Math.max(800, Math.min(2800, Math.round(elo)))
}

function eloToSkillLevel(elo: number): number {
  const clamped = clampElo(elo)
  const normalized = (clamped - 800) / (2800 - 800)
  return Math.max(0, Math.min(20, Math.round(normalized * 20)))
}

export function useStockfishBot(estimatedElo: number) {
  const workerRef = useRef<Worker | null>(null)
  const pendingMoveRef = useRef<BotMoveResolver | null>(null)
  const [ready, setReady] = useState(false)

  const setEstimatedElo = useCallback((elo: number) => {
    const worker = workerRef.current
    if (!worker) {
      return
    }

    const clampedElo = clampElo(elo)
    worker.postMessage('setoption name UCI_LimitStrength value true')
    worker.postMessage(`setoption name UCI_Elo value ${clampedElo}`)
    worker.postMessage(
      `setoption name Skill Level value ${eloToSkillLevel(clampedElo)}`,
    )
  }, [])

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
        const bestMove = line.split(/\s+/)[1]
        const move = bestMove && bestMove !== '(none)' ? bestMove : null
        pendingMoveRef.current?.(move)
        pendingMoveRef.current = null
      }
    }

    worker.postMessage('uci')
    worker.postMessage('setoption name Threads value 1')
    worker.postMessage('setoption name Hash value 16')
    worker.postMessage('ucinewgame')
    worker.postMessage('isready')

    return () => {
      pendingMoveRef.current?.(null)
      pendingMoveRef.current = null
      worker.postMessage('quit')
      worker.terminate()
      workerRef.current = null
      setReady(false)
    }
  }, [])

  useEffect(() => {
    if (!ready) {
      return
    }

    setEstimatedElo(estimatedElo)
  }, [estimatedElo, ready, setEstimatedElo])

  const stop = useCallback(() => {
    const worker = workerRef.current
    if (!worker) {
      return
    }

    worker.postMessage('stop')
    pendingMoveRef.current?.(null)
    pendingMoveRef.current = null
  }, [])

  const getBestMove = useCallback(
    (fen: string, movetime = 220): Promise<string | null> =>
      new Promise((resolve) => {
        const worker = workerRef.current
        if (!worker || !ready) {
          resolve(null)
          return
        }

        if (pendingMoveRef.current) {
          pendingMoveRef.current(null)
          pendingMoveRef.current = null
        }

        pendingMoveRef.current = resolve
        worker.postMessage('stop')
        worker.postMessage(`position fen ${fen}`)
        worker.postMessage(`go movetime ${movetime}`)
      }),
    [ready],
  )

  return {
    ready,
    setEstimatedElo,
    getBestMove,
    stop,
  }
}
