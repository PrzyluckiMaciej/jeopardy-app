import { Check, X, ListOrdered } from 'lucide-react'
import type { Player } from '../types'

export interface PlayerActionZoneProps {
  canShowBuzzDock: boolean
  /** Keep the action slot mounted during question phases (e.g. while judge feedback is pending). */
  keepVisible?: boolean
  revealedPhase?: boolean
  judgeResult: 'correct' | 'wrong' | null
  buzzingOpen: boolean
  hasBuzzed: boolean
  isMyTurn: boolean
  myQueuePosition: number
  buzzQueueLength: number
  onBuzz: () => void
  showBuzzQueueMobileToggle: boolean
  buzzQueuePopupActive: boolean
  buzzQueuePopupVisible: boolean
  onToggleBuzzQueuePopup: () => void
  onBuzzQueuePopupTransitionEnd: (e: React.TransitionEvent<HTMLDivElement>) => void
  buzzQueue: string[]
  players: Player[]
  myId: string
}

export default function PlayerActionZone({
  canShowBuzzDock,
  keepVisible = false,
  revealedPhase = false,
  judgeResult,
  buzzingOpen,
  hasBuzzed,
  isMyTurn,
  myQueuePosition,
  buzzQueueLength,
  onBuzz,
  showBuzzQueueMobileToggle,
  buzzQueuePopupActive,
  buzzQueuePopupVisible,
  onToggleBuzzQueuePopup,
  onBuzzQueuePopupTransitionEnd,
  buzzQueue,
  players,
  myId,
}: PlayerActionZoneProps) {
  const showSlot = canShowBuzzDock || judgeResult != null || revealedPhase || keepVisible
  if (!showSlot) return null

  const showBuzzButton = canShowBuzzDock && !judgeResult && !(revealedPhase && !judgeResult)

  const buzzHint = revealedPhase && !judgeResult
    ? '\u00a0'
    : !buzzingOpen
      ? 'Waiting for host to open buzzing…'
      : !hasBuzzed
        ? buzzQueueLength > 0
          ? `${buzzQueueLength} player${buzzQueueLength > 1 ? 's' : ''} buzzed`
          : 'Be first to buzz!'
        : null

  return (
    <div className="player-action-zone" data-mobile-dock>
      <div className="player-action-zone__cluster">
        {showBuzzQueueMobileToggle && buzzQueuePopupActive && (
          <div
            className={`player-buzz-queue-popup panel flex flex-col gap-2${buzzQueuePopupVisible ? ' player-buzz-queue-popup--visible' : ''}`}
            role="dialog"
            aria-label="Buzz queue"
            aria-hidden={!buzzQueuePopupVisible}
            onTransitionEnd={onBuzzQueuePopupTransitionEnd}
          >
            <div className="buzz-queue-panel__label font-condensed text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--gold)', opacity: 0.7 }}>
              Buzz queue
            </div>
            {buzzQueue.length === 0 ? (
              <div className="font-condensed text-xs text-center" style={{ color: '#4a5580' }}>
                No one in queue
              </div>
            ) : (
              buzzQueue.map((pid, idx) => {
                const p = players.find((pl) => pl.id === pid)
                if (!p) return null
                return (
                  <div key={pid} className="buzz-queue-entry">
                    <span className="buzz-queue-entry__score text-xs">
                      {p.score < 0 ? `-$${Math.abs(p.score)}` : `$${p.score}`}
                    </span>
                    <span
                      className="buzz-queue-entry__name font-condensed font-bold text-sm"
                      style={{ color: pid === myId ? 'var(--gold-bright)' : undefined }}
                    >
                      {p.name}{pid === myId ? ' (you)' : ''}
                    </span>
                    <span className="buzz-queue-entry__rank text-xs">#{idx + 1}</span>
                  </div>
                )
              })
            )}
          </div>
        )}
        <div className="player-action-zone__row">
          <div className="player-action-zone__slot">
            <div className="player-action-zone__stack">
              {judgeResult ? (
                <div
                  key={judgeResult}
                  className="player-judge-result player-judge-result--enter font-display text-center"
                  data-result={judgeResult}
                  role="status"
                  aria-live="polite"
                >
                  {judgeResult === 'correct' ? (
                    <span className="inline-flex items-center justify-center gap-2">
                      <Check size={22} aria-hidden />
                      Correct!
                    </span>
                  ) : (
                    <span className="inline-flex items-center justify-center gap-2">
                      <X size={22} aria-hidden />
                      Wrong
                    </span>
                  )}
                </div>
              ) : showBuzzButton ? (
                <button
                  type="button"
                  className={[
                    'player-buzz-btn font-display',
                    !buzzingOpen
                      ? 'player-buzz-btn--waiting'
                      : hasBuzzed
                        ? isMyTurn
                          ? 'player-buzz-btn--my-turn'
                          : 'player-buzz-btn--queued'
                        : 'player-buzz-btn--ready buzz-btn',
                  ].join(' ')}
                  onClick={onBuzz}
                  disabled={!buzzingOpen || hasBuzzed}
                  aria-disabled={!buzzingOpen || hasBuzzed}
                >
                  {hasBuzzed
                    ? isMyTurn
                      ? (
                        <span className="player-buzz-btn__turn-label">
                          <span>Your</span>
                          <span>turn</span>
                        </span>
                      )
                      : `#${myQueuePosition} in queue`
                    : 'BUZZ!'}
                </button>
              ) : (
                <div className="player-buzz-btn player-buzz-btn--placeholder" aria-hidden />
              )}
            </div>
            <div className="player-buzz-dock__hint font-condensed text-sm text-center" aria-hidden={judgeResult ? true : undefined}>
              {judgeResult ? '\u00a0' : buzzHint}
            </div>
          </div>
          {showBuzzQueueMobileToggle && (
            <button
              type="button"
              className="player-buzz-queue-toggle"
              onClick={onToggleBuzzQueuePopup}
              aria-expanded={buzzQueuePopupVisible}
              aria-label={buzzQueuePopupVisible ? 'Hide buzz queue' : 'Show buzz queue'}
              title={buzzQueuePopupVisible ? 'Hide buzz queue' : 'Show buzz queue'}
            >
              <ListOrdered size={20} aria-hidden />
              <span className="player-buzz-queue-toggle__count">{buzzQueue.length}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
