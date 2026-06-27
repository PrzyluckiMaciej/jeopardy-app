import { useEffect, useRef, useState } from 'react'
import { Check, X, ArrowLeft, CheckCircle, Bell, Eye } from 'lucide-react'
import type { GameState, GameSettings } from '../types'
import { cellId, formatScore } from '../lib/utils'
import * as net from '../lib/network'
import { useGameStore } from '../store/gameStore'
import { logEvent } from '../lib/logger'
import QuestionMediaPlayer from './QuestionMediaPlayer'

interface Props {
  state: GameState
  settings: GameSettings
  onClose: () => void
}

export default function QuestionOverlay({ state, settings }: Props) {
  const { activeQuestion, phase, buzzQueue, players, activeMedia, mediaPlayback, dailyDouble } = state
  const store = useGameStore()
  const roomCode = useGameStore(s => s.roomCode) ?? ''

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
    pendingOverlayAction.current = () => {
      store.closeCard()
      net.broadcast({ type: 'CLOSE_CARD' })
    }
    setOverlayExiting(true)
  }

  function handleClose() {
    const cId = cellId(categoryId, question.id)
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
      className={`question-overlay-backdrop fixed inset-0 z-50 flex flex-col${overlayExiting ? ' question-overlay--exit' : ' question-overlay-enter'}`}
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
      <header className="question-overlay-header">
        <div className="question-overlay-header__meta min-w-0">
          {categoryName}
          {categoryName && <span className="opacity-50"> &nbsp;·&nbsp; </span>}
          <span className="question-overlay-header__points">${question.points}</span>
          {isDD && <span className="question-overlay-header__dd">DAILY DOUBLE</span>}
        </div>
        <div className="question-overlay-header__actions">
          <button
            className="btn-ghost text-sm btn-with-icon"
            onClick={handleDismiss}
            title="Return to board without marking this question as used"
          >
            <ArrowLeft size={16} aria-hidden />
            <span>Dismiss</span>
          </button>
          <button
            className="btn-ghost text-sm btn-with-icon text-gold"
            onClick={handleClose}
            title="Return to board and mark this question as answered"
          >
            <CheckCircle size={16} aria-hidden />
            <span>Answered</span>
          </button>
        </div>
      </header>

      <div className="question-overlay-layout">
        <div className={`question-overlay-main ${overlayExiting ? 'card-flip-exit' : 'card-flip'}`}>
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
            <div key={`clue-${clueRevealKey}`} className="question-overlay-content flex flex-col items-center w-full max-w-2xl">
              {activeMedia && (
                <QuestionMediaPlayer
                  media={activeMedia}
                  role="host"
                  playback={mediaPlayback}
                  mountKey={clueRevealKey}
                  mediaActive={showClue && !overlayExiting}
                  className="question-overlay-media clue-reveal"
                />
              )}

              <div
                className={`question-overlay-clue font-condensed font-bold text-3xl md:text-4xl leading-snug max-w-2xl${activeMedia ? '' : ' clue-reveal'}`}
              >
                {question.question}
              </div>

              <div
                key={phase === 'revealed' ? `answer-${answerRevealKey}` : 'answer-pending'}
                className={`question-overlay-answer font-display text-2xl md:text-3xl${
                  phase === 'revealed' ? ' answer-reveal' : ' question-overlay-answer--pending'
                }`}
              >
                {question.answer || '—'}
              </div>
            </div>
          )}
        </div>

        <aside className="question-overlay-sidebar">
          <div className="panel flex flex-col gap-3">
            <div className="font-condensed text-xs uppercase tracking-wider text-gold opacity-70">
              Controls
            </div>

            {isDD && phase === 'dailyDouble' && (
              <div className="text-sm font-condensed text-subtle">
                Waiting for {ddPlayer?.name ?? 'player'} to wager…
              </div>
            )}

            {isDD && phase === 'dailyDoubleBet' && dailyDouble.wager != null && (
              <>
                <div className="font-condensed text-sm text-gold-bright">
                  {ddPlayer?.name} wagered <span className="font-display text-lg">${dailyDouble.wager}</span>
                </div>
                <button type="button" className="btn-gold w-full py-3" onClick={handleRevealDailyDoubleClue}>
                  Reveal clue
                </button>
              </>
            )}

            {isDD && phase === 'question' && ddPlayer && (
              <div className="flex flex-col gap-2">
                <div className="font-condensed text-sm text-gold-bright">
                  {ddPlayer.name} wagered <span className="font-display">${dailyDouble.wager}</span>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="w-8 h-8 rounded flex items-center justify-center judge-btn--accept"
                    onClick={() => handleJudge(ddPlayer.id, true)}
                    title="Accept answer"
                    aria-label="Accept answer"
                  >
                    <Check size={16} />
                  </button>
                  <button
                    type="button"
                    className="w-8 h-8 rounded flex items-center justify-center judge-btn--decline"
                    onClick={() => handleJudge(ddPlayer.id, false)}
                    title="Decline answer"
                    aria-label="Decline answer"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
            )}

            {!isDD && phase === 'question' && !settings.autoBuzzQueue && (
              <button
                type="button"
                className="btn-gold w-full py-3 btn-with-icon justify-center"
                onClick={handleStartBuzzing}
                title="Allow players to buzz in"
              >
                <Bell size={18} aria-hidden />
                <span>Open buzzing</span>
              </button>
            )}

            {!isDD && phase === 'buzzing' && (
              <div className="text-sm font-condensed text-subtle">
                {buzzQueue.length > 0 ? 'Judging…' : 'Waiting for buzzes…'}
              </div>
            )}

            {phase !== 'revealed' && phase !== 'dailyDouble' && phase !== 'dailyDoubleBet' && (
              <button
                type="button"
                className="btn-outline w-full btn-with-icon justify-center"
                onClick={handleReveal}
                title="Show the answer to players"
              >
                <Eye size={16} aria-hidden />
                <span>Reveal answer</span>
              </button>
            )}
          </div>

          {!isDD && buzzQueue.length > 0 && (
            <div key="buzz-queue" className="panel panel--buzz-queue overlay-sidebar-enter flex flex-col gap-2">
              <div className="font-condensed text-xs uppercase tracking-wider mb-1 text-gold opacity-70">
                Buzz queue
              </div>
              {buzzQueue.map((pid, idx) => {
                const p = players.find((pl) => pl.id === pid)
                if (!p) return null
                return (
                  <div key={pid} className="flex items-center gap-2">
                    <div className="flex-1">
                      <div className="font-condensed font-bold text-sm">{p.name}</div>
                      <div className={`text-xs ${p.score < 0 ? 'text-score-negative' : 'text-gold'}`}>
                        {formatScore(p.score)}
                      </div>
                    </div>
                    {idx === 0 && phase === 'buzzing' && (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="w-8 h-8 rounded flex items-center justify-center judge-btn--accept"
                          onClick={() => handleJudge(pid, true)}
                          title="Accept answer"
                          aria-label="Accept answer"
                        >
                          <Check size={16} />
                        </button>
                        <button
                          type="button"
                          className="w-8 h-8 rounded flex items-center justify-center judge-btn--decline"
                          onClick={() => handleJudge(pid, false)}
                          title="Decline answer"
                          aria-label="Decline answer"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    )}
                    {idx > 0 && (
                      <div className="text-xs text-muted">#{idx + 1}</div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
