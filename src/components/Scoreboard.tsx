import { useState } from 'react'
import { formatScore } from '../lib/utils'
import type { Player } from '../types'

const EMOJIS = ['😂', '😎', '😠', '🤡', '😮', '🤨', '😴', '😍', '👍', '👎']

interface EmojiReaction {
  emoji: string
  seq: number
}

interface Props {
  players: Player[]
  buzzQueue?: string[]
  highlightId?: string
  boardControlId?: string | null
  activeEmojis?: Record<string, EmojiReaction>
  myPlayerId?: string
  onEmojiSelect?: (emoji: string) => void
}

const RANK_COLORS = ['#ffe066', '#c8c8c8', '#cd7f32']

function getRankColor(rank: number): string {
  return RANK_COLORS[rank - 1] ?? '#4a5580'
}

export default function Scoreboard({
  players,
  buzzQueue = [],
  highlightId,
  boardControlId,
  activeEmojis = {},
  myPlayerId,
  onEmojiSelect,
}: Props) {
  const [showPicker, setShowPicker] = useState(false)
  const sorted = [...players].sort((a, b) => b.score - a.score)

  // Build rank map — tied scores share the same rank
  const rankMap = new Map<string, number>()
  let currentRank = 1
  sorted.forEach((p, i) => {
    if (i > 0 && sorted[i - 1].score > p.score) {
      currentRank = i + 1
    }
    rankMap.set(p.id, currentRank)
  })

  if (players.length === 0) {
    return (
      <div className="text-center text-sm py-4" style={{ color: '#4a5580' }}>
        No players yet
      </div>
    )
  }

  function handleEmojiClick(emoji: string) {
    setShowPicker(false)
    onEmojiSelect?.(emoji)
  }

  return (
    <div className="flex flex-wrap gap-3 justify-center">
      {sorted.map((p) => {
        const buzzPos = buzzQueue.indexOf(p.id)
        const isBuzzed = buzzPos >= 0
        const isFirst = buzzPos === 0
        const isHighlighted = p.id === highlightId
        const hasControl = boardControlId != null && p.id === boardControlId
        const isMe = p.id === myPlayerId
        const reaction = activeEmojis[p.id]
        const rank = rankMap.get(p.id) ?? 1

        // Left accent stripe color — priority: buzzed first > board control > me > default
        const stripeColor = isFirst
          ? 'var(--gold)'
          : hasControl
          ? '#40e0d0'
          : isMe
          ? 'var(--accent-blue)'
          : 'var(--border-subtle)'

        // Card border — matches stripe priority
        const cardBorderColor = isFirst
          ? 'rgba(212,160,23,0.55)'
          : isMe
          ? 'rgba(59,130,246,0.5)'
          : hasControl
          ? 'rgba(0,200,180,0.45)'
          : 'var(--border-default)'

        // Extra CSS class for animated states
        const cardAnimClass = isFirst
          ? 'scoreboard-card--buzzed-first'
          : isMe
          ? 'scoreboard-card--me'
          : ''

        return (
          <div
            key={p.id}
            className={`flex transition-all ${cardAnimClass}`}
            style={{
              minWidth: 110,
              maxWidth: 180,
              flex: '1 1 110px',
              background: isFirst
                ? 'rgba(212,160,23,0.07)'
                : isHighlighted
                ? 'rgba(212,160,23,0.10)'
                : hasControl
                ? 'rgba(0,200,180,0.05)'
                : 'var(--bg-elevated)',
              border: `1px solid ${cardBorderColor}`,
              borderRadius: 10,
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {reaction && (
              <div key={reaction.seq} className="emoji-float">
                {reaction.emoji}
              </div>
            )}

            {/* Left accent stripe */}
            <div
              style={{
                width: 4,
                background: stripeColor,
                flexShrink: 0,
                borderRadius: '10px 0 0 10px',
                transition: 'background 0.3s',
              }}
            />

            {/* Card content */}
            <div className="flex flex-col gap-1 px-2.5 pt-2 pb-2 w-full min-w-0">

              {/* Top row: rank badge + connection dot */}
              <div className="flex items-center justify-between">
                <span
                  className="font-condensed font-bold leading-none"
                  style={{
                    fontSize: 11,
                    color: getRankColor(rank),
                    letterSpacing: '0.04em',
                  }}
                >
                  #{rank}
                </span>

                {/* Connection status dot */}
                <span
                  title={p.isConnected ? 'Online' : 'Offline'}
                  style={{
                    display: 'inline-block',
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: p.isConnected ? 'var(--success)' : '#3a3f5c',
                    boxShadow: p.isConnected
                      ? '0 0 5px rgba(34,197,94,0.55)'
                      : 'none',
                    flexShrink: 0,
                    transition: 'background 0.3s',
                  }}
                />
              </div>

              {/* Emoji picker button (only for own card when callback provided) */}
              {isMe && onEmojiSelect && (
                <div style={{ position: 'relative', width: '100%', display: 'flex', justifyContent: 'center' }}>
                  <button
                    onClick={() => setShowPicker((v) => !v)}
                    title="Send an emoji reaction"
                    style={{
                      background: showPicker ? 'rgba(212,160,23,0.25)' : 'rgba(255,255,255,0.07)',
                      border: `1px solid ${showPicker ? 'rgba(212,160,23,0.6)' : 'rgba(255,255,255,0.15)'}`,
                      borderRadius: 6,
                      cursor: 'pointer',
                      fontSize: '0.95rem',
                      lineHeight: 1,
                      padding: '2px 8px',
                      color: 'var(--white)',
                      transition: 'background 0.15s, border 0.15s',
                    }}
                  >
                    😊
                  </button>

                  {showPicker && (
                    <div
                      style={{
                        position: 'absolute',
                        bottom: 'calc(100% + 6px)',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        background: '#0d1545',
                        border: '1px solid var(--navy-light)',
                        borderRadius: 10,
                        padding: '6px 8px',
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 4,
                        width: 170,
                        justifyContent: 'center',
                        zIndex: 100,
                        boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
                      }}
                    >
                      {EMOJIS.map((e) => (
                        <button
                          key={e}
                          onClick={() => handleEmojiClick(e)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '1.4rem',
                            padding: '3px 4px',
                            borderRadius: 6,
                            lineHeight: 1,
                            transition: 'background 0.1s',
                          }}
                          onMouseEnter={(ev) => {
                            ;(ev.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.1)'
                          }}
                          onMouseLeave={(ev) => {
                            ;(ev.currentTarget as HTMLButtonElement).style.background = 'transparent'
                          }}
                        >
                          {e}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Name row */}
              <div className="flex items-center gap-1 min-w-0">
                <span
                  className="font-condensed font-bold text-sm truncate flex-1"
                  style={{ color: isHighlighted ? 'var(--gold-bright)' : 'var(--white)' }}
                  title={p.name}
                >
                  {p.name}
                </span>

                {/* YOU tag */}
                {isHighlighted && (
                  <span
                    className="font-condensed font-bold shrink-0"
                    style={{
                      fontSize: 9,
                      letterSpacing: '0.06em',
                      background: 'rgba(212,160,23,0.2)',
                      color: 'var(--gold-bright)',
                      border: '1px solid rgba(212,160,23,0.45)',
                      borderRadius: 3,
                      padding: '1px 4px',
                      lineHeight: 1.4,
                    }}
                  >
                    YOU
                  </span>
                )}
              </div>

              {/* Score */}
              <div
                className="font-display leading-none"
                style={{
                  fontSize: '1.6rem',
                  color: p.score < 0 ? '#e07070' : 'var(--gold-bright)',
                  fontVariantNumeric: 'tabular-nums',
                  letterSpacing: '-0.01em',
                }}
              >
                {formatScore(p.score)}
              </div>

              {/* State badges */}
              <div className="flex flex-wrap gap-1 mt-0.5" style={{ minHeight: 20 }}>
                {hasControl && (
                  <span
                    className="font-condensed font-bold"
                    style={{
                      fontSize: 9,
                      letterSpacing: '0.07em',
                      textTransform: 'uppercase',
                      background: 'rgba(0,200,180,0.15)',
                      color: '#40e0d0',
                      border: '1px solid rgba(0,200,180,0.4)',
                      borderRadius: 3,
                      padding: '1px 5px',
                      lineHeight: 1.5,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    BOARD CONTROL
                  </span>
                )}
                {isBuzzed && (
                  <span
                    className="font-condensed font-bold"
                    style={{
                      fontSize: 9,
                      letterSpacing: '0.07em',
                      textTransform: 'uppercase',
                      background: isFirst ? 'rgba(212,160,23,0.25)' : 'rgba(74,85,128,0.25)',
                      color: isFirst ? 'var(--gold-bright)' : '#8899cc',
                      border: `1px solid ${isFirst ? 'rgba(212,160,23,0.5)' : 'rgba(74,85,128,0.4)'}`,
                      borderRadius: 3,
                      padding: '1px 5px',
                      lineHeight: 1.5,
                    }}
                  >
                    {isFirst ? 'BUZZED' : `#${buzzPos + 1}`}
                  </span>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
