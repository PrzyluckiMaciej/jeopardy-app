import { useEffect, useRef, useState } from 'react'
import { Check, X, ArrowLeft, CheckCircle, Bell, Eye } from 'lucide-react'
import type { GameState, GameSettings } from '../types'
import { cellId, formatScore } from '../lib/utils'
import { getCategoryGameplaySettings } from '../lib/settings'
import * as net from '../lib/network'
import { useGameStore } from '../store/gameStore'
import { logEvent } from '../lib/logger'
import QuestionMediaPlayer from './QuestionMediaPlayer'
import QuestionOverlayText from './QuestionOverlayText'

interface Props {
  state: GameState
  settings: GameSettings
  onClose: () => void
}

export default function QuestionOverlay({ state, settings }: Props) {
  const { activeQuestion, phase, buzzQueue, players, activeMedia, mediaPlayback, dailyDouble, clueRevealed, mediaRevealed } = state
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
  const category = state.board?.categories.find(c => c.id === categoryId)
  const gameplay = getCategoryGameplaySettings(category, settings)
  const hasClue = !!question.question.trim()
  const hasMedia = !!question.mediaId || !!activeMedia
  const autoBuzzOnClue = gameplay.autoBuzzQueue && hasClue
  const autoBuzzOnMedia = gameplay.autoBuzzQueueOnMedia && hasMedia
  const autoBuzzPending = autoBuzzOnClue || autoBuzzOnMedia
  const autoBuzzHint = autoBuzzOnClue && autoBuzzOnMedia
    ? 'Buzz queue opens automatically on clue or media reveal'
    : autoBuzzOnClue
      ? 'Buzz queue opens automatically on clue reveal'
      : autoBuzzOnMedia
        ? 'Buzz queue opens automatically on media reveal'
        : null

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
      const revealMedia = gameplay.autoRevealMedia
      store.revealDailyDoubleClue(revealMedia)
      const { mediaRevealed } = useGameStore.getState().state
      net.broadcast({ type: 'DAILY_DOUBLE_REVEAL_CLUE', mediaRevealed })
    }
    setDdExiting(true)
  }

  function handleRevealClue() {
    store.revealClue()
    net.broadcast({ type: 'REVEAL_CLUE' })
    // Only open once — skip if media reveal already started buzzing
    if (gameplay.autoBuzzQueue && !isDD && phase === 'question') {
      store.startBuzzing()
      net.broadcast({ type: 'START_BUZZING' })
    }
  }

  function handleRevealMedia() {
    store.revealMedia()
    net.broadcast({ type: 'REVEAL_MEDIA' })
    // Only open once — skip if clue reveal already started buzzing
    if (gameplay.autoBuzzQueueOnMedia && !isDD && phase === 'question') {
      store.startBuzzing()
      net.broadcast({ type: 'START_BUZZING' })
    }
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

  const categoryName = category?.name ?? ''
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
            <QuestionOverlayText
              contentKey={`clue-${clueRevealKey}`}
              clue={question.question}
              answer={question.answer || '—'}
              clueRevealed={clueRevealed}
              answerRevealed={phase === 'revealed'}
              answerKey={phase === 'revealed' ? `answer-${answerRevealKey}` : 'answer-pending'}
              answerClassName={phase === 'revealed' ? 'answer-reveal' : ''}
              hasMediaSlot={!!activeMedia}
              media={
                activeMedia ? (
                  <QuestionMediaPlayer
                    media={activeMedia}
                    role="host"
                    playback={mediaPlayback}
                    mountKey={clueRevealKey}
                    mediaActive={mediaRevealed && !overlayExiting}
                    className={`question-overlay-media${mediaRevealed ? '' : ' question-overlay-media--pending'}`}
                  />
                ) : undefined
              }
            />
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
                {activeMedia && !mediaRevealed && (
                  <button type="button" className="btn-outline w-full btn-with-icon justify-center" onClick={handleRevealMedia}>
                    <Eye size={16} aria-hidden />
                    <span>Reveal media</span>
                  </button>
                )}
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

            {!isDD && phase === 'question' && (clueRevealed || !hasClue) && !autoBuzzPending && (
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

            {!isDD && phase === 'question' && autoBuzzHint && (
              <div
                className="flex items-start gap-2 text-sm font-condensed text-subtle"
                role="status"
              >
                <Bell size={14} className="flex-shrink-0 mt-0.5 opacity-70" aria-hidden />
                <span>{autoBuzzHint}</span>
              </div>
            )}

            {!isDD && phase === 'buzzing' && (
              <div className="text-sm font-condensed text-subtle">
                {buzzQueue.length > 0 ? 'Judging…' : 'Waiting for buzzes…'}
              </div>
            )}

            {showClue && hasClue && !clueRevealed && (
              <button
                type="button"
                className="btn-outline w-full btn-with-icon justify-center"
                onClick={handleRevealClue}
                title="Show the clue to players"
              >
                <Eye size={16} aria-hidden />
                <span>Reveal clue</span>
              </button>
            )}

            {showClue && activeMedia && !mediaRevealed && (
              <button
                type="button"
                className="btn-outline w-full btn-with-icon justify-center"
                onClick={handleRevealMedia}
                title="Show the media to players"
              >
                <Eye size={16} aria-hidden />
                <span>Reveal media</span>
              </button>
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
