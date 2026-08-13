import { useEffect, useState } from 'react'
import { Check, CheckCircle, Eye, X } from 'lucide-react'
import type { GameSettings, GameState } from '../types'
import { FINAL_JEOPARDY_TIMER_MS } from '../types'
import { formatScore } from '../lib/utils'
import * as net from '../lib/network'
import { useGameStore } from '../store/gameStore'
import QuestionMediaPlayer from './QuestionMediaPlayer'
import QuestionOverlayText from './QuestionOverlayText'

interface Props {
  state: GameState
  settings: GameSettings
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

export default function FinalJeopardyOverlay({ state, settings }: Props) {
  const { activeQuestion, players, activeMedia, mediaPlayback, finalJeopardy, board } = state
  const store = useGameStore()
  const remaining = useCountdown(finalJeopardy?.timerEndsAt ?? null)

  if (!activeQuestion || !finalJeopardy || !board) return null

  const { question, categoryId } = activeQuestion
  const category = board.categories.find((c) => c.id === categoryId)
  const categoryName = category?.name ?? 'Final Jeopardy'
  const hasClue = !!question.question.trim()
  const hasMedia = !!question.mediaId || !!activeMedia
  const eligible = players.filter((p) => p.isConnected && p.score > 0)
  const wageredIds = Object.keys(finalJeopardy.wagers)
  const allEligibleWagered =
    eligible.length > 0 && eligible.every((p) => finalJeopardy.wagers[p.id] != null)
  const timerActive = finalJeopardy.timerEndsAt != null
  const timerDone = timerActive && (remaining === 0 || (finalJeopardy.timerEndsAt != null && Date.now() >= finalJeopardy.timerEndsAt))
  const allAnswersIn =
    wageredIds.length > 0 &&
    wageredIds.every((id) => finalJeopardy.submittedAnswerIds.includes(id))
  const canRevealPlayers = timerDone || allAnswersIn
  const allJudged =
    wageredIds.length > 0 &&
    wageredIds.every((id) => finalJeopardy.judged[id] != null)

  function handleRevealCategory() {
    store.revealFinalCategory()
    net.broadcast({ type: 'FINAL_JEOPARDY_REVEAL_CATEGORY' })
  }

  function ensureTimerEndsAt(): number {
    return finalJeopardy!.timerEndsAt ?? Date.now() + FINAL_JEOPARDY_TIMER_MS
  }

  function handleRevealClue() {
    const timerEndsAt = ensureTimerEndsAt()
    store.revealFinalClue(timerEndsAt)
    net.broadcast({ type: 'FINAL_JEOPARDY_REVEAL_CLUE', timerEndsAt })
  }

  function handleRevealMedia() {
    const timerEndsAt = ensureTimerEndsAt()
    store.revealFinalMedia(timerEndsAt)
    net.broadcast({ type: 'FINAL_JEOPARDY_REVEAL_MEDIA', timerEndsAt })
  }

  function handleRevealPlayer(playerId: string) {
    const wager = finalJeopardy!.wagers[playerId]
    if (wager == null) return
    const answer = finalJeopardy!.answers[playerId] ?? ''
    store.revealFinalPlayer(playerId)
    net.broadcast({
      type: 'FINAL_JEOPARDY_REVEAL_PLAYER',
      playerId,
      wager,
      answer,
    })
  }

  function handleJudge(playerId: string, correct: boolean) {
    const wager = finalJeopardy!.wagers[playerId]
    if (wager == null) return
    const player = players.find((p) => p.id === playerId)
    let pointDelta = correct ? wager : -wager
    if (!correct && !settings.allowNegativeScore && player) {
      pointDelta = Math.max(pointDelta, -player.score)
    }
    store.judgeFinalAnswer(playerId, correct, pointDelta)
    net.broadcast({ type: 'FINAL_JEOPARDY_JUDGE', playerId, correct, pointDelta })
  }

  const showClue = finalJeopardy.clueRevealed && hasClue
  const showMedia = finalJeopardy.mediaRevealed && !!activeMedia
  const focusRevealedId = [...finalJeopardy.revealedPlayerIds]
    .reverse()
    .find((id) => finalJeopardy.judged[id] == null) ??
    finalJeopardy.revealedPlayerIds[finalJeopardy.revealedPlayerIds.length - 1]
  const focusPlayer = focusRevealedId
    ? players.find((p) => p.id === focusRevealedId)
    : null

  return (
    <div className="final-jeopardy-overlay h-full flex flex-col min-h-0 gap-3">
      <div className="flex items-center justify-between gap-3 flex-shrink-0">
        <div className="font-display text-xl" style={{ color: 'var(--gold-bright)' }}>
          Final Jeopardy
        </div>
        {timerActive && remaining != null && (
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
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            <div className="font-condensed text-lg" style={{ color: '#4a5580' }}>
              Ready when you are
            </div>
            <button type="button" className="btn-gold btn-with-icon" onClick={handleRevealCategory}>
              <Eye size={16} aria-hidden />
              <span>Reveal category</span>
            </button>
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

            {(showClue || showMedia) && (
              <div className="flex flex-col gap-3 flex-1 min-h-0">
                <QuestionOverlayText
                  className="final-jeopardy-clue"
                  contentKey={`fj-${question.id}-${finalJeopardy.clueRevealed}-${finalJeopardy.mediaRevealed}`}
                  clue={question.question}
                  answer={question.answer || '—'}
                  clueRevealed={showClue}
                  answerRevealed={false}
                  showAnswerContent={false}
                  hasMediaSlot={hasMedia}
                  showMediaContent={showMedia}
                  media={
                    activeMedia ? (
                      <QuestionMediaPlayer
                        media={activeMedia}
                        role="host"
                        playback={mediaPlayback}
                        mountKey={finalJeopardy.mediaRevealed ? 1 : 0}
                        mediaActive={showMedia}
                        className={`question-overlay-media${showMedia ? '' : ' question-overlay-media--pending'}`}
                      />
                    ) : undefined
                  }
                />
              </div>
            )}

            {focusPlayer && finalJeopardy.revealedPlayerIds.includes(focusPlayer.id) && (
              <div className="final-jeopardy-reveal panel p-3 flex flex-col gap-2">
                <div className="font-condensed font-bold text-lg">{focusPlayer.name}</div>
                <div className="font-display text-xl" style={{ color: 'var(--gold-bright)' }}>
                  Wager: {formatScore(finalJeopardy.wagers[focusPlayer.id] ?? 0)}
                </div>
                <div className="font-condensed text-base">
                  {finalJeopardy.answers[focusPlayer.id] ?? '(no answer)'}
                </div>
                {finalJeopardy.judged[focusPlayer.id] == null ? (
                  <div className="flex gap-2 mt-1">
                    <button
                      type="button"
                      className="btn-gold flex-1 btn-with-icon justify-center"
                      onClick={() => handleJudge(focusPlayer.id, true)}
                    >
                      <Check size={16} aria-hidden />
                      <span>Correct</span>
                    </button>
                    <button
                      type="button"
                      className="btn-ghost flex-1 btn-with-icon justify-center"
                      style={{ color: 'var(--red)', borderColor: 'var(--red)' }}
                      onClick={() => handleJudge(focusPlayer.id, false)}
                    >
                      <X size={16} aria-hidden />
                      <span>Wrong</span>
                    </button>
                  </div>
                ) : (
                  <div
                    className="font-condensed text-sm"
                    style={{
                      color: finalJeopardy.judged[focusPlayer.id] ? 'var(--success)' : 'var(--red)',
                    }}
                  >
                    {finalJeopardy.judged[focusPlayer.id] ? 'Marked correct' : 'Marked wrong'}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {finalJeopardy.categoryRevealed && (
        <div className="flex-shrink-0 panel p-3 flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            {!finalJeopardy.clueRevealed && hasClue && (
              <button type="button" className="btn-gold btn-with-icon" onClick={handleRevealClue}>
                <Eye size={14} aria-hidden />
                <span>Reveal clue</span>
              </button>
            )}
            {!finalJeopardy.mediaRevealed && hasMedia && (
              <button type="button" className="btn-gold btn-with-icon" onClick={handleRevealMedia}>
                <Eye size={14} aria-hidden />
                <span>Reveal media</span>
              </button>
            )}
          </div>

          <div className="font-condensed text-xs uppercase tracking-wider" style={{ color: 'var(--gold)', opacity: 0.7 }}>
            Players
            {allEligibleWagered ? ' · all wagers in' : ''}
            {timerActive && !timerDone ? ' · answering…' : ''}
            {canRevealPlayers && !allJudged ? ' · ready to reveal' : ''}
          </div>

          <div className="flex flex-col gap-1 max-h-40 overflow-auto">
            {eligible.length === 0 && (
              <div className="text-sm" style={{ color: '#4a5580' }}>
                No players with a positive score
              </div>
            )}
            {eligible.map((p) => {
              const wagered = finalJeopardy.wagers[p.id] != null
              const answered = finalJeopardy.submittedAnswerIds.includes(p.id)
              const revealed = finalJeopardy.revealedPlayerIds.includes(p.id)
              const judged = finalJeopardy.judged[p.id]
              return (
                <div
                  key={p.id}
                  className="flex items-center gap-2 py-1 px-2 rounded"
                  style={{ background: 'rgba(255,255,255,0.04)' }}
                >
                  <span className="font-condensed font-bold flex-1 truncate">{p.name}</span>
                  <span className="text-xs tabular-nums" style={{ color: '#8a93b2' }}>
                    {formatScore(p.score)}
                  </span>
                  {wagered ? (
                    <span className="text-xs" style={{ color: 'var(--gold)' }}>
                      {formatScore(finalJeopardy.wagers[p.id]!)}
                    </span>
                  ) : (
                    <span className="text-xs" style={{ color: '#4a5580' }}>
                      no wager
                    </span>
                  )}
                  {timerActive && (
                    answered ? (
                      <CheckCircle size={14} style={{ color: 'var(--success)' }} aria-label="Answer submitted" />
                    ) : (
                      <span className="text-xs" style={{ color: '#4a5580' }}>…</span>
                    )
                  )}
                  {canRevealPlayers && wagered && !revealed && (
                    <button
                      type="button"
                      className="btn-ghost text-xs py-0.5 px-2"
                      onClick={() => handleRevealPlayer(p.id)}
                    >
                      Reveal
                    </button>
                  )}
                  {judged != null && (
                    <span
                      className="text-xs font-condensed"
                      style={{ color: judged ? 'var(--success)' : 'var(--red)' }}
                    >
                      {judged ? '✓' : '✗'}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
