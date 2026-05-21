import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useGameStore } from '../store/gameStore'
import * as net from '../lib/network'
import type { NetMessage, Player } from '../types'
import { generateId, formatScore } from '../lib/utils'
import { logEvent } from '../lib/logger'
import Scoreboard from '../components/Scoreboard'

export default function PlayerPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const playerName = params.get('name') || 'Player'
  const { roomCode, state, setState, setMyPlayerId,
    addBuzz, patchState, updatePlayer, removePlayer, setSettings } = useGameStore()

  const [connected, setConnected] = useState(false)
  const [hasBuzzed, setHasBuzzed] = useState(false)
  const [judgeResult, setJudgeResult] = useState<'correct' | 'wrong' | null>(null)
  const [buzzCount, setBuzzCount] = useState(0)

  const [myId] = useState(generateId)
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

    net.onMessage((msg: NetMessage) => {
      if (msg.type === 'SYNC_STATE') {
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
        setBuzzCount(0)
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
      if (msg.type === 'BUZZ') {
        addBuzz(msg.playerId)
        setBuzzCount((c) => c + 1)
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
      if (msg.type === 'REMOVE_PLAYER') {
        if (msg.playerId === myId) {
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

  function handleBuzz() {
    if (hasBuzzed || state.phase !== 'buzzing') return
    setHasBuzzed(true)
    net.broadcast({ type: 'BUZZ', playerId: myId, playerName })
  }

  const myPlayer = state.players.find((p) => p.id === myId)
  const myScore = myPlayer?.score ?? 0
  const isMyTurn = state.buzzQueue[0] === myId
  const activeQ = state.activeQuestion?.question

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
      <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--navy-light)', background: 'var(--navy-mid)' }}>
        <div className="font-display text-xl" style={{ color: 'var(--gold-bright)' }}>JEOPARDY!</div>
        <div className="text-right">
          <div className="font-condensed font-bold" style={{ color: 'var(--white)' }}>{playerName}</div>
          <div className="font-display text-xl" style={{ color: myScore < 0 ? '#e07070' : 'var(--gold-bright)' }}>
            {formatScore(myScore)}
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-4 gap-6">
        {/* Active question */}
        {activeQ && (
          <div className="w-full max-w-lg panel text-center card-flip">
            <div className="font-condensed text-xs uppercase tracking-widest mb-3" style={{ color: 'var(--gold)', opacity: 0.7 }}>
              ${activeQ.points}
            </div>

            {state.activeMedia && (
              <div className="mb-4">
                {state.activeMedia.type === 'image' && (
                  <img src={state.activeMedia.dataUrl} className="max-h-40 rounded mx-auto object-contain" alt="Question media" />
                )}
                {state.activeMedia.type === 'audio' && (
                  <audio controls src={state.activeMedia.dataUrl} autoPlay className="mx-auto" />
                )}
                {state.activeMedia.type === 'video' && (
                  <video controls src={state.activeMedia.dataUrl} autoPlay className="max-h-40 rounded mx-auto" />
                )}
              </div>
            )}

            <div className="font-condensed font-bold text-xl mb-4" style={{ color: 'var(--white)' }}>
              {activeQ.question}
            </div>

            {state.phase === 'revealed' && (
              <div className="font-display text-xl px-4 py-2 rounded" style={{ background: 'rgba(212,160,23,0.15)', border: '2px solid var(--gold)', color: 'var(--gold-bright)' }}>
                {activeQ.answer}
              </div>
            )}
          </div>
        )}

        {/* Judge result */}
        {judgeResult && (
          <div
            className="font-display text-4xl text-center px-8 py-4 rounded-xl card-flip"
            style={{
              background: judgeResult === 'correct' ? 'rgba(39,174,96,0.2)' : 'rgba(192,57,43,0.2)',
              border: `2px solid ${judgeResult === 'correct' ? 'var(--green)' : 'var(--red)'}`,
              color: judgeResult === 'correct' ? '#4cd98a' : '#e07070',
            }}
          >
            {judgeResult === 'correct' ? '✓ Correct!' : '✗ Wrong'}
          </div>
        )}

        {/* Buzz button */}
        {(state.phase === 'buzzing' || state.phase === 'judging') && !judgeResult && (
          <div className="flex flex-col items-center gap-3">
            <button
              className={`w-40 h-40 rounded-full font-display transition-all ${!hasBuzzed && state.phase === 'buzzing' ? 'buzz-btn' : ''}`}
              style={{
                background: hasBuzzed
                  ? isMyTurn ? 'rgba(212,160,23,0.3)' : 'rgba(74,85,128,0.2)'
                  : 'var(--gold)',
                border: `4px solid ${hasBuzzed ? (isMyTurn ? 'var(--gold)' : 'var(--navy-light)') : 'var(--gold-bright)'}`,
                color: hasBuzzed ? (isMyTurn ? 'var(--gold-bright)' : '#4a5580') : 'var(--navy)',
                fontSize: hasBuzzed ? 14 : 24,
                cursor: hasBuzzed || state.phase !== 'buzzing' ? 'default' : 'pointer',
              }}
              onClick={handleBuzz}
              disabled={hasBuzzed || state.phase !== 'buzzing'}
            >
              {hasBuzzed
                ? isMyTurn
                  ? 'YOUR TURN'
                  : `#${state.buzzQueue.indexOf(myId) + 1} in queue`
                : 'BUZZ!'}
            </button>
            {!hasBuzzed && (
              <div className="font-condensed text-sm" style={{ color: '#4a5580' }}>
                {buzzCount > 0 ? `${buzzCount} player${buzzCount > 1 ? 's' : ''} buzzed` : 'Be first to buzz!'}
              </div>
            )}
          </div>
        )}

        {/* Idle */}
        {state.phase === 'board' && !activeQ && (
          <div className="text-center">
            <div className="font-condensed text-lg mb-2" style={{ color: '#4a5580' }}>
              Waiting for host to open a question…
            </div>
            <div className="font-display text-4xl" style={{ color: 'var(--gold)', opacity: 0.3 }}>?</div>
          </div>
        )}

        {/* Scoreboard */}
        {state.players.length > 0 && (
          <div className="w-full max-w-lg">
            <div className="font-condensed text-xs uppercase tracking-widest mb-2" style={{ color: 'var(--gold)', opacity: 0.5 }}>
              Scoreboard
            </div>
            <Scoreboard players={state.players} buzzQueue={state.buzzQueue} highlightId={myId} />
          </div>
        )}
      </div>
    </div>
  )
}
