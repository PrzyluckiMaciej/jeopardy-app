import { formatScore } from '../lib/utils'
import type { Player } from '../types'

interface Props {
  players: Player[]
  buzzQueue?: string[]
  highlightId?: string
  boardControlId?: string | null
}

export default function Scoreboard({ players, buzzQueue = [], highlightId, boardControlId }: Props) {
  const sorted = [...players].sort((a, b) => b.score - a.score)

  if (players.length === 0) {
    return (
      <div className="text-center text-sm py-4" style={{ color: '#4a5580' }}>
        No players yet
      </div>
    )
  }

  return (
    <div className="flex flex-wrap gap-3 justify-center">
      {sorted.map((p) => {
        const buzzPos = buzzQueue.indexOf(p.id)
        const isBuzzed = buzzPos >= 0
        const isFirst = buzzPos === 0
        const isHighlighted = p.id === highlightId
        const hasControl = boardControlId != null && p.id === boardControlId

        const accentColor = isFirst
          ? 'var(--gold-bright)'
          : hasControl
          ? '#40e0d0'
          : isHighlighted
          ? 'var(--gold)'
          : 'var(--navy-light)'

        return (
          <div
            key={p.id}
            className="flex flex-col items-center transition-all"
            style={{
              minWidth: 130,
              maxWidth: 180,
              flex: '1 1 130px',
              opacity: p.isConnected ? 1 : 0.5,
              background: isHighlighted
                ? 'rgba(212,160,23,0.13)'
                : isFirst
                ? 'rgba(212,160,23,0.07)'
                : 'var(--navy)',
              border: `1px solid ${isFirst ? 'rgba(212,160,23,0.45)' : 'var(--navy-light)'}`,
              borderRadius: 10,
              overflow: 'hidden',
            }}
          >
            {/* Top accent bar */}
            <div style={{ width: '100%', height: 4, background: accentColor, flexShrink: 0 }} />

            {/* Content */}
            <div className="flex flex-col items-center gap-1 px-3 pt-3 pb-2 w-full">
              {/* Name */}
              <div
                className="font-condensed font-bold text-sm text-center w-full truncate"
                style={{ color: isHighlighted ? 'var(--gold-bright)' : 'var(--white)' }}
                title={p.name}
              >
                {p.name}
                {!p.isConnected && (
                  <span className="ml-1 text-xs" style={{ color: '#4a5580', fontWeight: 400 }}>
                    (offline)
                  </span>
                )}
              </div>

              {/* Score */}
              <div
                className="font-display text-2xl leading-none"
                style={{ color: p.score < 0 ? '#e07070' : 'var(--gold-bright)' }}
              >
                {formatScore(p.score)}
              </div>

              {/* Status badges */}
              <div className="flex flex-wrap gap-1 justify-center mt-1" style={{ minHeight: 22 }}>
                {hasControl && (
                  <span
                    className="font-condensed text-xs px-2 py-0.5 rounded"
                    style={{
                      background: 'rgba(0,200,180,0.2)',
                      color: '#40e0d0',
                      border: '1px solid rgba(0,200,180,0.45)',
                    }}
                  >
                    BOARD
                  </span>
                )}
                {isBuzzed && (
                  <span
                    className="font-condensed text-xs px-2 py-0.5 rounded"
                    style={{
                      background: isFirst ? 'rgba(212,160,23,0.3)' : 'rgba(74,85,128,0.3)',
                      color: isFirst ? 'var(--gold-bright)' : '#8899cc',
                      border: `1px solid ${isFirst ? 'rgba(212,160,23,0.5)' : 'rgba(74,85,128,0.5)'}`,
                    }}
                  >
                    {isFirst ? 'BUZZED' : `#${buzzPos + 1}`}
                  </span>
                )}
              </div>
            </div>

            {/* Bottom light bar */}
            <div
              style={{
                width: '100%',
                height: 6,
                background: accentColor,
                opacity: 0.35,
                flexShrink: 0,
              }}
            />
          </div>
        )
      })}
    </div>
  )
}
