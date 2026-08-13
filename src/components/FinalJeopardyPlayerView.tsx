import { useEffect, useState } from 'react'
import type { GameState } from '../types'
import { formatScore } from '../lib/utils'
import * as net from '../lib/network'
import QuestionMediaPlayer from './QuestionMediaPlayer'
import QuestionOverlayText from './QuestionOverlayText'

interface Props {
  state: GameState
  myId: string
  hostPeerId: string | null
  mediaLoading?: boolean
}

function useCountdown(timerEndsAt: number | null): number | null {
  const [remaining, setRemaining] = useState<number | null>(() => {
    if (timerEndsAt == null) return null
    return Math.max(0, Math.ceil((timerEndsAt - Date.now()) / 1000))
  })

  useEffect(() => {
    if (timerEndsAt == null) {
      setRemaining(null)
      return
    }
    function tick() {
      setRemaining(Math.max(0, Math.ceil((timerEndsAt! - Date.now()) / 1000)))
    }
    tick()
    const id = window.setInterval(tick, 250)
    return () => window.clearInterval(id)
  }, [timerEndsAt])

  return remaining
}

export default function FinalJeopardyPlayerView({
  state,
  myId,
  hostPeerId,
  mediaLoading = false,
}: Props) {
  const { board, activeQuestion, activeMedia, mediaPlayback, finalJeopardy, players } = state
  const remaining = useCountdown(finalJeopardy?.timerEndsAt ?? null)
  const [wagerInput, setWagerInput] = useState('')
  const [wagerError, setWagerError] = useState('')
  const [answerInput, setAnswerInput] = useState('')

  const myPlayer = players.find((p) => p.id === myId)
  const myScore = myPlayer?.score ?? 0
  const eligible = myScore > 0
  const myWager = finalJeopardy?.wagers[myId]
  const hasWagered = myWager != null
  const hasAnswered = !!finalJeopardy?.submittedAnswerIds.includes(myId)
  const timerDone =
    finalJeopardy?.timerEndsAt != null &&
    (remaining === 0 || Date.now() >= finalJeopardy.timerEndsAt)
  const canAnswer =
    eligible &&
    hasWagered &&
    finalJeopardy?.timerEndsAt != null &&
    !hasAnswered &&
    !timerDone

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

  function submitWager() {
    if (!eligible || hasWagered || !hostPeerId) return
    const trimmed = wagerInput.trim()
    if (!trimmed) {
      setWagerError('Enter a wager')
      return
    }
    const wager = parseInt(trimmed, 10)
    if (isNaN(wager) || wager < 0) {
      setWagerError('Minimum wager is $0')
      return
    }
    if (wager > myScore) {
      setWagerError(`Maximum wager is $${myScore}`)
      return
    }
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
        {finalJeopardy.timerEndsAt != null && remaining != null && (
          <div
            className="font-display text-2xl tabular-nums"
            style={{ color: remaining <= 5 ? 'var(--red)' : 'var(--gold-bright)' }}
          >
            {remaining}s
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 panel flex flex-col gap-4 p-4 overflow-auto">
        {!finalJeopardy.categoryRevealed ? (
          <div className="flex-1 flex items-center justify-center font-condensed animate-pulse" style={{ color: '#4a5580' }}>
            Waiting for category…
          </div>
        ) : (
          <>
            <div className="text-center">
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

            {finalJeopardy.categoryRevealed &&
              !finalJeopardy.clueRevealed &&
              !finalJeopardy.mediaRevealed && (
                <div className="text-center font-condensed text-sm animate-pulse" style={{ color: '#4a5580' }}>
                  {eligible
                    ? hasWagered
                      ? 'Wager locked in — waiting for the clue…'
                      : 'Place your wager'
                    : 'Spectating — score must be above $0 to play'}
                </div>
              )}

            {(showClue || showMedia) && question && (
              <QuestionOverlayText
                contentKey={`fj-player-${question.id}-${finalJeopardy.clueRevealed}-${finalJeopardy.mediaRevealed}`}
                clue={question.question}
                answer={question.answer || '—'}
                clueRevealed={showClue}
                answerRevealed={false}
                showAnswerContent={false}
                hasMediaSlot={!!(question.mediaId || activeMedia || mediaLoading)}
                showMediaContent={showMedia}
                media={
                  activeMedia ? (
                    <QuestionMediaPlayer
                      media={activeMedia}
                      role="player"
                      playback={mediaPlayback}
                      mountKey={finalJeopardy.mediaRevealed ? 1 : 0}
                      mediaActive={showMedia}
                      loading={mediaLoading}
                      className={`question-overlay-media${showMedia ? '' : ' question-overlay-media--pending'}`}
                    />
                  ) : undefined
                }
              />
            )}

            {focusPlayer && (
              <div className="final-jeopardy-reveal panel p-3 flex flex-col gap-2">
                <div className="font-condensed font-bold text-lg">{focusPlayer.name}</div>
                <div className="font-display text-xl" style={{ color: 'var(--gold-bright)' }}>
                  Wager: {formatScore(finalJeopardy.wagers[focusPlayer.id] ?? 0)}
                </div>
                <div className="font-condensed text-base">
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
            )}
          </>
        )}
      </div>

      {finalJeopardy.categoryRevealed && eligible && !hasWagered && (
        <div className="flex-shrink-0 panel p-3 flex flex-col gap-2">
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
            onChange={(e) => {
              setWagerInput(e.target.value)
              setWagerError('')
            }}
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
        <div className="flex-shrink-0 panel p-3 flex flex-col gap-2">
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
        <div className="flex-shrink-0 text-center font-condensed text-sm" style={{ color: 'var(--success)' }}>
          Answer submitted
        </div>
      )}

      {hasWagered && timerDone && !hasAnswered && (
        <div className="flex-shrink-0 text-center font-condensed text-sm" style={{ color: '#4a5580' }}>
          Time&apos;s up
        </div>
      )}
    </div>
  )
}
