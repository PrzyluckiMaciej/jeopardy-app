import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Smile, Crown } from 'lucide-react'
import { formatScore } from '../lib/utils'
import type { Player } from '../types'

const EMOJIS = ['😂', '😎', '😠', '🤡', '😮', '🤨', '😴', '😍', '👍', '👎']

const badgeStyle = {
  fontSize: 9,
  letterSpacing: '0.07em',
  textTransform: 'uppercase' as const,
  borderRadius: 3,
  padding: '1px 5px',
  lineHeight: 1.5,
  whiteSpace: 'nowrap' as const,
}

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

function playerState(
  p: Player,
  buzzQueue: string[],
  highlightId: string | undefined,
  boardControlId: string | null | undefined,
  myPlayerId: string | undefined,
) {
  const buzzPos = buzzQueue.indexOf(p.id)
  const isBuzzed = buzzPos >= 0
  const isFirst = buzzPos === 0
  const isHighlighted = p.id === highlightId
  const hasControl = boardControlId != null && p.id === boardControlId
  const isMe = p.id === myPlayerId

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

  const cardBg = isFirst
    ? 'rgba(212,160,23,0.07)'
    : hasControl
    ? 'rgba(0,200,180,0.05)'
    : 'var(--bg-elevated)'

  const cardStateClass = [
    !p.isConnected && 'scoreboard-card--offline',
    isFirst && 'scoreboard-card--buzzed-first',
    isMe && p.isConnected && 'scoreboard-card--me',
  ]
    .filter(Boolean)
    .join(' ')

  const listStateClass = [
    !p.isConnected && 'scoreboard-list-item--offline',
    isFirst && 'scoreboard-list-item--buzzed-first',
    hasControl && 'scoreboard-list-item--control',
  ]
    .filter(Boolean)
    .join(' ')

  return {
    buzzPos,
    isBuzzed,
    isFirst,
    isHighlighted,
    hasControl,
    isMe,
    stripeColor,
    cardBorderColor,
    cardBg,
    cardStateClass,
    listStateClass,
  }
}

