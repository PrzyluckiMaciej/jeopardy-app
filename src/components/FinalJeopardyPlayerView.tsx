import { useState } from 'react'
import type { GameState } from '../types'
import { useCountdownSeconds } from '../hooks/useCountdownSeconds'
import * as net from '../lib/network'
import QuestionMediaPlayer from './QuestionMediaPlayer'
import QuestionOverlayText from './QuestionOverlayText'

interface Props {
  state: GameState
  myId: string
  hostPeerId: string | null
  mediaLoading?: boolean
}

export default function FinalJeopardyPlayerView({
  state,
  myId,
  hostPeerId,
  mediaLoading = false,
}: Props) {
  const { board, activeQuestion, activeMedia, mediaPlayback, finalJeopardy, players } = state
  const remaining = useCountdownSeconds(finalJeopardy?.timerEndsAt ?? null)
  const roundId = finalJeopardy?.startedAt ?? 0
  const [seenRound, setSeenRound] = useState(roundId)
  const [wagerInput, setWagerInput] = useState('')
  const [wagerError, setWagerError] = useState('')
  const [answerInput, setAnswerInput] = useState('')
  const [answerFormKey, setAnswerFormKey] = useState(0)

  if (roundId !== seenRound) {
    setSeenRound(roundId)
    setWagerInput('')
    setWagerError('')
    setAnswerInput('')
    setAnswerFormKey(0)
  }

  const myPlayer = players.find((p) => p.id === myId)
  const myScore = myPlayer?.score ?? 0
  const eligible = !myPlayer?.isSpectator && myScore > 0
  const myWager = finalJeopardy?.wagers[myId]
  const hasWagered = myWager != null
  const hasAnswered = !!finalJeopardy?.submittedAnswerIds.includes(myId)
  const contentRevealed =
    !!finalJeopardy?.clueRevealed || !!finalJeopardy?.mediaRevealed
  const timerDone = finalJeopardy?.timerEndsAt != null && remaining === 0
  const showTimer =
    finalJeopardy?.timerEndsAt != null &&
    remaining != null &&
    remaining > 0
  const canAnswer =
    eligible &&
    hasWagered &&
    finalJeopardy?.timerEndsAt != null &&
    !hasAnswered &&
    !timerDone

  const showWagerForm =
    !!finalJeopardy?.categoryRevealed &&
    eligible &&
    !hasWagered &&
    !contentRevealed
  const answerRound = finalJeopardy?.timerEndsAt ?? 0
  if (canAnswer && answerFormKey !== answerRound) {
    setAnswerFormKey(answerRound)
    setAnswerInput('')
  }

  const category = board?.categories.find((c) => c.id === activeQuestion?.categoryId)
  const categoryName = category?.name ?? 'Final Jeopardy'
  const question = activeQuestion?.question
  const showClue = !!finalJeopardy?.clueRevealed && !!question?.question.trim()
  const showMedia = !!finalJeopardy?.mediaRevealed && !!activeMedia
  const showStage =
    showClue || showMedia || !!finalJeopardy?.answerRevealed

  const focusRevealedId = [...(finalJeopardy?.revealedPlayerIds ?? [])].reverse()[0]
  const focusPlayer = focusRevealedId
    ? players.find((p) => p.id === focusRevealedId)
    : null
  const focusJudged =
    focusRevealedId && finalJeopardy ? finalJeopardy.judged[focusRevealedId] : undefined

  function getFjWagerError(raw: string, requireValue = false): string {
    const trimmed = raw.trim()
    if (!trimmed) {
      return requireValue ? 'Minimum wager is $0' : ''
    }
    const wager = parseInt(trimmed, 10)
    if (isNaN(wager) || wager < 0) {
      return 'Minimum wager is $0'
    }
    if (wager > myScore) {
      return `Maximum wager is $${myScore}`
    }
    return ''
  }

  function handleWagerChange(raw: string) {
    setWagerInput(raw)
    setWagerError(getFjWagerError(raw))
  }

  function submitWager() {
    if (!eligible || hasWagered || contentRevealed || !hostPeerId) return
    const error = getFjWagerError(wagerInput, true)
    if (error) {
      setWagerError(error)
      return
    }
    const wager = parseInt(wagerInput.trim(), 10)
    setWagerError('')
    net.send({ type: 'FINAL_JEOPARDY_WAGER', playerId: myId, wager }, hostPeerId)
  }

  function submitAnswer() {
    if (!canAnswer || !hostPeerId) return
    const text = answerInput.trim()
    if (!text) return
    net.send({ type: 'FINAL_JEOPARDY_SUBMIT_ANSWER', playerId: myId, text }, hostPeerId)
  }

  if (!finalJeopardy || !board) {
    return (
      <div className="h-full flex items-center justify-center font-condensed" style={{ color: '#4a5580' }}>
        Loading Final Jeopardy…
      </div>
    )
  }

  const sidePanelKey = [
    showWagerForm ? 'wager' : '',
    canAnswer ? 'answer' : '',
    hasAnswered ? 'submitted' : '',
    hasWagered && timerDone && !hasAnswered ? 'times-up' : '',
    focusPlayer ? `reveal-${focusPlayer.id}-${focusJudged ?? 'pending'}` : '',
  ]
    .filter(Boolean)
    .join('|') || 'idle'

  return (
    <div className="final-jeopardy-player h-full flex flex-col min-h-0 gap-3">
      <div className="flex items-center justify-between gap-3 flex-shrink-0">
        <div className="font-display text-xl" style={{ color: 'var(--gold-bright)' }}>
          Final Jeopardy
        </div>
      </div>

      <div className="final-jeopardy-layout flex-1 min-h-0">
        <div className="final-jeopardy-main panel flex flex-col gap-4 p-4 min-h-0 overflow-hidden">
          {!finalJeopardy.categoryRevealed ? (
            <div
              key="waiting-category"
              className="final-jeopardy-enter flex-1 flex items-center justify-center font-condensed animate-pulse"
              style={{ color: '#4a5580' }}
            >
              Waiting for category…
            </div>
          ) : (
            <div key="category-live" className="final-jeopardy-enter flex-1 min-h-0 flex flex-col gap-4">
              <div className="final-jeopardy-category-enter text-center flex-shrink-0">
                <div
                  className="font-condensed text-xs uppercase tracking-widest mb-1"
                  style={{ color: 'var(--gold)', opacity: 0.7 }}
                >
                  Category
                </div>
                <div className="font-display text-3xl" style={{ color: 'var(--gold-bright)' }}>
                  {categoryName}
                </div>
              </div>

              {!contentRevealed && (
                <div
                  key={`status-${hasWagered}-${eligible}`}
                  className="final-jeopardy-enter text-center font-condensed text-sm animate-pulse"
                  style={{ color: '#4a5580' }}
                >
                  {eligible
                    ? hasWagered
                      ? 'Wager locked in — waiting for the clue…'
                      : 'Place your wager'
                    : 'Spectating — score must be above $0 to play'}
                </div>
              )}

              <div className="final-jeopardy-stage flex-1 min-h-0 flex flex-col">
                {showStage && question ? (
                  <QuestionOverlayText
                    className="final-jeopardy-overlay-text"
                    contentKey={`fj-player-${question.id}-${finalJeopardy.clueRevealed}-${finalJeopardy.mediaRevealed}-${finalJeopardy.answerRevealed}`}
                    clue={question.question}
                    answer={question.answer || '—'}
                    clueRevealed={showClue}
                    answerRevealed={finalJeopardy.answerRevealed}
                    showClueContent={showClue}
                    showAnswerContent={finalJeopardy.answerRevealed}
                    hasMediaSlot={showMedia || (!!finalJeopardy.mediaRevealed && mediaLoading)}
                    showMediaContent={showMedia}
                    clueClassName={showClue ? 'clue-reveal' : ''}
                    answerClassName={finalJeopardy.answerRevealed ? 'answer-reveal' : ''}
                    media={
                      activeMedia ? (
                        <QuestionMediaPlayer
                          media={activeMedia}
                          role="player"
                          playback={mediaPlayback}
                          mountKey={1}
                          mediaActive
                          loading={mediaLoading}
                          className={`question-overlay-media${showMedia ? ' clue-reveal' : ''}`}
                        />
                      ) : undefined
                    }
                  />
                ) : finalJeopardy.mediaRevealed && mediaLoading ? (
                  <div
                    key="loading-media"
                    className="final-jeopardy-enter flex-1 flex items-center justify-center font-condensed text-sm animate-pulse"
                    style={{ color: '#4a5580' }}
                  >
                    Loading media…
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </div>

        <aside className="final-jeopardy-side final-jeopardy-side--player panel p-3 flex flex-col gap-3 min-h-0">
          {showTimer && (
            <div
              className={`final-jeopardy-player-timer${remaining! <= 5 ? ' final-jeopardy-player-timer--urgent' : ''}`}
              aria-live="polite"
            >
              <span className="final-jeopardy-player-timer__value">{remaining}</span>
              <span className="final-jeopardy-player-timer__label">seconds left</span>
            </div>
          )}

          <div key={sidePanelKey} className="final-jeopardy-enter flex flex-col gap-3 flex-1 min-h-0">
            {focusPlayer && (
              <div className="final-jeopardy-reveal-card flex-shrink-0" aria-live="polite">
                <div className="final-jeopardy-reveal-card__top">
                  <div className="final-jeopardy-reveal-card__name font-condensed font-bold truncate">
                    {focusPlayer.name}
                  </div>
                  <div className="final-jeopardy-reveal-card__wager font-display">
                    {formatScore(finalJeopardy.wagers[focusPlayer.id] ?? 0)}
                  </div>
                </div>
                <div className="final-jeopardy-reveal-card__answer final-jeopardy-reveal-enter">
                  <div className="final-jeopardy-reveal-card__answer-text font-condensed font-bold">
                    {finalJeopardy.answers[focusPlayer.id] ?? '(no answer)'}
                  </div>
                  {focusJudged != null && (
                    <div
                      key={`judged-${focusJudged}`}
                      className="final-jeopardy-enter final-jeopardy-reveal-card__result font-condensed font-bold"
                      style={{ color: focusJudged ? 'var(--success)' : 'var(--red)' }}
                    >
                      {focusJudged ? 'Correct!' : 'Incorrect'}
                    </div>
                  )}
                </div>
              </div>
            )}

            {showWagerForm && (
              <div className="flex flex-col gap-2 flex-shrink-0">
                <div className="font-condensed font-bold text-sm text-center" style={{ color: 'var(--gold-bright)' }}>
                  Enter your wager
                </div>
                <div className="text-xs text-center" style={{ color: '#4a5580' }}>
                  Min: $0 · Max: ${myScore}
                </div>
                <input
                  type="number"
                  min={0}
                  max={myScore}
                  className="w-full text-center font-display text-xl"
                  placeholder="Wager amount"
                  value={wagerInput}
                  onChange={(e) => handleWagerChange(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && submitWager()}
                  autoFocus
                />
                {wagerError && (
                  <div className="text-xs text-center" style={{ color: 'var(--red)' }}>{wagerError}</div>
                )}
                <button type="button" className="btn-gold w-full py-3" onClick={submitWager}>
                  Submit wager
                </button>
              </div>
            )}

            {hasWagered && finalJeopardy.timerEndsAt != null && hasAnswered && (
              <div className="text-center font-condensed text-sm flex-shrink-0" style={{ color: 'var(--success)' }}>
                Answer submitted
              </div>
            )}

            {hasWagered && timerDone && !hasAnswered && (
              <div className="text-center font-condensed text-sm flex-shrink-0" style={{ color: '#4a5580' }}>
                Time&apos;s up
              </div>
            )}

            {canAnswer && (
              <div className="final-jeopardy-player-answer flex flex-col gap-2 flex-shrink-0 mt-auto">
                <div className="font-condensed font-bold text-sm text-center" style={{ color: 'var(--gold-bright)' }}>
                  Your answer
                </div>
                <input
                  type="text"
                  className="w-full text-center font-condensed text-lg"
                  placeholder="What is…?"
                  value={answerInput}
                  onChange={(e) => setAnswerInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && submitAnswer()}
                  autoFocus
                />
                <button
                  type="button"
                  className="btn-gold w-full py-3"
                  onClick={submitAnswer}
                  disabled={!answerInput.trim()}
                >
                  Submit answer
                </button>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}

function formatScore(score: number): string {
  if (score < 0) return `-$${Math.abs(score).toLocaleString()}`
  return `$${score.toLocaleString()}`
}
