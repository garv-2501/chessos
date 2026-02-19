import { useMemo } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import type { Opening } from '@chess-openings/eco.json'

type OpeningDetailState = {
  opening?: Opening
  fen?: string
}

function wikiUrlForOpening(name: string, eco: string): string {
  if (!name) {
    return 'https://en.wikipedia.org/wiki/List_of_chess_openings'
  }

  const normalized = name.replace(/:/g, '').trim()
  return normalized
    ? `https://en.wikipedia.org/wiki/${encodeURIComponent(normalized)}`
    : `https://en.wikipedia.org/wiki/ECO_code#${encodeURIComponent(eco)}`
}

function lichessAnalysisUrl(fen?: string): string {
  if (!fen) {
    return 'https://lichess.org/analysis'
  }

  const normalizedFen = encodeURIComponent(fen).replace(/%20/g, '_')
  return `https://lichess.org/analysis/${normalizedFen}`
}

export default function OpeningDetailPage() {
  const navigate = useNavigate()
  const { eco } = useParams()
  const { state } = useLocation() as { state: OpeningDetailState | null }

  const opening = state?.opening
  const fen = state?.fen

  const openingName = opening?.name ?? `ECO ${eco ?? ''}`.trim()
  const openingEco = opening?.eco ?? eco ?? 'Unknown'

  const links = useMemo(
    () => [
      {
        label: 'Analyze this position (Lichess)',
        href: lichessAnalysisUrl(fen),
      },
      {
        label: 'Explorer stats (Chess.com)',
        href: 'https://www.chess.com/explorer',
      },
      {
        label: 'Read overview (Wikipedia)',
        href: wikiUrlForOpening(opening?.name ?? '', openingEco),
      },
      {
        label: 'Train it (ChessTempo)',
        href: 'https://chesstempo.com/opening-training/',
      },
      {
        label: 'Course (Chessable)',
        href: `https://www.chessable.com/search/?query=${encodeURIComponent(openingName)}`,
      },
      {
        label: 'My results (OpeningTree)',
        href: 'https://www.openingtree.com/',
      },
    ],
    [fen, opening?.name, openingEco, openingName],
  )

  return (
    <main className="page opening-detail-page">
      <header className="page-header">
        <button
          className="secondary"
          type="button"
          onClick={() => navigate('/play')}
        >
          Back to Game
        </button>
        <h1>{openingName}</h1>
        <p className="muted">ECO: {openingEco}</p>
        {opening?.moves ? <p className="opening-moves">{opening.moves}</p> : null}
      </header>

      <section className="opening-links-grid">
        {links.map((link) => (
          <a
            key={link.label}
            className="opening-link-card"
            href={link.href}
            target="_blank"
            rel="noreferrer"
          >
            {link.label}
          </a>
        ))}
      </section>
    </main>
  )
}