function StatusBadges({
  hasControl,
  isBuzzed,
  isFirst,
  buzzPos,
}: {
  hasControl: boolean
  isBuzzed: boolean
  isFirst: boolean
  buzzPos: number
}) {
  return (
    <>
      {hasControl && (
        <span
          className="inline-flex items-center justify-center"
          title="Board control"
          aria-label="Board control"
          style={{
            ...badgeStyle,
            background: 'rgba(0,200,180,0.15)',
            color: '#40e0d0',
            border: '1px solid rgba(0,200,180,0.4)',
            padding: '2px 5px',
          }}
        >
          <Crown size={12} aria-hidden />
        </span>
      )}
      {isBuzzed && (
        <span
          className="font-condensed font-bold"
          style={{
            ...badgeStyle,
            background: isFirst ? 'rgba(212,160,23,0.25)' : 'rgba(74,85,128,0.25)',
            color: isFirst ? 'var(--gold-bright)' : '#8899cc',
            border: `1px solid ${isFirst ? 'rgba(212,160,23,0.5)' : 'rgba(74,85,128,0.4)'}`,
          }}
        >
          {isFirst ? 'BUZZED' : `#${buzzPos + 1}`}
        </span>
      )}
    </>
  )
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
  const emojiBtnCardsRef = useRef<HTMLButtonElement>(null)
  const emojiBtnListRef = useRef<HTMLButtonElement>(null)

  function visibleEmojiButton(): HTMLButtonElement | null {
    for (const btn of [emojiBtnCardsRef.current, emojiBtnListRef.current]) {
      if (!btn) continue
      const { width, height } = btn.getBoundingClientRect()
      if (width > 0 && height > 0) return btn
    }
    return null
  }
  const sorted = [...players].sort((a, b) => b.score - a.score)

  const prevScores = useRef<Record<string, number>>({})
  const [pulsingIds, setPulsingIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    const changed = new Set<string>()
    players.forEach((p) => {
      if (prevScores.current[p.id] !== undefined && prevScores.current[p.id] !== p.score) {
        changed.add(p.id)
      }
      prevScores.current[p.id] = p.score
    })
    if (changed.size > 0) {
      setPulsingIds((prev) => new Set([...prev, ...changed]))
    }
  }, [players])

  useLayoutEffect(() => {
    if (!showPicker) return
    const updatePos = () => {
      const btn = visibleEmojiButton()
      if (!btn) return
      const rect = btn.getBoundingClientRect()
      setPickerPos({
        top: rect.top - 8,
        left: rect.left + rect.width / 2,
      })
    }
    updatePos()
    window.addEventListener('resize', updatePos)
    return () => window.removeEventListener('resize', updatePos)
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

  function clearPulse(id: string) {
    setPulsingIds((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

  const emojiPickerPortal =
    showPicker &&
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
            type="button"
            className="touch-target-emoji"
            onClick={() => handleEmojiClick(e)}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontSize: '1.4rem',
              padding: '6px 8px',
              borderRadius: 6,
              lineHeight: 1,
              minWidth: 44,
              minHeight: 44,
            }}
          >
            {e}
          </button>
        ))}
      </div>,
      document.body,
    )

  return (
    <div className="scoreboard">
      {/* Desktop / tablet: horizontal cards */}
      <div className="scoreboard--cards">
        {sorted.map((p) => {
          const st = playerState(p, buzzQueue, highlightId, boardControlId, myPlayerId)
          const reaction = activeEmojis[p.id]

          return (
            <div
              key={p.id}
              className={`flex ${st.cardStateClass}`}
              style={{
                minWidth: 110,
                maxWidth: 180,
                flex: '1 1 110px',
                background: st.cardBg,
                border: `1px solid ${st.cardBorderColor}`,
                borderRadius: 10,
                position: 'relative',
                overflow: 'visible',
                transition: 'border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease, opacity 0.15s ease',
                zIndex: reaction ? 10 : undefined,
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
                  background: p.isConnected ? st.stripeColor : 'var(--border-subtle)',
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

                {st.isMe && onEmojiSelect && (
                  <div className="relative flex justify-center w-full">
                    <button
                      ref={emojiBtnCardsRef}
                      type="button"
                      onClick={() => setShowPicker((v) => !v)}
                      title="Send an emoji reaction"
                      aria-label="Send an emoji reaction"
                      className="flex items-center justify-center btn-icon-only"
                      style={{
                        background: showPicker ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.07)',
                        border: `1px solid ${showPicker ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.15)'}`,
                        borderRadius: 6,
                        color: 'var(--white)',
                      }}
                    >
                      <Smile size={16} aria-hidden />
                    </button>
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
                  className={`font-display leading-none text-center${pulsingIds.has(p.id) ? ' score-pulse' : ''}`}
                  style={{
                    fontSize: '1.6rem',
                    color: p.score < 0 ? '#e07070' : 'var(--gold-bright)',
                    fontVariantNumeric: 'tabular-nums',
                    letterSpacing: '-0.01em',
                  }}
                  onAnimationEnd={() => clearPulse(p.id)}
                >
                  {formatScore(p.score)}
                </div>

                <div className="flex flex-wrap gap-1 justify-center mt-0.5" style={{ minHeight: 20 }}>
                  <StatusBadges
                    hasControl={st.hasControl}
                    isBuzzed={st.isBuzzed}
                    isFirst={st.isFirst}
                    buzzPos={st.buzzPos}
                  />
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Mobile: compact list */}
      <div className="scoreboard--list">
        {sorted.map((p) => {
          const st = playerState(p, buzzQueue, highlightId, boardControlId, myPlayerId)
          const reaction = activeEmojis[p.id]

          return (
            <div key={p.id} className={`scoreboard-list-item ${st.listStateClass}`}>
              {reaction && (
                <div key={reaction.seq} className="emoji-float">
                  {reaction.emoji}
                </div>
              )}
              <div
                className="scoreboard-list-item__stripe"
                style={{
                  background: p.isConnected ? st.stripeColor : 'var(--border-subtle)',
                }}
              />
              <div className="scoreboard-list-item__body">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span
                    title={p.isConnected ? 'Online' : 'Offline'}
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      flexShrink: 0,
                      background: p.isConnected ? 'var(--success)' : '#3a3f5c',
                    }}
                  />
                  <span className="scoreboard-list-item__name" title={p.name}>
                    {p.name}
                  </span>
                  {st.isMe && onEmojiSelect && (
                    <button
                      ref={emojiBtnListRef}
                      type="button"
                      onClick={() => setShowPicker((v) => !v)}
                      aria-label="Send an emoji reaction"
                      className="btn-icon-only flex-shrink-0"
                      style={{
                        background: 'rgba(255,255,255,0.08)',
                        border: '1px solid rgba(255,255,255,0.15)',
                        borderRadius: 6,
                        color: 'var(--white)',
                      }}
                    >
                      <Smile size={16} aria-hidden />
                    </button>
                  )}
                </div>
                <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                  <div
                    className={`scoreboard-list-item__score${pulsingIds.has(p.id) ? ' score-pulse' : ''}`}
                    style={{ color: p.score < 0 ? '#e07070' : 'var(--gold-bright)' }}
                    onAnimationEnd={() => clearPulse(p.id)}
                  >
                    {formatScore(p.score)}
                  </div>
                  <div className="scoreboard-list-item__badges">
                    <StatusBadges
                      hasControl={st.hasControl}
                      isBuzzed={st.isBuzzed}
                      isFirst={st.isFirst}
                      buzzPos={st.buzzPos}
                    />
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {emojiPickerPortal}
    </div>
  )
}
