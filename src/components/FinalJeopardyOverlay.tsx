import { Check, CheckCircle, Eye, X } from 'lucide-react'
import type { GameSettings, GameState } from '../types'
import { FINAL_JEOPARDY_TIMER_MS } from '../types'
import { formatScore } from '../lib/utils'
import { useCountdownSeconds } from '../hooks/useCountdownSeconds'
import * as net from '../lib/network'
import { useGameStore } from '../store/gameStore'
import QuestionMediaPlayer from './QuestionMediaPlayer'
import QuestionOverlayText from './QuestionOverlayText'

interface Props {
  state: GameState
  settings: GameSettings
}

export default function FinalJeopardyOverlay({ state, settings }: Props) {
  const { activeQuestion, players, activeMedia, mediaPlayback, finalJeopardy, board } = state
  const store = useGameStore()
  const remaining = useCountdownSeconds(finalJeopardy?.timerEndsAt ?? null)

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
  const allAnswersIn =
    wageredIds.length > 0 &&
    wageredIds.every((id) => finalJeopardy.submittedAnswerIds.includes(id))
  const timerDone = (timerActive && remaining === 0) || allAnswersIn
  const showTimer = timerActive && remaining != null && remaining > 0 && !allAnswersIn
  const canRevealPlayers = timerDone || allAnswersIn
  const allJudged =
    wageredIds.length > 0 &&
    wageredIds.every((id) => finalJeopardy.judged[id] != null)
  const canRevealBoth =
    (!finalJeopardy.clueRevealed && hasClue) ||
    (!finalJeopardy.mediaRevealed && hasMedia)

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

  function handleRevealBoth() {
    const timerEndsAt = ensureTimerEndsAt()
    if (hasClue && !finalJeopardy!.clueRevealed) {
      store.revealFinalClue(timerEndsAt)
      net.broadcast({ type: 'FINAL_JEOPARDY_REVEAL_CLUE', timerEndsAt })
    }
    if (hasMedia && !finalJeopardy!.mediaRevealed) {
      store.revealFinalMedia(timerEndsAt)
      net.broadcast({ type: 'FINAL_JEOPARDY_REVEAL_MEDIA', timerEndsAt })
    }
  }

  function handleRevealAnswer() {
    store.revealFinalAnswer()
    net.broadcast({ type: 'FINAL_JEOPARDY_REVEAL_ANSWER' })
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
  const showStage = showClue || showMedia || finalJeopardy.answerRevealed

  return (
    <div className="final-jeopardy-overlay h-full flex flex-col min-h-0 gap-3">
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

              <div className="final-jeopardy-stage flex-1 min-h-0 flex flex-col">
                {showStage ? (
                  <QuestionOverlayText
                    className="final-jeopardy-overlay-text"
                    contentKey={`fj-${question.id}-${finalJeopardy.clueRevealed}-${finalJeopardy.mediaRevealed}-${finalJeopardy.answerRevealed}`}
                    clue={question.question}
                    answer={question.answer || '—'}
                    clueRevealed={showClue}
                    answerRevealed={finalJeopardy.answerRevealed}
                    showClueContent={showClue}
                    showAnswerContent={finalJeopardy.answerRevealed}
                    hasMediaSlot={showMedia}
                    showMediaContent={showMedia}
                    media={
                      activeMedia ? (
                        <QuestionMediaPlayer
                          media={activeMedia}
                          role="host"
                          playback={mediaPlayback}
                          mountKey={1}
                          mediaActive
                          className="question-overlay-media"
                        />
                      ) : undefined
                    }
                  />
                ) : (
                  <div className="flex-1 flex items-center justify-center font-condensed text-sm animate-pulse" style={{ color: '#4a5580' }}>
                    Waiting to reveal clue or media…
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {finalJeopardy.categoryRevealed && (
          <aside className="final-jeopardy-side panel p-3 flex flex-col gap-3 min-h-0">
            <div className="flex flex-col gap-2 flex-shrink-0">
              {!finalJeopardy.clueRevealed && hasClue && (
                <button type="button" className="btn-gold w-full btn-with-icon justify-center" onClick={handleRevealClue}>
                  <Eye size={14} aria-hidden />
                  <span>Reveal clue</span>
                </button>
              )}
              {!finalJeopardy.mediaRevealed && hasMedia && (
                <button type="button" className="btn-outline w-full btn-with-icon justify-center" onClick={handleRevealMedia}>
                  <Eye size={14} aria-hidden />
                  <span>Reveal media</span>
                </button>
              )}
              {canRevealBoth && hasClue && hasMedia &&
                !finalJeopardy.clueRevealed &&
                !finalJeopardy.mediaRevealed && (
                <button type="button" className="btn-outline w-full btn-with-icon justify-center" onClick={handleRevealBoth}>
                  <Eye size={14} aria-hidden />
                  <span>Reveal clue &amp; media</span>
                </button>
              )}
              {(finalJeopardy.clueRevealed || finalJeopardy.mediaRevealed) &&
                !finalJeopardy.answerRevealed && (
                <button type="button" className="btn-outline w-full btn-with-icon justify-center" onClick={handleRevealAnswer}>
                  <Eye size={14} aria-hidden />
                  <span>Reveal answer</span>
                </button>
              )}
            </div>

            <div className="font-condensed text-xs uppercase tracking-wider flex-shrink-0" style={{ color: 'var(--gold)', opacity: 0.7 }}>
              Players
              {allEligibleWagered ? ' · all wagers in' : ''}
              {showTimer ? ' · answering…' : ''}
              {canRevealPlayers && !allJudged ? ' · ready to reveal' : ''}
            </div>

            <div className="flex flex-col gap-2 flex-1 min-h-0 overflow-auto">
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
                  <div key={p.id} className="final-jeopardy-player-card">
                    <div className="final-jeopardy-player-card__header">
                      <span className="font-condensed font-bold truncate">{p.name}</span>
                      <span className="font-display text-sm tabular-nums" style={{ color: 'var(--gold-bright)' }}>
                        {formatScore(p.score)}
                      </span>
                    </div>

                    <div className="final-jeopardy-player-card__meta">
                      {wagered ? (
                        <span style={{ color: 'var(--gold)' }}>
                          Wager {formatScore(finalJeopardy.wagers[p.id]!)}
                        </span>
                      ) : (
                        <span style={{ color: '#4a5580' }}>No wager</span>
                      )}
                      {timerActive && (
                        answered ? (
                          <span className="inline-flex items-center gap-1" style={{ color: 'var(--success)' }}>
                            <CheckCircle size={14} aria-hidden />
                            Answered
                          </span>
                        ) : wagered ? (
                          <span style={{ color: '#4a5580' }}>Writing…</span>
                        ) : null
                      )}
                    </div>

                    {revealed && (
                      <div className="final-jeopardy-player-card__reveal">
                        <div className="font-condensed text-base break-words">
                          {finalJeopardy.answers[p.id] ?? '(no answer)'}
                        </div>
                        {judged == null ? (
                          <div className="flex gap-2 mt-2">
                            <button
                              type="button"
                              className="btn-gold flex-1 btn-with-icon justify-center"
                              onClick={() => handleJudge(p.id, true)}
                            >
                              <Check size={16} aria-hidden />
                              <span>Correct</span>
                            </button>
                            <button
                              type="button"
                              className="btn-ghost flex-1 btn-with-icon justify-center"
                              style={{ color: 'var(--red)', borderColor: 'var(--red)' }}
                              onClick={() => handleJudge(p.id, false)}
                            >
                              <X size={16} aria-hidden />
                              <span>Wrong</span>
                            </button>
                          </div>
                        ) : (
                          <div
                            className="font-condensed text-sm mt-1"
                            style={{ color: judged ? 'var(--success)' : 'var(--red)' }}
                          >
                            {judged ? 'Marked correct' : 'Marked wrong'}
                          </div>
                        )}
                      </div>
                    )}

                    {canRevealPlayers && wagered && !revealed && (
                      <button
                        type="button"
                        className="btn-ghost text-sm w-full mt-2"
                        onClick={() => handleRevealPlayer(p.id)}
                      >
                        Reveal
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </aside>
        )}
      </div>
    </div>
  )
}
