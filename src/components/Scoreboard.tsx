import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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
  const [pickerPos, setPickerPos] = useState({ top: 0, left: 0 })
  const emojiBtnRef = useRef<HTMLButtonElement>(null)
  const sorted = [...players].sort((a, b) => b.score - a.score)

  useLayoutEffect(() => {
    if (!showPicker || !emojiBtnRef.current) return
    const rect = emojiBtnRef.current.getBoundingClientRect()
    setPickerPos({
      top: rect.top - 8,
      left: rect.left + rect.width / 2,
    })
  }, [showPicker])

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
    <div className="flex flex-wrap gap-3 justify-center" style={{ overflow: 'visible' }}>
      {sorted.map((p) => {
        const buzzPos = buzzQueue.indexOf(p.id)
        const isBuzzed = buzzPos >= 0
        const isFirst = buzzPos === 0
        const isHighlighted = p.id === highlightId
        const hasControl = boardControlId != null && p.id === boardControlId
        const isMe = p.id === myPlayerId
        const reaction = activeEmojis[p.id]

        const stripeColor = isFirst
          ? 'var(--gold)'
          : hasControl
          ? '#40e0d0'
          : isMe || isHighlighted
          ? 'rgba(255, 255, 255, 0.35)'
          : 'var(--border-subtle)'

        const cardBorderColor = isFirst
          ? 'rgba(212,160,23,0.55)'
          : hasControl
          ? 'rgba(0,200,180,0.45)'
          : isMe || isHighlighted
          ? 'rgba(255, 255, 255, 0.18)'
          : 'var(--border-default)'

        const cardStateClass = [
          !p.isConnected && 'scoreboard-card--offline',
          isFirst && 'scoreboard-card--buzzed-first',
          isMe && p.isConnected && 'scoreboard-card--me',
        ]
          .filter(Boolean)
          .join(' ')

        return (
          <div
            key={p.id}
            className={`flex transition-all ${cardStateClass}`}
            style={{
              minWidth: 110,
              maxWidth: 180,
              flex: '1 1 110px',
              background: isFirst
                ? 'rgba(212,160,23,0.07)'
                : hasControl
                ? 'rgba(0,200,180,0.05)'
                : 'var(--bg-elevated)',
              border: `1px solid ${cardBorderColor}`,
              borderRadius: 10,
              position: 'relative',
              overflow: 'visible',
            }}
          >
            {reaction && (
              <div key={reaction.seq} className="emoji-float">
                {reaction.emoji}
              </div>
            )}

            <div
              className="scoreboard-card-stripe"
              style={{
                width: 4,
                background: p.isConnected ? stripeColor : 'var(--border-subtle)',
                flexShrink: 0,
                borderRadius: '10px 0 0 10px',
                transition: 'background 0.3s',
              }}
            />

            <div
              className="relative flex flex-col items-center text-center gap-1.5 w-full min-w-0"
              style={{ padding: '12px 16px 14px' }}
            >
              <span
                title={p.isConnected ? 'Online' : 'Offline'}
                className="absolute"
                style={{
                  top: 10,
                  right: 12,
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: p.isConnected ? 'var(--success)' : '#3a3f5c',
                  boxShadow: p.isConnected ? '0 0 5px rgba(34,197,94,0.55)' : 'none',
                }}
              />

              {isMe && onEmojiSelect && (
                <div className="relative flex justify-center w-full">
                  <button
                    ref={emojiBtnRef}
                    onClick={() => setShowPicker((v) => !v)}
                    title="Send an emoji reaction"
                    style={{
                      background: showPicker ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.07)',
                      border: `1px solid ${showPicker ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.15)'}`,
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

                  {showPicker &&
                    createPortal(
                      <div
                        className="scoreboard-emoji-popover"
                        style={{
                          position: 'fixed',
                          top: pickerPos.top,
                          left: pickerPos.left,
                          transform: 'translate(-50%, -100%)',
                          bottom: 'auto',
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
                      </div>,
                      document.body,
                    )}
                </div>
              )}

              <div
                className="font-condensed font-bold text-sm text-center w-full truncate px-1"
                style={{ color: 'var(--white)' }}
                title={p.name}
              >
                {p.name}
              </div>

              <div
                className="font-display leading-none text-center"
                style={{
                  fontSize: '1.6rem',
                  color: p.score < 0 ? '#e07070' : 'var(--gold-bright)',
                  fontVariantNumeric: 'tabular-nums',
                  letterSpacing: '-0.01em',
                }}
              >
                {formatScore(p.score)}
              </div>

              <div className="flex flex-wrap gap-1 justify-center mt-0.5" style={{ minHeight: 20 }}>
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
