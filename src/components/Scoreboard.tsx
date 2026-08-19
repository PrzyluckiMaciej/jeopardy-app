import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { Smile, Crown } from 'lucide-react'
import { formatScore, orderPlayersForDisplay } from '../lib/utils'
import type { Player } from '../types'

const EMOJIS = ['😂', '😎', '😠', '🤡', '😮', '🤨', '😴', '😍', '💩', '👍', '👎', '👏']

function isPainted(el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect()
  if (rect.width < 2 || rect.height < 2) return false
  let node: HTMLElement | null = el
  while (node && node !== document.documentElement) {
    const style = getComputedStyle(node)
    if (style.display === 'none' || style.visibility === 'hidden') return false
    const opacity = Number.parseFloat(style.opacity)
    if (Number.isFinite(opacity) && opacity === 0) return false
    if (node !== el) {
      const clipsY = style.overflowY === 'hidden' || style.overflowY === 'auto' || style.overflowY === 'scroll'
      const clipsX = style.overflowX === 'hidden' || style.overflowX === 'auto' || style.overflowX === 'scroll'
      if (clipsX || clipsY) {
        const parentRect = node.getBoundingClientRect()
        const visibleH = Math.min(rect.bottom, parentRect.bottom) - Math.max(rect.top, parentRect.top)
        const visibleW = Math.min(rect.right, parentRect.right) - Math.max(rect.left, parentRect.left)
        if (visibleH < 8 || visibleW < 8) return false
      }
    }
    node = node.parentElement
  }
  return true
}

function paintedQuery(selector: string, root: ParentNode = document): HTMLElement | null {
  const nodes = root.querySelectorAll<HTMLElement>(selector)
  for (const node of nodes) {
    if (isPainted(node)) return node
  }
  return null
}

type AnchorPos = { x: number; y: number }
type DockBox = { bottom: number; left: number; width: number }

function findMobilePlayersToggle(root: HTMLElement | null): HTMLElement | null {
  const panel = root?.closest('.mobile-players-collapsible')?.parentElement
  const toggle = panel?.querySelector<HTMLElement>('.mobile-players-toggle')
  return toggle && isPainted(toggle) ? toggle : null
}

function anchorPosForElement(anchor: HTMLElement): AnchorPos {
  const rect = anchor.getBoundingClientRect()
  let y = rect.top
  if (anchor.closest('.player-topbar')) {
    y = Math.max(y, 52)
  }
  return { x: rect.left + rect.width / 2, y }
}

function posNear(a: AnchorPos, b: AnchorPos): boolean {
  return Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5
}

function dockNear(a: DockBox, b: DockBox): boolean {
  return (
    Math.abs(a.bottom - b.bottom) < 0.5 &&
    Math.abs(a.left - b.left) < 0.5 &&
    Math.abs(a.width - b.width) < 0.5
  )
}

