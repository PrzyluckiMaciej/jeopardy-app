import { formatScore } from '../lib/utils'
import type { Player } from '../types'

interface Props {
  players: Player[]
  buzzQueue?: string[]
  highlightId?: string
}

export default function Scoreboard({ players, buzzQueue = [], highlightId }: Props) {
  const sorted = [...players].sort((a, b) => b.score - a.score)

  return (
    <div className="flex flex-col gap-2">
      {sorted.map((p, i) => {
        const buzzPos = buzzQueue.indexOf(p.id)
        const isBuzzed = buzzPos >= 0
        const isFirst = buzzPos === 0
        const isHighlighted = p.id === highlightId

        return (
          <div
            key={p.id}
            className="flex items-center gap-3 px-3 py-2 rounded-lg transition-all"
            style={{
              background: isHighlighted
                ? 'rgba(212,160,23,0.15)'
                : isFirst
                ? 'rgba(212,160,23,0.08)'
                : 'var(--navy)',
              border: isFirst
                ? '1px solid rgba(212,160,23,0.5)'
                : '1px solid var(--navy-light)',
              opacity: p.isConnected ? 1 : 0.5,
            }}
          >
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center font-condensed font-bold text-sm flex-shrink-0"
              style={{ background: 'var(--navy-mid)', color: 'var(--gold)' }}
            >
              {i + 1}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-condensed font-bold text-sm truncate" style={{ color: 'var(--white)' }}>
                {p.name}
                {!p.isConnected && <span className="ml-1 text-xs" style={{ color: '#4a5580' }}> (offline)</span>}
              </div>
              <div className="font-display text-lg leading-none" style={{ color: p.score < 0 ? '#e07070' : 'var(--gold-bright)' }}>
                {formatScore(p.score)}
              </div>
            </div>
            {isBuzzed && (
              <div
                className="font-condensed text-xs px-2 py-1 rounded"
                style={{
                  background: isFirst ? 'rgba(212,160,23,0.3)' : 'rgba(74,85,128,0.3)',
                  color: isFirst ? 'var(--gold-bright)' : '#8899cc',
                  border: `1px solid ${isFirst ? 'rgba(212,160,23,0.5)' : 'rgba(74,85,128,0.5)'}`,
                }}
              >
                {isFirst ? 'BUZZED' : `#${buzzPos + 1}`}
              </div>
            )}
          </div>
        )
      })}
      {players.length === 0 && (
        <div className="text-center text-sm py-4" style={{ color: '#4a5580' }}>
          No players yet
        </div>
      )}
    </div>
  )
}
