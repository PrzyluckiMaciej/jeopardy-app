import { useState } from 'react'
import type { GameState } from '../types'
import { formatScore } from '../lib/utils'
import { useCountdownSeconds } from '../hooks/useCountdownSeconds'
import * as net from '../lib/network'
import QuestionMediaPlayer from './QuestionMediaPlayer'

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
  const eligible = myScore > 0
  const myWager = finalJeopardy?.wagers[myId]
  const hasWagered = myWager != null
  const hasAnswered = !!finalJeopardy?.submittedAnswerIds.includes(myId)
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

  const showWagerForm = !!finalJeopardy?.categoryRevealed && eligible && !hasWagered
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
    if (!eligible || hasWagered || !hostPeerId) return
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

  return (
    <div className="final-jeopardy-player h-full flex flex-col min-h-0 gap-3">
      <div className="flex items-center justify-between gap-3 flex-shrink-0">
        <div className="font-display text-xl" style={{ color: 'var(--gold-bright)' }}>
          Final Jeopardy
        </div>
        {showTimer && (
          <div
            className="font-display text-2xl tabular-nums"
            style={{ color: remaining! <= 5 ? 'var(--red)' : 'var(--gold-bright)' }}
          >
            {remaining}s
          </div>
        )}
      </div>

      <div className="final-jeopardy-layout flex-1 min-h-0">
        <div className="final-jeopardy-main panel flex flex-col gap-4 p-4 min-h-0 overflow-hidden">
          {!finalJeopardy.categoryRevealed ? (
            <div className="flex-1 flex items-center justify-center font-condensed animate-pulse" style={{ color: '#4a5580' }}>
              Waiting for category…
            </div>
          ) : (
            <>
              <div className="text-center flex-shrink-0">
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

              {!finalJeopardy.clueRevealed && !finalJeopardy.mediaRevealed && (
                <div className="text-center font-condensed text-sm animate-pulse" style={{ color: '#4a5580' }}>
                  {eligible
                    ? hasWagered
                      ? 'Wager locked in — waiting for the clue…'
                      : 'Place your wager'
                    : 'Spectating — score must be above $0 to play'}
                </div>
              )}

              <div className="final-jeopardy-stage flex-1 min-h-0 flex flex-col gap-3">
                {showClue && question && (
                  <div className="final-jeopardy-clue-text font-condensed">
                    {question.question}
                  </div>
                )}
                {showMedia && activeMedia && (
                  <div className="final-jeopardy-media flex-1 min-h-0">
                    <QuestionMediaPlayer
                      media={activeMedia}
                      role="player"
                      playback={mediaPlayback}
                      mountKey={1}
                      mediaActive
                      loading={mediaLoading}
                      className="question-overlay-media"
                    />
                  </div>
                )}
                {finalJeopardy.mediaRevealed && !activeMedia && mediaLoading && (
                  <div className="flex-1 flex items-center justify-center font-condensed text-sm animate-pulse" style={{ color: '#4a5580' }}>
                    Loading media…
                  </div>
                )}
                {finalJeopardy.answerRevealed && question && (
                  <div className="final-jeopardy-correct-answer flex-shrink-0">
                    <div
                      className="font-condensed text-xs uppercase tracking-widest mb-1"
                      style={{ color: 'var(--gold)', opacity: 0.7 }}
                    >
                      Answer
                    </div>
                    <div className="font-condensed text-xl" style={{ color: 'var(--gold-bright)' }}>
                      {question.answer || '—'}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <aside className="final-jeopardy-side panel p-3 flex flex-col gap-3 min-h-0">
          <div className="final-jeopardy-judge-slot flex-shrink-0" aria-live="polite">
            {focusPlayer ? (
              <div className="final-jeopardy-reveal flex flex-col gap-2">
                <div className="font-condensed font-bold text-lg">{focusPlayer.name}</div>
                <div className="font-display text-xl" style={{ color: 'var(--gold-bright)' }}>
                  Wager: {formatScore(finalJeopardy.wagers[focusPlayer.id] ?? 0)}
                </div>
                <div className="font-condensed text-base break-words">
                  {finalJeopardy.answers[focusPlayer.id] ?? '(no answer)'}
                </div>
                {focusJudged != null && (
                  <div
                    className="font-condensed text-sm"
                    style={{ color: focusJudged ? 'var(--success)' : 'var(--red)' }}
                  >
                    {focusJudged ? 'Correct!' : 'Incorrect'}
                  </div>
                )}
              </div>
            ) : (
              <div className="font-condensed text-sm" style={{ color: '#4a5580' }}>
                Player reveals appear here
              </div>
            )}
          </div>

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

          {canAnswer && (
            <div className="flex flex-col gap-2 flex-shrink-0">
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

          {hasWagered && finalJeopardy.timerEndsAt != null && hasAnswered && (
            <div className="text-center font-condensed text-sm" style={{ color: 'var(--success)' }}>
              Answer submitted
            </div>
          )}

          {hasWagered && timerDone && !hasAnswered && (
            <div className="text-center font-condensed text-sm" style={{ color: '#4a5580' }}>
              Time&apos;s up
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
