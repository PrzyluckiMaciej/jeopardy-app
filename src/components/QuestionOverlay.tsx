import { useEffect, useRef, useState } from 'react'
import { Check, X, ArrowLeft, CheckCircle, Bell, Eye } from 'lucide-react'
import type { GameState, GameSettings } from '../types'
import { cellId } from '../lib/utils'
import * as net from '../lib/network'
import { useGameStore } from '../store/gameStore'
import { logEvent } from '../lib/logger'

interface Props {
  state: GameState
  settings: GameSettings
  onClose: () => void
}

export default function QuestionOverlay({ state, settings }: Props) {
  const { activeQuestion, phase, buzzQueue, players, activeMedia, dailyDouble } = state
  const store = useGameStore()
  const roomCode = useGameStore(s => s.roomCode) ?? ''

  // Exit animation state
  const [ddExiting, setDdExiting] = useState(false)
  const [overlayExiting, setOverlayExiting] = useState(false)
  const pendingOverlayAction = useRef<(() => void) | null>(null)
  const pendingDdAction = useRef<(() => void) | null>(null)
  const prevPhaseRef = useRef(phase)
  const [clueRevealKey, setClueRevealKey] = useState(0)
  const [answerRevealKey, setAnswerRevealKey] = useState(0)

  useEffect(() => {
    const prev = prevPhaseRef.current
    if (phase === 'question' && prev !== 'question' && prev !== 'buzzing' && prev !== 'revealed') {
      setClueRevealKey((k) => k + 1)
    }
    if (phase === 'revealed' && prev !== 'revealed') {
      setAnswerRevealKey((k) => k + 1)
    }
    prevPhaseRef.current = phase
  }, [phase])

  if (!activeQuestion) return null
  const { question, categoryId } = activeQuestion
  const isDD = dailyDouble !== null
  const ddPlayer = isDD ? players.find(p => p.id === dailyDouble.playerId) : null

  function handleStartBuzzing() {
    store.startBuzzing()
    net.broadcast({ type: 'START_BUZZING' })
  }

  function handleJudge(playerId: string, correct: boolean) {
    const player = players.find(p => p.id === playerId)
    let pointDelta: number

    if (isDD && dailyDouble.wager != null) {
      pointDelta = correct ? dailyDouble.wager : -dailyDouble.wager
      if (!correct && !settings.allowNegativeScore && player) {
        pointDelta = Math.max(pointDelta, -player.score)
      }
    } else {
      pointDelta = correct
        ? question.points
        : settings.pointDeduction
        ? -question.points
        : 0
      if (!correct && settings.pointDeduction && !settings.allowNegativeScore && player) {
        pointDelta = Math.max(pointDelta, -player.score)
      }
    }

    store.judgeAnswer(playerId, correct, pointDelta)
    net.broadcast({ type: 'JUDGE', playerId, correct, pointDelta, ...(correct && { boardControlId: playerId }) })
    const playerName = player?.name ?? playerId
    const newScore = (player?.score ?? 0) + pointDelta
    const pointLabel = pointDelta === 0
      ? 'no penalty'
      : pointDelta > 0
      ? `+$${pointDelta}`
      : `-$${Math.abs(pointDelta)}`
    const verdict = correct ? 'answered correctly' : 'answered incorrectly'
    logEvent({
      role: 'host',
      roomCode,
      actor: 'host',
      event: `${playerName} ${verdict} — ${pointLabel} (score: $${newScore}) | question: "${question.question}" ($${question.points})${isDD ? ' [Daily Double]' : ''}`,
    })
  }

  function handleRevealDailyDoubleClue() {
    // Trigger DD title exit animation; actual reveal happens in onAnimationEnd
    pendingDdAction.current = () => {
      store.revealDailyDoubleClue()
      net.broadcast({ type: 'DAILY_DOUBLE_REVEAL_CLUE' })
    }
    setDdExiting(true)
  }

  function handleReveal() {
    store.revealAnswer()
    net.broadcast({ type: 'REVEAL_ANSWER' })
  }

  function handleDismiss() {
    // Trigger overlay exit animation; actual close happens in onAnimationEnd
    pendingOverlayAction.current = () => {
      store.closeCard()
      net.broadcast({ type: 'CLOSE_CARD' })
    }
    setOverlayExiting(true)
  }

  function handleClose() {
    const cId = cellId(categoryId, question.id)
    // Trigger overlay exit animation; actual mark-answered happens in onAnimationEnd
    pendingOverlayAction.current = () => {
      store.markAnswered(cId)
      net.broadcast({ type: 'MARK_ANSWERED', cellId: cId })
    }
    setOverlayExiting(true)
  }

  const categoryName = state.board?.categories.find(c => c.id === categoryId)?.name ?? ''
  const showClue = phase === 'question' || phase === 'buzzing' || phase === 'revealed'

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col${overlayExiting ? ' question-overlay--exit' : ' question-overlay-enter'}`}
      style={{ background: 'rgba(6,11,40,0.97)', backdropFilter: 'blur(4px)' }}
      onAnimationEnd={(e) => {
        if (overlayExiting && e.animationName === 'overlayFadeOut' && e.target === e.currentTarget) {
          setOverlayExiting(false)
          if (pendingOverlayAction.current) {
            pendingOverlayAction.current()
            pendingOverlayAction.current = null
          }
        }
      }}
    >
      <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--navy-light)' }}>
        <div className="font-condensed font-bold uppercase tracking-wider" style={{ color: 'var(--gold)', fontSize: 14 }}>
          {categoryName}
          {categoryName && <span style={{ opacity: 0.5 }}> &nbsp;·&nbsp; </span>}
          <span className="font-display text-xl" style={{ color: 'var(--gold-bright)' }}>${question.points}</span>
          {isDD && <span style={{ color: 'var(--gold-bright)', marginLeft: 8 }}>DAILY DOUBLE</span>}
        </div>
        <div className="flex items-center gap-2">
          <button
            className="btn-ghost text-sm btn-with-icon"
            onClick={handleDismiss}
            title="Return to board without marking this question as used"
          >
            <ArrowLeft size={16} aria-hidden />
            <span>Dismiss</span>
          </button>
          <button
            className="btn-ghost text-sm btn-with-icon"
            style={{ color: 'var(--gold)' }}
            onClick={handleClose}
            title="Return to board and mark this question as answered"
          >
            <CheckCircle size={16} aria-hidden />
            <span>Answered</span>
          </button>
        </div>
      </div>

      <div className="flex-1 flex gap-6 p-6 min-h-0">
        {/* Main area */}
        <div className={`flex-1 flex flex-col items-center justify-center text-center ${overlayExiting ? 'card-flip-exit' : 'card-flip'}`}>
          {(phase === 'dailyDouble' || phase === 'dailyDoubleBet') && (
            <div
              className={`daily-double-title${ddExiting ? ' daily-double-title--exit' : ''}`}
              onAnimationEnd={(e) => {
                if (ddExiting && e.animationName === 'ddRevealFadeOut') {
                  setDdExiting(false)
                  if (pendingDdAction.current) {
                    pendingDdAction.current()
                    pendingDdAction.current = null
                  }
                }
              }}
            >
              DAILY DOUBLE!
            </div>
          )}

          {showClue && (
            <div key={`clue-${clueRevealKey}`} className="flex flex-col items-center w-full max-w-2xl">
              {activeMedia && (
                <div className="mb-6 clue-reveal">
                  {activeMedia.type === 'image' && (
                    <img src={activeMedia.dataUrl} className="max-h-48 rounded-lg object-contain mx-auto" alt="" />
                  )}
                  {activeMedia.type === 'audio' && (
                    <audio controls src={activeMedia.dataUrl} autoPlay className="mx-auto" />
                  )}
                  {activeMedia.type === 'video' && (
                    <video controls src={activeMedia.dataUrl} autoPlay className="max-h-48 rounded-lg mx-auto" />
                  )}
                </div>
              )}

              <div
                className={`font-condensed font-bold text-3xl md:text-4xl leading-snug mb-6 max-w-2xl${activeMedia ? '' : ' clue-reveal'}`}
                style={{ color: 'var(--white)' }}
              >
                {question.question || <span style={{ color: '#4a5580' }}>No question text</span>}
              </div>

              {phase === 'revealed' && (
                <div
                  key={`answer-${answerRevealKey}`}
                  className="font-display text-2xl md:text-3xl px-6 py-3 rounded-lg mt-2 answer-reveal"
                  style={{ background: 'rgba(212,160,23,0.15)', border: '2px solid var(--gold)', color: 'var(--gold-bright)' }}
                >
                  {question.answer || '—'}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Controls panel */}
        <div className="w-72 flex-shrink-0 flex flex-col gap-4">
          <div className="panel flex flex-col gap-3">
            <div className="font-condensed text-xs uppercase tracking-wider" style={{ color: 'var(--gold)', opacity: 0.7 }}>
              Controls
            </div>

            {/* DD: title phase — waiting for wager */}
            {isDD && phase === 'dailyDouble' && (
              <div className="text-sm font-condensed" style={{ color: '#8899cc' }}>
                Waiting for {ddPlayer?.name ?? 'player'} to wager…
              </div>
            )}

            {/* DD: bet received — host can reveal clue */}
            {isDD && phase === 'dailyDoubleBet' && dailyDouble.wager != null && (
              <>
                <div className="font-condensed text-sm" style={{ color: 'var(--gold-bright)' }}>
                  {ddPlayer?.name} wagered <span className="font-display text-lg">${dailyDouble.wager}</span>
                </div>
                <button className="btn-gold w-full py-3" onClick={handleRevealDailyDoubleClue}>
                  Reveal clue
                </button>
              </>
            )}

            {/* DD: question phase — judge the DD player directly */}
            {isDD && phase === 'question' && ddPlayer && (
              <div className="flex flex-col gap-2">
                <div className="font-condensed text-sm" style={{ color: 'var(--gold-bright)' }}>
                  {ddPlayer.name} wagered <span className="font-display">${dailyDouble.wager}</span>
                </div>
                <div className="flex gap-2">
                  <button
                    className="relative group w-8 h-8 rounded flex items-center justify-center"
                    style={{ background: 'rgba(39,174,96,0.2)', border: '1px solid var(--green)', color: '#4cd98a' }}
                    onClick={() => handleJudge(ddPlayer.id, true)}
                    aria-label="Accept answer"
                  >
                    <Check size={16} />
                    <span className="judge-tooltip judge-tooltip--accept" role="tooltip">Accept</span>
                  </button>
                  <button
                    className="relative group w-8 h-8 rounded flex items-center justify-center"
                    style={{ background: 'rgba(192,57,43,0.2)', border: '1px solid var(--red)', color: '#e07070' }}
                    onClick={() => handleJudge(ddPlayer.id, false)}
                    aria-label="Decline answer"
                  >
                    <X size={16} />
                    <span className="judge-tooltip judge-tooltip--decline" role="tooltip">Decline</span>
                  </button>
                </div>
              </div>
            )}

            {/* Normal: question phase — open for buzzing */}
            {!isDD && phase === 'question' && !settings.autoBuzzQueue && (
              <button
                className="btn-gold w-full py-3 btn-with-icon justify-center"
                onClick={handleStartBuzzing}
                title="Allow players to buzz in"
              >
                <Bell size={18} aria-hidden />
                <span>Open buzzing</span>
              </button>
            )}

            {/* Normal: buzzing phase */}
            {!isDD && phase === 'buzzing' && (
              <div className="text-sm font-condensed" style={{ color: '#8899cc' }}>
                {buzzQueue.length > 0 ? 'Judging…' : 'Waiting for buzzes…'}
              </div>
            )}

            {phase !== 'revealed' && phase !== 'dailyDouble' && phase !== 'dailyDoubleBet' && (
              <button
                className="btn-outline w-full btn-with-icon justify-center"
                onClick={handleReveal}
                title="Show the answer to players"
              >
                <Eye size={16} aria-hidden />
                <span>Reveal answer</span>
              </button>
            )}
          </div>

          {/* Buzz queue (hidden during DD) */}
          {!isDD && buzzQueue.length > 0 && (
            <div className="panel flex flex-col gap-2">
              <div className="font-condensed text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--gold)', opacity: 0.7 }}>
                Buzz queue
              </div>
              {buzzQueue.map((pid, idx) => {
                const p = players.find((pl) => pl.id === pid)
                if (!p) return null
                return (
                  <div key={pid} className="flex items-center gap-2">
                    <div className="flex-1">
                      <div className="font-condensed font-bold text-sm">{p.name}</div>
                      <div className="text-xs" style={{ color: 'var(--gold)' }}>
                        {p.score < 0 ? `-$${Math.abs(p.score)}` : `$${p.score}`}
                      </div>
                    </div>
                    {idx === 0 && phase === 'buzzing' && (
                      <div className="flex gap-2">
                        <button
                          className="relative group w-8 h-8 rounded flex items-center justify-center"
                          style={{ background: 'rgba(39,174,96,0.2)', border: '1px solid var(--green)', color: '#4cd98a' }}
                          onClick={() => handleJudge(pid, true)}
                          aria-label="Accept answer"
                        >
                          <Check size={16} />
                          <span className="judge-tooltip judge-tooltip--accept" role="tooltip">
                            Accept
                          </span>
                        </button>
                        <button
                          className="relative group w-8 h-8 rounded flex items-center justify-center"
                          style={{ background: 'rgba(192,57,43,0.2)', border: '1px solid var(--red)', color: '#e07070' }}
                          onClick={() => handleJudge(pid, false)}
                          aria-label="Decline answer"
                        >
                          <X size={16} />
                          <span className="judge-tooltip judge-tooltip--decline" role="tooltip">
                            Decline
                          </span>
                        </button>
                      </div>
                    )}
                    {idx > 0 && (
                      <div className="text-xs" style={{ color: '#4a5580' }}>#{idx + 1}</div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Scores */}
          <div className="panel flex flex-col gap-2 overflow-auto flex-1">
            <div className="font-condensed text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--gold)', opacity: 0.7 }}>Scores</div>
            {[...players].sort((a, b) => b.score - a.score).map((p) => (
              <div key={p.id} className="flex justify-between items-center">
                <span className="font-condensed text-sm truncate">{p.name}</span>
                <span className="font-display text-base" style={{ color: p.score < 0 ? '#e07070' : 'var(--gold-bright)' }}>
                  {p.score < 0 ? `-$${Math.abs(p.score)}` : `$${p.score}`}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
