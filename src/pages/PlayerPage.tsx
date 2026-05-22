import { useEffect, useRef, useState } from 'react'
import { Check, X, LogOut } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useGameStore } from '../store/gameStore'
import * as net from '../lib/network'
import type { NetMessage, Player } from '../types'
import { generateId, formatScore } from '../lib/utils'
import { logEvent } from '../lib/logger'
import GameBoard from '../components/GameBoard'
import Scoreboard from '../components/Scoreboard'
import Podium from '../components/Podium'

export default function PlayerPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const playerName = params.get('name') || 'Player'
  const { roomCode, state, settings, setState, setMyPlayerId,
    addBuzz, patchState, updatePlayer, removePlayer, setSettings } = useGameStore()

  const [connected, setConnected] = useState(false)
  const [hasBuzzed, setHasBuzzed] = useState(false)
  const [judgeResult, setJudgeResult] = useState<'correct' | 'wrong' | null>(null)
  const [hostLeft, setHostLeft] = useState(false)
  const [ddWagerInput, setDdWagerInput] = useState('')
  const [ddWagerError, setDdWagerError] = useState('')
  const [ddWagerSubmitted, setDdWagerSubmitted] = useState(false)
  const [activeEmojis, setActiveEmojis] = useState<Record<string, { emoji: string; seq: number }>>({})
  const hostPeerId = useRef<string | null>(null)
  const emojiTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

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
        patchState({ phase: 'board', activeQuestion: null, buzzQueue: [], activeMedia: null, dailyDouble: null })
        setHasBuzzed(false)
        setJudgeResult(null)
        setDdWagerInput('')
        setDdWagerError('')
        setDdWagerSubmitted(false)
      }
      if (msg.type === 'DAILY_DOUBLE_REVEAL') {
        setHasBuzzed(false)
        setJudgeResult(null)
        setDdWagerInput('')
        setDdWagerError('')
        setDdWagerSubmitted(false)
        let mediaType: 'image' | 'audio' | 'video' | undefined
        if (msg.mediaDataUrl) {
          if (msg.mediaDataUrl.startsWith('data:image')) mediaType = 'image'
          else if (msg.mediaDataUrl.startsWith('data:audio')) mediaType = 'audio'
          else if (msg.mediaDataUrl.startsWith('data:video')) mediaType = 'video'
        }
        patchState({
          phase: 'dailyDouble',
          activeQuestion: { categoryId: msg.categoryId, question: msg.question },
          buzzQueue: [],
          dailyDouble: { playerId: msg.playerId, wager: null },
          activeMedia: msg.mediaDataUrl && mediaType
            ? { type: mediaType, dataUrl: msg.mediaDataUrl }
            : null,
        })
      }
      if (msg.type === 'DAILY_DOUBLE_ACCEPT_BET') {
        patchState({
          phase: 'dailyDoubleBet',
          dailyDouble: useGameStore.getState().state.dailyDouble
            ? { ...useGameStore.getState().state.dailyDouble!, wager: msg.wager }
            : null,
        })
      }
      if (msg.type === 'DAILY_DOUBLE_REVEAL_CLUE') {
        patchState({ phase: 'question' })
      }
      if (msg.type === 'START_BUZZING') {
        patchState({ phase: 'buzzing', buzzQueue: [] })
        setHasBuzzed(false)
      }
      if (msg.type === 'BUZZ' && peerId === hostPeerId.current) {
        addBuzz(msg.playerId)
      }
      if (msg.type === 'JUDGE') {
        const { playerId, correct, pointDelta, boardControlId } = msg
        patchState({
          phase: correct ? 'revealed' : 'buzzing',
          players: useGameStore.getState().state.players.map(p =>
            p.id === playerId ? { ...p, score: p.score + pointDelta } : p
          ),
          buzzQueue: correct
            ? useGameStore.getState().state.buzzQueue
            : useGameStore.getState().state.buzzQueue.filter(id => id !== playerId),
          ...(boardControlId != null && { boardControlId }),
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
          dailyDouble: null,
        })
        setHasBuzzed(false)
        setJudgeResult(null)
        setDdWagerInput('')
        setDdWagerError('')
        setDdWagerSubmitted(false)
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
      if (msg.type === 'SET_BOARD_CONTROL') {
        patchState({ boardControlId: msg.playerId })
      }
      if (msg.type === 'UPDATE_SETTINGS') {
        setSettings(msg.settings)
      }
      if (msg.type === 'EMOJI_REACT') {
        applyEmojiReaction(msg.playerId, msg.emoji)
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

  function applyEmojiReaction(playerId: string, emoji: string) {
    if (emojiTimers.current[playerId]) clearTimeout(emojiTimers.current[playerId])
    setActiveEmojis((prev) => ({
      ...prev,
      [playerId]: { emoji, seq: (prev[playerId]?.seq ?? 0) + 1 },
    }))
    emojiTimers.current[playerId] = setTimeout(() => {
      setActiveEmojis((prev) => {
        const next = { ...prev }
        delete next[playerId]
        return next
      })
    }, 3500)
  }

  function handleEmojiSelect(emoji: string) {
    net.broadcast({ type: 'EMOJI_REACT', playerId: myId, emoji })
    applyEmojiReaction(myId, emoji)
  }

  function handleExitRoom() {
    net.leaveRoom()
    logEvent({ role: 'player', roomCode: roomCode ?? '', actor: playerName, event: 'Left room voluntarily' })
    useGameStore.getState().leaveRoom()
    navigate('/')
  }

  const myScore = myPlayer?.score ?? 0
  const isMyTurn = state.buzzQueue[0] === myId
  const activeQ = state.activeQuestion?.question
  const categoryName = state.board?.categories.find(c => c.id === state.activeQuestion?.categoryId)?.name ?? ''
  const showOverlay = ['question', 'buzzing', 'revealed', 'dailyDouble', 'dailyDoubleBet'].includes(state.phase) && !!activeQ
  const isDD = state.dailyDouble !== null
  const isDDPlayer = state.dailyDouble?.playerId === myId
  const ddPlayerInfo = state.dailyDouble ? state.players.find(p => p.id === state.dailyDouble!.playerId) : null
  const clueBlurred = settings.blurClueOnBuzz && state.phase === 'buzzing' && state.buzzQueue.length > 0

  function handleSubmitWager() {
    const wager = parseInt(ddWagerInput, 10)
    if (isNaN(wager) || wager < 1) {
      setDdWagerError('Minimum wager is $1')
      return
    }
    const maxPointValue = Math.max(...(state.board?.pointValues ?? [0]))
    const maxWager = myScore > maxPointValue ? myScore : maxPointValue
    if (wager > maxWager) {
      setDdWagerError(`Maximum wager is $${maxWager}`)
      return
    }
    setDdWagerError('')
    setDdWagerSubmitted(true)
    if (hostPeerId.current) {
      net.send({ type: 'DAILY_DOUBLE_BET', wager, playerId: myId }, hostPeerId.current)
    }
  }

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
        <div className="flex items-center gap-3">
          {state.boardControlId === myId && (
            <div
              className="font-condensed text-xs px-2 py-1 rounded"
              style={{
                background: 'rgba(0,200,180,0.2)',
                color: '#40e0d0',
                border: '1px solid rgba(0,200,180,0.45)',
              }}
            >
              YOUR TURN TO PICK
            </div>
          )}
          <div className="text-right">
            <div className="font-condensed font-bold" style={{ color: 'var(--white)' }}>{myPlayer?.name ?? playerName}</div>
            <div className="font-display text-xl" style={{ color: myScore < 0 ? '#e07070' : 'var(--gold-bright)' }}>
              {formatScore(myScore)}
            </div>
          </div>
          <button
            className="btn-icon-exit"
            onClick={handleExitRoom}
            title="Exit room"
          >
            <LogOut size={22} />
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-col flex-1 min-h-0 overflow-auto">
        <div className="flex-1 flex flex-col p-4 gap-4">
          {/* Game start waiting screen */}
          {state.phase === 'gameStart' && (
            <div className="flex-1 flex flex-col items-center justify-center gap-4">
              <div className="font-display text-4xl" style={{ color: 'var(--gold-bright)' }}>JEOPARDY!</div>
              <div className="font-condensed text-lg animate-pulse" style={{ color: '#4a5580' }}>
                Waiting for host to start the game…
              </div>
              <div className="font-condensed text-sm" style={{ color: '#8899cc' }}>
                {state.gameBoardIds.length} board{state.gameBoardIds.length !== 1 ? 's' : ''} queued
              </div>
            </div>
          )}

          {/* Podium view */}
          {state.phase === 'podium' && (
            <div className="flex-1 flex flex-col items-center justify-center">
              <Podium players={state.players} highlightId={myId} />
            </div>
          )}

          {/* Normal board view */}
          {state.phase !== 'gameStart' && state.phase !== 'podium' && (
            <>
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
            </>
          )}
        </div>

        {/* Horizontal scoreboard */}
        {state.phase !== 'podium' && (
          <div
            className="flex-shrink-0 border-t px-4 py-4"
            style={{ borderColor: 'var(--navy-light)' }}
          >
            <div className="font-condensed font-bold uppercase tracking-widest text-xs mb-3" style={{ color: 'var(--gold)', opacity: 0.7 }}>
              Scoreboard
            </div>
            <Scoreboard
              players={state.players}
              buzzQueue={state.buzzQueue}
              highlightId={myId}
              boardControlId={state.boardControlId}
              activeEmojis={activeEmojis}
              myPlayerId={myId}
              onEmojiSelect={handleEmojiSelect}
            />
          </div>
        )}
      </div>

      {/* Board transition overlay */}
      {state.boardTransition && (
        <div className="board-transition-overlay">
          <div className="board-transition-title">{state.boardTransition}</div>
        </div>
      )}

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
              {isDD && <span style={{ color: 'var(--gold-bright)', marginLeft: 8 }}>DAILY DOUBLE</span>}
            </div>
          </div>

          <div className="flex-1 flex gap-6 p-6 min-h-0">
            {/* Main area */}
            <div className="flex-1 flex flex-col items-center justify-center text-center card-flip">
              {/* DD title splash */}
              {state.phase === 'dailyDouble' && (
                <div className="daily-double-title">DAILY DOUBLE!</div>
              )}

              {/* DD wager submitted — waiting for host to reveal clue */}
              {state.phase === 'dailyDoubleBet' && (
                <div className="flex flex-col items-center gap-4">
                  <div className="daily-double-title" style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)' }}>DAILY DOUBLE!</div>
                  {state.dailyDouble?.wager != null && (
                    <div className="font-condensed text-2xl" style={{ color: 'var(--gold-bright)' }}>
                      Wager: <span className="font-display">${state.dailyDouble.wager}</span>
                    </div>
                  )}
                  <div className="font-condensed text-lg animate-pulse" style={{ color: '#4a5580' }}>
                    Waiting for host to reveal the clue…
                  </div>
                </div>
              )}

              {/* Clue (shown in question/buzzing/revealed phases) */}
              {(state.phase === 'question' || state.phase === 'buzzing' || state.phase === 'revealed') && (
                <>
                  {state.activeMedia && (
                    <div
                      className="mb-6"
                      style={{
                        filter: clueBlurred ? 'blur(8px)' : 'none',
                        transition: 'filter 0.3s ease',
                      }}
                    >
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
                    style={{
                      color: 'var(--white)',
                      filter: clueBlurred ? 'blur(8px)' : 'none',
                      transition: 'filter 0.3s ease',
                      userSelect: clueBlurred ? 'none' : undefined,
                    }}
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
                </>
              )}
            </div>

            {/* Right panel */}
            <div className="w-72 flex-shrink-0 flex flex-col gap-4">
              <div className="panel flex flex-col items-center gap-3">
                {/* DD: title phase — wager input for DD player, waiting message for others */}
                {state.phase === 'dailyDouble' && (
                  isDDPlayer ? (
                    <div className="w-full flex flex-col gap-3">
                      <div className="font-condensed font-bold text-sm text-center" style={{ color: 'var(--gold-bright)' }}>
                        Enter your wager
                      </div>
                      <div className="text-xs text-center" style={{ color: '#4a5580' }}>
                        Min: $1 &middot; Max: ${(() => {
                          const maxPV = Math.max(...(state.board?.pointValues ?? [0]))
                          return myScore > maxPV ? myScore : maxPV
                        })()}
                      </div>
                      <input
                        type="number"
                        min={1}
                        className="w-full text-center font-display text-xl"
                        placeholder="Wager amount"
                        value={ddWagerInput}
                        onChange={(e) => { setDdWagerInput(e.target.value); setDdWagerError('') }}
                        onKeyDown={(e) => e.key === 'Enter' && handleSubmitWager()}
                        disabled={ddWagerSubmitted}
                        autoFocus
                      />
                      {ddWagerError && (
                        <div className="text-xs text-center" style={{ color: 'var(--red)' }}>{ddWagerError}</div>
                      )}
                      <button
                        className="btn-gold w-full py-3"
                        onClick={handleSubmitWager}
                        disabled={ddWagerSubmitted}
                      >
                        {ddWagerSubmitted ? 'Wager submitted' : 'Submit wager'}
                      </button>
                    </div>
                  ) : (
                    <div className="font-condensed text-sm text-center" style={{ color: '#4a5580' }}>
                      Waiting for {ddPlayerInfo?.name ?? 'player'} to wager…
                    </div>
                  )
                )}

                {/* DD: bet phase — wager confirmed, waiting for host to reveal clue */}
                {isDD && state.phase === 'dailyDoubleBet' && (
                  <div className="w-full flex flex-col gap-2 items-center">
                    {isDDPlayer ? (
                      <div className="font-condensed text-sm text-center" style={{ color: 'var(--gold-bright)' }}>
                        Wager submitted: <span className="font-display text-lg">${state.dailyDouble?.wager}</span>
                      </div>
                    ) : (
                      <div className="font-condensed text-sm text-center" style={{ color: '#8899cc' }}>
                        {ddPlayerInfo?.name} wagered <span className="font-display">${state.dailyDouble?.wager}</span>
                      </div>
                    )}
                    <div className="font-condensed text-sm text-center" style={{ color: '#4a5580' }}>
                      Waiting for host to reveal the clue…
                    </div>
                  </div>
                )}

                {/* DD: question phase — waiting for host to judge */}
                {isDD && state.phase === 'question' && (
                  <div className="w-full flex flex-col gap-2 items-center">
                    {state.dailyDouble?.wager != null && (
                      <div className="font-condensed text-sm" style={{ color: 'var(--gold-bright)' }}>
                        {isDDPlayer ? 'Your' : `${ddPlayerInfo?.name}'s`} wager: <span className="font-display text-lg">${state.dailyDouble.wager}</span>
                      </div>
                    )}
                    <div className="font-condensed text-sm text-center" style={{ color: '#4a5580' }}>
                      Waiting for host to judge…
                    </div>
                  </div>
                )}

                {/* Normal: buzzing phase */}
                {!isDD && state.phase === 'buzzing' && !judgeResult && !(hasBuzzed && !state.buzzQueue.includes(myId)) && (
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

                {/* Normal: question phase — waiting for buzzing */}
                {!isDD && state.phase === 'question' && (
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

              {/* Buzz queue (hidden during DD) */}
              {!isDD && state.buzzQueue.length > 0 && (
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