function measureEmojiReactionLayout(
  ids: string[],
  root: HTMLElement | null,
  myPlayerId: string | undefined,
): { floatPos: Record<string, AnchorPos>; dockBox: DockBox | null } {
  const floatPos: Record<string, AnchorPos> = {}
  let needsDock = false

  for (const id of ids) {
    const playerEl = root ? paintedQuery(`[data-scoreboard-player="${id}"]`, root) : null
    const nameEl = playerEl?.querySelector<HTMLElement>('[data-scoreboard-player-name]')
    const selfTopbar = id === myPlayerId ? paintedQuery('.player-topbar') : null
    const anchor =
      nameEl && isPainted(nameEl) ? nameEl : playerEl && isPainted(playerEl) ? playerEl : selfTopbar
    if (anchor) {
      floatPos[id] = anchorPosForElement(anchor)
    } else {
      needsDock = true
    }
  }

  if (!needsDock) {
    return { floatPos, dockBox: null }
  }

  const toggle = findMobilePlayersToggle(root)
  if (!toggle) {
    return { floatPos, dockBox: null }
  }

  const rect = toggle.getBoundingClientRect()
  return {
    floatPos,
    dockBox: {
      bottom: window.innerHeight - rect.top + 8,
      left: rect.left,
      width: rect.width,
    },
  }
}

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
  const [floatPos, setFloatPos] = useState<Record<string, AnchorPos>>({})
  const [dockBox, setDockBox] = useState<DockBox | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
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
  const displayPlayers = orderPlayersForDisplay(
    players.filter((p) => !p.isSpectator),
    myPlayerId,
  )
  const hasActiveEmojiReactions = Object.keys(activeEmojis).length > 0

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

  useLayoutEffect(() => {
    const ids = Object.keys(activeEmojis)
    if (ids.length === 0) return

    let rafId = 0

    const applyMeasure = () => {
      const { floatPos: next, dockBox: nextDock } = measureEmojiReactionLayout(
        ids,
        rootRef.current,
        myPlayerId,
      )

      setFloatPos((prev) => {
        const prevKeys = Object.keys(prev)
        const nextKeys = Object.keys(next)
        if (
          prevKeys.length === nextKeys.length &&
          nextKeys.every((k) => prev[k] && next[k] && posNear(prev[k], next[k]))
        ) {
          return prev
        }
        return next
      })

      setDockBox((prev) => {
        if (!nextDock) return prev ? null : prev
        if (prev && dockNear(prev, nextDock)) return prev
        return nextDock
      })
    }

    const scheduleMeasure = () => {
      if (rafId) return
      rafId = requestAnimationFrame(() => {
        rafId = 0
        applyMeasure()
      })
    }

    scheduleMeasure()

    window.addEventListener('resize', scheduleMeasure)
    window.addEventListener('scroll', scheduleMeasure, true)

    const collapsible = rootRef.current?.closest('.mobile-players-collapsible')
    collapsible?.addEventListener('transitionend', scheduleMeasure)

    const observed = new Set<Element>()
    const resizeObserver = new ResizeObserver(scheduleMeasure)
    const observe = (el: Element | null | undefined) => {
      if (!el || observed.has(el)) return
      observed.add(el)
      resizeObserver.observe(el)
    }

    observe(rootRef.current)
    observe(collapsible)
    observe(document.querySelector('.player-topbar'))

    return () => {
      if (rafId) cancelAnimationFrame(rafId)
      window.removeEventListener('resize', scheduleMeasure)
      window.removeEventListener('scroll', scheduleMeasure, true)
      collapsible?.removeEventListener('transitionend', scheduleMeasure)
      resizeObserver.disconnect()
    }
  }, [activeEmojis, myPlayerId])

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

  const layoutFloatPos = hasActiveEmojiReactions ? floatPos : {}
  const layoutDockBox = hasActiveEmojiReactions ? dockBox : null

  const dockReactions = displayPlayers.filter(
    (p) => activeEmojis[p.id] && !layoutFloatPos[p.id],
  )

  const emojiReactionPortal = createPortal(
    <>
      {displayPlayers.map((p) => {
        const reaction = activeEmojis[p.id]
        const pos = layoutFloatPos[p.id]
        if (!reaction || !pos) return null
        return (
          <div
            key={`${p.id}-${reaction.seq}`}
            className="emoji-float emoji-float--fixed"
            aria-hidden
            style={{
              '--emoji-x': `${pos.x}px`,
              '--emoji-y': `${pos.y}px`,
            } as CSSProperties}
          >
            {reaction.emoji}
          </div>
        )
      })}
      {layoutDockBox && dockReactions.length > 0 && (
        <div
          className="mobile-emoji-dock"
          style={{
            bottom: layoutDockBox.bottom,
            left: layoutDockBox.left,
            width: layoutDockBox.width,
          }}
        >
          {dockReactions.map((p) => {
            const reaction = activeEmojis[p.id]
            if (!reaction) return null
            return (
              <div key={`${p.id}-${reaction.seq}`} className="mobile-emoji-dock__item">
                <div className="emoji-float">{reaction.emoji}</div>
                <span className="mobile-emoji-dock__name">{p.name}</span>
              </div>
            )
          })}
        </div>
      )}
    </>,
    document.body,
  )

  return (
    <div className="scoreboard" ref={rootRef}>
      {/* Desktop / tablet: horizontal cards */}
      <div className="scoreboard--cards">
        {displayPlayers.map((p) => {
          const st = playerState(p, buzzQueue, highlightId, boardControlId, myPlayerId)

          return (
            <div
              key={p.id}
              data-scoreboard-player={p.id}
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
              }}
            >
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
                className="relative flex flex-col flex-1 items-center text-center gap-1.5 w-full min-w-0"
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

                <div
                  className="scoreboard-card__name text-center w-full truncate px-1"
                  data-scoreboard-player-name
                  title={p.name}
                >
                  {p.name}
                </div>

                <div
                  className={`scoreboard-card__score leading-none text-center${pulsingIds.has(p.id) ? ' score-pulse' : ''}`}
                  style={{
                    color: p.score < 0 ? '#e07070' : 'var(--gold-bright)',
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

                {st.isMe && onEmojiSelect && (
                  <div className="relative flex justify-center w-full mt-auto">
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
              </div>
            </div>
          )
        })}
      </div>

      {/* Mobile: compact list */}
      <div className="scoreboard--list">
        {displayPlayers.map((p) => {
          const st = playerState(p, buzzQueue, highlightId, boardControlId, myPlayerId)

          return (
            <div
              key={p.id}
              data-scoreboard-player={p.id}
              className={`scoreboard-list-item ${st.listStateClass}`}
            >
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
                  <span
                    className="scoreboard-list-item__name"
                    data-scoreboard-player-name
                    title={p.name}
                  >
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
      {emojiReactionPortal}
    </div>
  )
}
