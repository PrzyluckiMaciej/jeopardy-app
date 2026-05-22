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
  /** Tighter cards for host view on laptop screens */
  compact?: boolean
}

export default function Scoreboard({
  players,
  buzzQueue = [],
  highlightId,
  boardControlId,
  activeEmojis = {},
  myPlayerId,
  onEmojiSelect,
  compact = false,
}: Props) {
  const [showPicker, setShowPicker] = useState(false)
  const sorted = [...players].sort((a, b) => b.score - a.score)

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

  const cardMin = compact ? 88 : 110
  const cardFlex = compact ? '1 1 88px' : '1 1 110px'
  const cardMax = compact ? 150 : 180
  const contentPad = compact ? 'px-2 pt-1.5 pb-1.5' : 'px-3 pt-2 pb-2'
  const scoreSize = compact ? '1.25rem' : undefined
  const nameClass = compact ? 'font-condensed font-bold text-xs' : 'font-condensed font-bold text-sm'
  const badgeMinH = compact ? 18 : 22
  const bottomBarH = compact ? 4 : 6

  return (
    <div className={`flex flex-wrap justify-center ${compact ? 'gap-2' : 'gap-3'}`}>
      {sorted.map((p) => {
        const buzzPos = buzzQueue.indexOf(p.id)
        const isBuzzed = buzzPos >= 0
        const isFirst = buzzPos === 0
        const isHighlighted = p.id === highlightId
        const hasControl = boardControlId != null && p.id === boardControlId
        const isMe = p.id === myPlayerId
        const reaction = activeEmojis[p.id]

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
              minWidth: cardMin,
              maxWidth: cardMax,
              flex: cardFlex,
              opacity: p.isConnected ? 1 : 0.5,
              background: isHighlighted
                ? 'rgba(212,160,23,0.13)'
                : isFirst
                ? 'rgba(212,160,23,0.07)'
                : 'var(--navy)',
              border: `1px solid ${isFirst ? 'rgba(212,160,23,0.45)' : 'var(--navy-light)'}`,
              borderRadius: 10,
              position: 'relative',
            }}
          >
            {/* Floating emoji reaction */}
            {reaction && (
              <div key={reaction.seq} className="emoji-float">
                {reaction.emoji}
              </div>
            )}

            {/* Top accent bar */}
            <div style={{ width: '100%', height: 3, background: accentColor, flexShrink: 0, borderRadius: '10px 10px 0 0' }} />

            {/* Content */}
            <div className={`flex flex-col items-center gap-0.5 w-full ${contentPad}`}>
              {/* Emoji picker button — only on the current player's own card */}
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

                  {/* Emoji picker popup */}
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

              {/* Name */}
              <div
                className={`${nameClass} text-center w-full truncate`}
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
                className={compact ? 'font-display leading-none' : 'font-display text-2xl leading-none'}
                style={{
                  color: p.score < 0 ? '#e07070' : 'var(--gold-bright)',
                  fontSize: scoreSize,
                }}
              >
                {formatScore(p.score)}
              </div>

              {/* Status badges */}
              <div className="flex flex-wrap gap-1 justify-center mt-0.5" style={{ minHeight: badgeMinH }}>
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
                height: bottomBarH,
                background: accentColor,
                opacity: 0.35,
                flexShrink: 0,
                borderRadius: '0 0 10px 10px',
              }}
            />
          </div>
        )
      })}
    </div>
  )
}
