import type { GameState, GameSettings } from '../types'
import { cellId } from '../lib/utils'
import * as net from '../lib/network'
import { useGameStore } from '../store/gameStore'

interface Props {
  state: GameState
  settings: GameSettings
  onClose: () => void
}

export default function QuestionOverlay({ state, settings }: Props) {
  const { activeQuestion, phase, buzzQueue, players, activeMedia } = state
  const store = useGameStore()

  if (!activeQuestion) return null
  const { question, categoryId } = activeQuestion

  function handleStartBuzzing() {
    store.startBuzzing()
    net.broadcast({ type: 'START_BUZZING' })
  }

  function handleJudge(playerId: string, correct: boolean) {
    const pointDelta = correct
      ? question.points
      : settings.negativePoints
      ? -question.points
      : 0
    store.judgeAnswer(playerId, correct, pointDelta)
    net.broadcast({ type: 'JUDGE', playerId, correct, pointDelta })
  }

  function handleReveal() {
    store.revealAnswer()
    net.broadcast({ type: 'REVEAL_ANSWER' })
  }

  function handleClose() {
    const cId = cellId(categoryId, question.id)
    store.markAnswered(cId)
    net.broadcast({ type: 'MARK_ANSWERED', cellId: cId })
  }

  const categoryName = state.board?.categories.find(c => c.id === categoryId)?.name ?? ''

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ background: 'rgba(6,11,40,0.97)', backdropFilter: 'blur(4px)' }}
    >
      <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--navy-light)' }}>
        <div className="font-condensed font-bold uppercase tracking-wider" style={{ color: 'var(--gold)', fontSize: 14 }}>
          {categoryName}
          {categoryName && <span style={{ opacity: 0.5 }}> &nbsp;·&nbsp; </span>}
          <span className="font-display text-xl" style={{ color: 'var(--gold-bright)' }}>${question.points}</span>
        </div>
        <button className="btn-ghost text-sm" onClick={handleClose}>✕ Close &amp; mark answered</button>
      </div>

      <div className="flex-1 flex gap-6 p-6 min-h-0">
        {/* Main question area */}
        <div className="flex-1 flex flex-col items-center justify-center text-center card-flip">
          {activeMedia && (
            <div className="mb-6">
              {activeMedia.type === 'image' && (
                <img src={activeMedia.dataUrl} className="max-h-48 rounded-lg object-contain mx-auto" />
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
            className="font-condensed font-bold text-3xl md:text-4xl leading-snug mb-6 max-w-2xl"
            style={{ color: 'var(--white)' }}
          >
            {question.question || <span style={{ color: '#4a5580' }}>No question text</span>}
          </div>

          {phase === 'revealed' && (
            <div
              className="font-display text-2xl md:text-3xl px-6 py-3 rounded-lg mt-2"
              style={{ background: 'rgba(212,160,23,0.15)', border: '2px solid var(--gold)', color: 'var(--gold-bright)' }}
            >
              {question.answer || '—'}
            </div>
          )}
        </div>

        {/* Controls panel */}
        <div className="w-72 flex-shrink-0 flex flex-col gap-4">
          <div className="panel flex flex-col gap-3">
            <div className="font-condensed text-xs uppercase tracking-wider" style={{ color: 'var(--gold)', opacity: 0.7 }}>
              Controls
            </div>

            {phase === 'question' && (
              <button className="btn-gold w-full py-3" onClick={handleStartBuzzing}>
                🔔 Open for buzzing
              </button>
            )}

            {(phase === 'buzzing' || phase === 'judging') && (
              <div className="text-sm font-condensed" style={{ color: '#8899cc' }}>
                {phase === 'buzzing' ? 'Waiting for buzzes…' : 'Judging…'}
              </div>
            )}

            {phase !== 'revealed' && (
              <button className="btn-outline w-full" onClick={handleReveal}>
                👁 Reveal answer
              </button>
            )}
          </div>

          {/* Buzz queue */}
          {buzzQueue.length > 0 && (
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
                    {idx === 0 && phase === 'judging' && (
                      <div className="flex gap-2">
                        <button
                          className="w-8 h-8 rounded font-bold text-lg"
                          style={{ background: 'rgba(39,174,96,0.2)', border: '1px solid var(--green)', color: '#4cd98a' }}
                          onClick={() => handleJudge(pid, true)}
                          title="Correct"
                        >
                          ✓
                        </button>
                        <button
                          className="w-8 h-8 rounded font-bold text-lg"
                          style={{ background: 'rgba(192,57,43,0.2)', border: '1px solid var(--red)', color: '#e07070' }}
                          onClick={() => handleJudge(pid, false)}
                          title="Wrong"
                        >
                          ✗
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
