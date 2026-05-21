import { useEffect, useRef, useState } from 'react'
import { Check, X } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useGameStore } from '../store/gameStore'
import * as net from '../lib/network'
import type { NetMessage, Player } from '../types'
import { generateId, formatScore } from '../lib/utils'
import { logEvent } from '../lib/logger'
import GameBoard from '../components/GameBoard'
import Scoreboard from '../components/Scoreboard'

export default function PlayerPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const playerName = params.get('name') || 'Player'
  const { roomCode, state, setState, setMyPlayerId,
    addBuzz, patchState, updatePlayer, removePlayer, setSettings } = useGameStore()

  const [connected, setConnected] = useState(false)
  const [hasBuzzed, setHasBuzzed] = useState(false)
  const [judgeResult, setJudgeResult] = useState<'correct' | 'wrong' | null>(null)
  const [hostLeft, setHostLeft] = useState(false)
  const hostPeerId = useRef<string | null>(null)

  const [myId] = useState(() => {
    const existing = useGameStore.getState().myPlayerId
    if (existing) return existing
    return generateId()
  })
  const [nameTaken, setNameTaken] = useState(false)
  const hasLoggedJoin = useRef(false)

  useEffect(() => {
    if (!roomCode) { navigate('/'); return }

    net.joinGameRoom(roomCode)
    setMyPlayerId(myId)

    net.onPeerJoin(() => {
      setConnected(true)
      const me: Player = { id: myId, name: playerName, score: 0, isConnected: true }
      net.broadcast({ type: 'PLAYER_JOIN', player: me })
    })

    net.onPeerLeave((peerId) => {
      if (peerId === hostPeerId.current) {
        setHostLeft(true)
      }
    })

    net.onMessage((msg: NetMessage, peerId: string) => {
      if (msg.type === 'SYNC_STATE') {
        if (!hostPeerId.current) hostPeerId.current = peerId
        setState(msg.state)
        setConnected(true)
        if (!hasLoggedJoin.current) {
          hasLoggedJoin.current = true
          logEvent({ role: 'player', roomCode, actor: playerName, event: 'Joined room successfully' })
        }
      }
      if (msg.type === 'OPEN_CARD') {
        setHasBuzzed(false)
        setJudgeResult(null)
        let mediaType: 'image' | 'audio' | 'video' | undefined
        if (msg.mediaDataUrl) {
          if (msg.mediaDataUrl.startsWith('data:image')) mediaType = 'image'
          else if (msg.mediaDataUrl.startsWith('data:audio')) mediaType = 'audio'
          else if (msg.mediaDataUrl.startsWith('data:video')) mediaType = 'video'
        }
        patchState({
          phase: 'question',
          activeQuestion: { categoryId: msg.categoryId, question: msg.question },
          buzzQueue: [],
          activeMedia: msg.mediaDataUrl && mediaType
            ? { type: mediaType, dataUrl: msg.mediaDataUrl }
            : null,
        })
      }
      if (msg.type === 'CLOSE_CARD') {
        patchState({ phase: 'board', activeQuestion: null, buzzQueue: [], activeMedia: null })
        setHasBuzzed(false)
        setJudgeResult(null)
      }
      if (msg.type === 'START_BUZZING') {
        patchState({ phase: 'buzzing', buzzQueue: [] })
        setHasBuzzed(false)
      }
      if (msg.type === 'BUZZ' && peerId === hostPeerId.current) {
        addBuzz(msg.playerId)
      }
      if (msg.type === 'JUDGE') {
        const { playerId, correct, pointDelta } = msg
        patchState({
          phase: correct ? 'revealed' : 'buzzing',
          players: useGameStore.getState().state.players.map(p =>
            p.id === playerId ? { ...p, score: p.score + pointDelta } : p
          ),
          buzzQueue: correct
            ? useGameStore.getState().state.buzzQueue
            : useGameStore.getState().state.buzzQueue.filter(id => id !== playerId),
        })
        if (playerId === myId) {
          setJudgeResult(correct ? 'correct' : 'wrong')
          setTimeout(() => setJudgeResult(null), 2500)
        }
      }
      if (msg.type === 'REVEAL_ANSWER') {
        patchState({ phase: 'revealed' })
      }
      if (msg.type === 'MARK_ANSWERED') {
        patchState({
          answeredCells: [...useGameStore.getState().state.answeredCells, msg.cellId],
          phase: 'board',
          activeQuestion: null,
          buzzQueue: [],
          activeMedia: null,
        })
        setHasBuzzed(false)
        setJudgeResult(null)
      }
      if (msg.type === 'UPDATE_PLAYER') {
        updatePlayer(msg.player)
      }
      if (msg.type === 'JOIN_REJECTED') {
        if (msg.reason === 'NAME_TAKEN') setNameTaken(true)
      }
      if (msg.type === 'REMOVE_PLAYER') {
        if (msg.playerId === myId) {
          setMyPlayerId(null)
          alert('You have been removed from the game.')
          navigate('/')
        } else {
          removePlayer(msg.playerId)
        }
      }
      if (msg.type === 'UPDATE_SETTINGS') {
        setSettings(msg.settings)
      }
    })

    return () => {
      net.leaveRoom()
      logEvent({ role: 'player', roomCode, actor: playerName, event: 'Left room' })
    }
  }, [roomCode]) // eslint-disable-line react-hooks/exhaustive-deps

  const myPlayer = state.players.find((p) => p.id === myId)

  useEffect(() => {
    if (myPlayer && myPlayer.name !== params.get('name')) {
      setParams({ name: myPlayer.name }, { replace: true })
    }
  }, [myPlayer?.name]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleBuzz() {
    if (hasBuzzed || state.phase !== 'buzzing') return
    setHasBuzzed(true)
    if (hostPeerId.current) {
      net.send({ type: 'BUZZ', playerId: myId, playerName: myPlayer?.name ?? playerName }, hostPeerId.current)
    }
  }

  const myScore = myPlayer?.score ?? 0
  const isMyTurn = state.buzzQueue[0] === myId
  const activeQ = state.activeQuestion?.question
  const categoryName = state.board?.categories.find(c => c.id === state.activeQuestion?.categoryId)?.name ?? ''
  const showOverlay = ['question', 'buzzing', 'revealed'].includes(state.phase) && !!activeQ

  useEffect(() => {
    if (!hostLeft) return
    logEvent({ role: 'player', roomCode: roomCode ?? '', actor: playerName, event: 'Host left the room' })
    const t = setTimeout(() => {
      net.leaveRoom()
      navigate('/')
    }, 3000)
    return () => clearTimeout(t)
  }, [hostLeft]) // eslint-disable-line react-hooks/exhaustive-deps

  if (hostLeft) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ background: 'var(--navy)' }}>
        <div className="font-display text-4xl" style={{ color: 'var(--gold-bright)' }}>JEOPARDY!</div>
        <div className="font-condensed text-xl" style={{ color: 'var(--red)' }}>
          Host has left the room.
        </div>
        <div className="text-sm text-center max-w-xs" style={{ color: '#4a5580' }}>
          The game session ended because the host disconnected. Returning to home…
        </div>
        <button
          className="btn-outline mt-2"
          onClick={() => {
            net.leaveRoom()
            navigate('/')
          }}
        >
          Back to home
        </button>
      </div>
    )
  }

  if (nameTaken) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ background: 'var(--navy)' }}>
        <div className="font-display text-4xl" style={{ color: 'var(--gold-bright)' }}>JEOPARDY!</div>
        <div className="font-condensed text-xl" style={{ color: 'var(--red)' }}>
          That name is already taken.
        </div>
        <div className="text-sm text-center max-w-xs" style={{ color: '#4a5580' }}>
          Someone in room <span style={{ color: 'var(--gold)' }}>{roomCode}</span> is already using the name <span style={{ color: 'var(--white)' }}>"{playerName}"</span>. Please go back and choose a different name.
        </div>
        <button
          className="btn-outline mt-2"
          onClick={() => {
            setMyPlayerId(null)
            navigate('/')
          }}
        >
          Back to home
        </button>
      </div>
    )
  }

  if (!connected) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ background: 'var(--navy)' }}>
        <div className="font-display text-4xl" style={{ color: 'var(--gold-bright)' }}>JEOPARDY!</div>
        <div className="font-condensed text-lg animate-pulse" style={{ color: '#4a5580' }}>
          Connecting to room <span style={{ color: 'var(--gold)' }}>{roomCode}</span>…
        </div>
        <div className="text-sm" style={{ color: '#4a5580' }}>Waiting for host to accept players</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--navy)' }}>
      {/* Top bar */}
      <div className="flex items-center justify-between border-b" style={{ borderColor: 'var(--navy-light)', background: 'var(--navy-mid)', padding: '10px 24px' }}>
        <div className="font-display text-2xl" style={{ color: 'var(--gold-bright)' }}>JEOPARDY!</div>
        <div className="text-right">
          <div className="font-condensed font-bold" style={{ color: 'var(--white)' }}>{myPlayer?.name ?? playerName}</div>
          <div className="font-display text-xl" style={{ color: myScore < 0 ? '#e07070' : 'var(--gold-bright)' }}>
            {formatScore(myScore)}
          </div>
        </div>
      </div>

      {/* Board view */}
      <div className="flex flex-1 min-h-0">
        <div className="flex-1 flex flex-col p-4 gap-4 overflow-auto">
          {state.board ? (
            <GameBoard
              board={state.board}
              answeredCells={state.answeredCells}
            />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-2">
              <div className="font-display text-4xl" style={{ color: 'var(--gold)', opacity: 0.3 }}>?</div>
              <div className="font-condensed text-lg" style={{ color: '#4a5580' }}>
                Waiting for host to load a board…
              </div>
            </div>
          )}
        </div>

        {/* Scoreboard sidebar */}
        <div className="w-64 flex-shrink-0 border-l p-4 overflow-auto" style={{ borderColor: 'var(--navy-light)' }}>
          <div className="font-condensed font-bold uppercase tracking-widest text-xs mb-3" style={{ color: 'var(--gold)', opacity: 0.7 }}>
            Scoreboard
          </div>
          <Scoreboard players={state.players} buzzQueue={state.buzzQueue} highlightId={myId} />
        </div>
      </div>

      {/* Question overlay — mirrors QuestionOverlay layout without host controls */}
      {showOverlay && activeQ && (
        <div
          className="fixed inset-0 z-50 flex flex-col"
          style={{ background: 'rgba(6,11,40,0.97)', backdropFilter: 'blur(4px)' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--navy-light)' }}>
            <div className="font-condensed font-bold uppercase tracking-wider" style={{ color: 'var(--gold)', fontSize: 14 }}>
              {categoryName}
              {categoryName && <span style={{ opacity: 0.5 }}> &nbsp;·&nbsp; </span>}
              <span className="font-display text-xl" style={{ color: 'var(--gold-bright)' }}>${activeQ.points}</span>
            </div>
          </div>

          <div className="flex-1 flex gap-6 p-6 min-h-0">
            {/* Main question area */}
            <div className="flex-1 flex flex-col items-center justify-center text-center card-flip">
              {state.activeMedia && (
                <div className="mb-6">
                  {state.activeMedia.type === 'image' && (
                    <img src={state.activeMedia.dataUrl} className="max-h-48 rounded-lg object-contain mx-auto" alt="Question media" />
                  )}
                  {state.activeMedia.type === 'audio' && (
                    <audio controls src={state.activeMedia.dataUrl} autoPlay className="mx-auto" />
                  )}
                  {state.activeMedia.type === 'video' && (
                    <video controls src={state.activeMedia.dataUrl} autoPlay className="max-h-48 rounded-lg mx-auto" />
                  )}
                </div>
              )}

              <div
                className="font-condensed font-bold text-3xl md:text-4xl leading-snug mb-6 max-w-2xl"
                style={{ color: 'var(--white)' }}
              >
                {activeQ.question}
              </div>

              {state.phase === 'revealed' && (
                <div
                  className="font-display text-2xl md:text-3xl px-6 py-3 rounded-lg mt-2"
                  style={{ background: 'rgba(212,160,23,0.15)', border: '2px solid var(--gold)', color: 'var(--gold-bright)' }}
                >
                  {activeQ.answer || '—'}
                </div>
              )}
            </div>

            {/* Right panel */}
            <div className="w-72 flex-shrink-0 flex flex-col gap-4">
              {/* Buzz button / status */}
              <div className="panel flex flex-col items-center gap-3">
                {state.phase === 'buzzing' && !judgeResult && !(hasBuzzed && !state.buzzQueue.includes(myId)) && (
                  <>
                    <button
                      className={`w-32 h-32 rounded-full font-display transition-all ${!hasBuzzed ? 'buzz-btn' : ''}`}
                      style={{
                        background: hasBuzzed
                          ? isMyTurn ? 'rgba(212,160,23,0.3)' : 'rgba(74,85,128,0.2)'
                          : 'var(--gold)',
                        border: `4px solid ${hasBuzzed ? (isMyTurn ? 'var(--gold)' : 'var(--navy-light)') : 'var(--gold-bright)'}`,
                        color: hasBuzzed ? (isMyTurn ? 'var(--gold-bright)' : '#4a5580') : 'var(--navy)',
                        fontSize: hasBuzzed ? 13 : 22,
                        cursor: hasBuzzed ? 'default' : 'pointer',
                      }}
                      onClick={handleBuzz}
                      disabled={hasBuzzed}
                    >
                      {hasBuzzed
                        ? isMyTurn
                          ? 'YOUR TURN'
                          : `#${state.buzzQueue.indexOf(myId) + 1} in queue`
                        : 'BUZZ!'}
                    </button>
                    {!hasBuzzed && (
                      <div className="font-condensed text-sm" style={{ color: '#4a5580' }}>
                        {state.buzzQueue.length > 0
                          ? `${state.buzzQueue.length} player${state.buzzQueue.length > 1 ? 's' : ''} buzzed`
                          : 'Be first to buzz!'}
                      </div>
                    )}
                  </>
                )}

                {state.phase === 'question' && (
                  <div className="font-condensed text-sm text-center" style={{ color: '#4a5580' }}>
                    Waiting for host to open buzzing…
                  </div>
                )}

                {state.phase === 'revealed' && (
                  <div className="font-condensed text-sm text-center" style={{ color: '#4a5580' }}>
                    Answer revealed
                  </div>
                )}

                {judgeResult && (
                  <div
                    className="font-display text-2xl text-center rounded-xl w-full py-3 card-flip"
                    style={{
                      background: judgeResult === 'correct' ? 'rgba(39,174,96,0.2)' : 'rgba(192,57,43,0.2)',
                      border: `2px solid ${judgeResult === 'correct' ? 'var(--green)' : 'var(--red)'}`,
                      color: judgeResult === 'correct' ? '#4cd98a' : '#e07070',
                    }}
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
                )}
              </div>

              {/* Buzz queue */}
              {state.buzzQueue.length > 0 && (
                <div className="panel flex flex-col gap-2">
                  <div className="font-condensed text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--gold)', opacity: 0.7 }}>
                    Buzz queue
                  </div>
                  {state.buzzQueue.map((pid, idx) => {
                    const p = state.players.find((pl) => pl.id === pid)
                    if (!p) return null
                    return (
                      <div key={pid} className="flex items-center gap-2">
                        <div className="flex-1">
                          <div className="font-condensed font-bold text-sm" style={{ color: pid === myId ? 'var(--gold-bright)' : undefined }}>
                            {p.name}{pid === myId ? ' (you)' : ''}
                          </div>
                          <div className="text-xs" style={{ color: 'var(--gold)' }}>
                            {p.score < 0 ? `-$${Math.abs(p.score)}` : `$${p.score}`}
                          </div>
                        </div>
                        <div className="text-xs" style={{ color: '#4a5580' }}>#{idx + 1}</div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Scores */}
              <div className="panel flex flex-col gap-2 overflow-auto flex-1">
                <div className="font-condensed text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--gold)', opacity: 0.7 }}>Scores</div>
                {[...state.players].sort((a, b) => b.score - a.score).map((p) => (
                  <div key={p.id} className="flex justify-between items-center">
                    <span
                      className="font-condensed text-sm truncate"
                      style={{ color: p.id === myId ? 'var(--gold-bright)' : undefined }}
                    >
                      {p.name}{p.id === myId ? ' (you)' : ''}
                    </span>
                    <span className="font-display text-base" style={{ color: p.score < 0 ? '#e07070' : 'var(--gold-bright)' }}>
                      {p.score < 0 ? `-$${Math.abs(p.score)}` : `$${p.score}`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
