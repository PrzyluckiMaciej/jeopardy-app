import type { Player } from '../types'
import { formatScore } from '../lib/utils'

interface Props {
  players: Player[]
  highlightId?: string
}

const PODIUM_COLORS = [
  { bar: 'linear-gradient(180deg, #ffe066 0%, #d4a017 100%)', border: '#ffe066', label: '#ffe066', rank: '1ST' },
  { bar: 'linear-gradient(180deg, #c0c0c0 0%, #8a8a8a 100%)', border: '#c0c0c0', label: '#c0c0c0', rank: '2ND' },
  { bar: 'linear-gradient(180deg, #cd7f32 0%, #8b5a2b 100%)', border: '#cd7f32', label: '#cd7f32', rank: '3RD' },
]

const PODIUM_HEIGHTS = [220, 160, 120]
const PODIUM_ORDER = [1, 0, 2]

export default function Podium({ players, highlightId }: Props) {
  const sorted = [...players].sort((a, b) => b.score - a.score)
  const top3 = sorted.slice(0, 3)

  if (top3.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4">
        <div className="font-display text-4xl" style={{ color: 'var(--gold-bright)' }}>GAME OVER</div>
        <div className="font-condensed text-lg" style={{ color: '#4a5580' }}>No players to show</div>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-8">
      <div className="font-display text-4xl" style={{ color: 'var(--gold-bright)' }}>GAME OVER</div>

      <div className="flex items-end justify-center gap-4" style={{ minHeight: 320 }}>
        {PODIUM_ORDER.map((placeIdx) => {
          const player = top3[placeIdx]
          if (!player) return <div key={placeIdx} className="w-32" />
          const color = PODIUM_COLORS[placeIdx]
          const height = PODIUM_HEIGHTS[placeIdx]
          const delayClass = placeIdx === 0 ? 'podium-bar-1st' : placeIdx === 1 ? 'podium-bar-2nd' : 'podium-bar-3rd'
          const nameDelayClass = placeIdx === 0 ? 'podium-name-1st' : placeIdx === 1 ? 'podium-name-2nd' : 'podium-name-3rd'
          const isHighlighted = highlightId === player.id

          return (
            <div key={placeIdx} className="flex flex-col items-center w-32">
              <div className={`podium-name ${nameDelayClass} flex flex-col items-center mb-2`}>
                <div
                  className="font-condensed font-bold text-lg truncate max-w-full text-center"
                  style={{ color: isHighlighted ? 'var(--gold-bright)' : 'var(--white)' }}
                >
                  {player.name}
                  {isHighlighted && <span className="text-xs ml-1" style={{ color: 'var(--gold)' }}>(you)</span>}
                </div>
                <div
                  className="font-display text-xl"
                  style={{ color: player.score < 0 ? '#e07070' : 'var(--gold-bright)' }}
                >
                  {formatScore(player.score)}
                </div>
              </div>
              <div
                className={`podium-bar ${delayClass} w-full rounded-t-lg flex items-start justify-center pt-4`}
                style={{
                  height,
                  background: color.bar,
                  border: `2px solid ${color.border}`,
                  borderBottom: 'none',
                  opacity: 0,
                }}
              >
                <div
                  className="font-display text-2xl"
                  style={{ color: 'var(--navy)', opacity: 0.7 }}
                >
                  {color.rank}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Remaining players */}
      {sorted.length > 3 && (
        <div className="w-full max-w-md">
          <div className="font-condensed text-xs uppercase tracking-widest mb-2" style={{ color: 'var(--gold)', opacity: 0.7 }}>
            Other players
          </div>
          <div className="flex flex-col gap-1">
            {sorted.slice(3).map((p, i) => (
              <div
                key={p.id}
                className="flex justify-between items-center px-3 py-1.5 rounded"
                style={{ background: 'var(--navy-mid)', border: '1px solid var(--navy-light)' }}
              >
                <span className="font-condensed text-sm" style={{ color: highlightId === p.id ? 'var(--gold-bright)' : undefined }}>
                  {i + 4}. {p.name}
                  {highlightId === p.id && <span className="text-xs ml-1" style={{ color: 'var(--gold)' }}>(you)</span>}
                </span>
                <span className="font-display text-sm" style={{ color: p.score < 0 ? '#e07070' : 'var(--gold-bright)' }}>
                  {formatScore(p.score)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
