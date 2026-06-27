import { useEffect, useRef, useState } from 'react'
import { LogOut, Users, ChevronUp, ChevronDown } from 'lucide-react'
import PlayerActionZone from '../components/PlayerActionZone'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useGameStore } from '../store/gameStore'
import * as net from '../lib/network'
import type { NetMessage, Player } from '../types'
import { initialMediaPlaybackForType } from '../types'
import { generateId, formatScore } from '../lib/utils'
import { logEvent } from '../lib/logger'
import GameBoard from '../components/GameBoard'
import Scoreboard from '../components/Scoreboard'
import Podium from '../components/Podium'
import QuestionMediaPlayer from '../components/QuestionMediaPlayer'

export default function PlayerPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const playerName = params.get('name') || 'Player'
  const { roomCode, state, settings, setState, setMyPlayerId,
    addBuzz, patchState, updatePlayer, removePlayer, setSettings, setPlayerConnected } = useGameStore()

  const [connected, setConnected] = useState(false)
  const [hasBuzzed, setHasBuzzed] = useState(false)
  const wasInBuzzQueueRef = useRef(false)
  const [judgeResult, setJudgeResult] = useState<'correct' | 'wrong' | null>(null)
  const [hostLeft, setHostLeft] = useState(false)
  const [ddWagerInput, setDdWagerInput] = useState('')
  const [ddWagerError, setDdWagerError] = useState('')
  const [ddWagerSubmitted, setDdWagerSubmitted] = useState(false)
  const [activeEmojis, setActiveEmojis] = useState<Record<string, { emoji: string; seq: number }>>({})
  const [, bumpAnimRender] = useState(0)
  const [clueRevealKey, setClueRevealKey] = useState(0)
  const [mediaRevealKey, setMediaRevealKey] = useState(0)
  const [answerRevealKey, setAnswerRevealKey] = useState(0)
  const [scorePulsing, setScorePulsing] = useState(false)
  const [buzzQueuePopupOpen, setBuzzQueuePopupOpen] = useState(false)
  const [buzzQueuePopupActive, setBuzzQueuePopupActive] = useState(false)
  const [mobilePlayersOpen, setMobilePlayersOpen] = useState(false)
  const [isMobileViewport, setIsMobileViewport] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches,
  )
  const hostPeerId = useRef<string | null>(null)
  const emojiTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const prevPhaseRef = useRef(state.phase)
  const prevScoreRef = useRef<number | undefined>(undefined)
  const lastOverlayQ = useRef(state.activeQuestion?.question)
  const lastCategoryName = useRef('')
  const lastOverlayPhase = useRef(state.phase)
  const lastIsDD = useRef(false)
  const lastActiveMedia = useRef(state.activeMedia)
  const lastClueRevealed = useRef(state.clueRevealed)
  const lastMediaRevealed = useRef(state.mediaRevealed)
  const prevClueRevealedRef = useRef(state.clueRevealed)
  const prevMediaRevealedRef = useRef(state.mediaRevealed)
  const boardSplashLabelRef = useRef<string | null>(null)
  const boardSplashExitingRef = useRef(false)
  const overlayOpenRef = useRef(false)
  const overlayExitingRef = useRef(false)

  const fallbackIdRef = useRef(
    useGameStore.getState().myPlayerId ?? generateId()
  )
  const storedPlayerId = useGameStore((s) => s.myPlayerId)
  const myId = storedPlayerId ?? fallbackIdRef.current
  const [nameTaken, setNameTaken] = useState(false)
  const hasLoggedJoin = useRef(false)
  const hasAnnouncedJoin = useRef(false)

  useEffect(() => {
    if (!roomCode) { navigate('/'); return }

    net.joinGameRoom(roomCode)
    setMyPlayerId(myId)

    net.onPeerJoin(() => {
      setConnected(true)
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
        const me = msg.state.players.find(
          (p) => p.name === playerName && p.isConnected
        )
        if (me) setMyPlayerId(me.id)
        setConnected(true)
        if (!hasAnnouncedJoin.current && hostPeerId.current) {
          hasAnnouncedJoin.current = true
          const meJoin: Player = { id: myId, name: playerName, score: 0, isConnected: true }
          net.send({ type: 'PLAYER_JOIN', player: meJoin }, hostPeerId.current)
        }
        if (!hasLoggedJoin.current) {
          hasLoggedJoin.current = true
          logEvent({ role: 'player', roomCode, actor: playerName, event: 'Joined room successfully' })
        }
      }
      if (msg.type === 'OPEN_CARD') {
        setHasBuzzed(false)
        wasInBuzzQueueRef.current = false
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
          clueRevealed: msg.clueRevealed ?? false,
          mediaRevealed: msg.mediaRevealed ?? false,
          mediaPlayback: msg.mediaRevealed
            ? initialMediaPlaybackForType(mediaType)
            : null,
        })
      }
      if (msg.type === 'CLOSE_CARD') {
        patchState({ phase: 'board', activeQuestion: null, buzzQueue: [], activeMedia: null, mediaPlayback: null, dailyDouble: null, clueRevealed: false, mediaRevealed: false })
        setHasBuzzed(false)
        wasInBuzzQueueRef.current = false
        setJudgeResult(null)
        setDdWagerInput('')
        setDdWagerError('')
        setDdWagerSubmitted(false)
      }
      if (msg.type === 'DAILY_DOUBLE_REVEAL') {
        setHasBuzzed(false)
        wasInBuzzQueueRef.current = false
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
          clueRevealed: false,
          mediaRevealed: false,
          mediaPlayback: null,
        })
      }
      if (msg.type === 'MEDIA_PLAYBACK') {
        patchState({ mediaPlayback: msg.playback })
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
        const current = useGameStore.getState().state
        const activeMedia = current.activeMedia
        const wasMediaRevealed = current.mediaRevealed
        const mediaRevealed = msg.mediaRevealed ?? wasMediaRevealed
        patchState({
          phase: 'question',
          clueRevealed: true,
          mediaRevealed,
          mediaPlayback: mediaRevealed && !wasMediaRevealed
            ? initialMediaPlaybackForType(activeMedia?.type)
            : current.mediaPlayback,
        })
      }
      if (msg.type === 'REVEAL_CLUE') {
        patchState({ clueRevealed: true })
      }
      if (msg.type === 'REVEAL_MEDIA') {
        const activeMedia = useGameStore.getState().state.activeMedia
        patchState({
          mediaRevealed: true,
          mediaPlayback: initialMediaPlaybackForType(activeMedia?.type),
        })
      }
      if (msg.type === 'START_BUZZING') {
        patchState({ phase: 'buzzing', buzzQueue: [] })
        setHasBuzzed(false)
        wasInBuzzQueueRef.current = false
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
          mediaPlayback: null,
          dailyDouble: null,
          clueRevealed: false,
          mediaRevealed: false,
        })
        setHasBuzzed(false)
        wasInBuzzQueueRef.current = false
        setJudgeResult(null)
        setDdWagerInput('')
        setDdWagerError('')
        setDdWagerSubmitted(false)
      }
      if (msg.type === 'PLAYER_LEAVE') {
        setPlayerConnected(msg.playerId, false)
      }
      if (msg.type === 'UPDATE_PLAYER') {
        updatePlayer(msg.player)
      }
      if (msg.type === 'JOIN_REJECTED') {
        if (msg.reason === 'NAME_TAKEN') {
          setNameTaken(true)
          net.leaveRoom()
        }
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

  // Fallback: dismiss board splash if host never clears boardTransition in synced state
  useEffect(() => {
    if (!state.boardTransition) return
    const t = setTimeout(() => {
      if (boardSplashLabelRef.current && !boardSplashExitingRef.current) {
        boardSplashExitingRef.current = true
        bumpAnimRender((n) => n + 1)
      }
    }, 2500)
    return () => clearTimeout(t)
  }, [state.boardTransition])

  // Clue / answer reveal keys on state transitions
  useEffect(() => {
    const prev = prevPhaseRef.current
    if (state.phase === 'revealed' && prev !== 'revealed') {
      setAnswerRevealKey((k) => k + 1)
    }
    prevPhaseRef.current = state.phase
  }, [state.phase])

  useEffect(() => {
    if (state.clueRevealed && !prevClueRevealedRef.current) {
      setClueRevealKey((k) => k + 1)
    }
    prevClueRevealedRef.current = state.clueRevealed
  }, [state.clueRevealed])

  useEffect(() => {
    if (state.mediaRevealed && !prevMediaRevealedRef.current) {
      setMediaRevealKey((k) => k + 1)
    }
    prevMediaRevealedRef.current = state.mediaRevealed
  }, [state.mediaRevealed])

  // Pulse header score when it changes
  useEffect(() => {
    const score = myPlayer?.score
    if (score !== undefined && prevScoreRef.current !== undefined && prevScoreRef.current !== score) {
      setScorePulsing(true)
    }
    prevScoreRef.current = score
  }, [myPlayer?.score])

  const [boardFill, setBoardFill] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches,
  )
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)')
    const update = () => setBoardFill(mq.matches)
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

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
  const isInBuzzQueue = state.buzzQueue.includes(myId)
  if (isInBuzzQueue) wasInBuzzQueueRef.current = true
  const buzzPending = hasBuzzed && !isInBuzzQueue && !wasInBuzzQueueRef.current
  const buzzedOut = hasBuzzed && !isInBuzzQueue && wasInBuzzQueueRef.current
  const isMyTurn =
    state.buzzQueue[0] === myId || (buzzPending && state.buzzQueue.length === 0)
  const myQueuePosition = isInBuzzQueue
    ? state.buzzQueue.indexOf(myId) + 1
    : buzzPending
      ? state.buzzQueue.length + 1
      : 0
  const activeQ = state.activeQuestion?.question
  const categoryName = state.board?.categories.find(c => c.id === state.activeQuestion?.categoryId)?.name ?? ''
  const showOverlay = ['question', 'buzzing', 'revealed', 'dailyDouble', 'dailyDoubleBet'].includes(state.phase) && !!state.activeQuestion?.question

  // Board transition splash — refs updated during render; exit triggered when synced title clears
  if (state.boardTransition) {
    boardSplashLabelRef.current = state.boardTransition
    boardSplashExitingRef.current = false
  } else if (boardSplashLabelRef.current && !boardSplashExitingRef.current) {
    boardSplashExitingRef.current = true
  }
  const boardTransitionLabel = boardSplashLabelRef.current
  const boardTransitionExiting = boardSplashExitingRef.current
  const showBoardSplash = boardTransitionLabel !== null

  // Question overlay mount / exit — same ref pattern as board splash
  if (showOverlay) {
    overlayOpenRef.current = true
    overlayExitingRef.current = false
    lastOverlayPhase.current = state.phase
    lastIsDD.current = state.dailyDouble !== null
    lastActiveMedia.current = state.activeMedia
    lastClueRevealed.current = state.clueRevealed
    lastMediaRevealed.current = state.mediaRevealed
  } else if (overlayOpenRef.current && !overlayExitingRef.current) {
    overlayExitingRef.current = true
  }
  const overlayMounted = overlayOpenRef.current
  const overlayExiting = overlayExitingRef.current

  if (activeQ) lastOverlayQ.current = activeQ
  if (categoryName) lastCategoryName.current = categoryName

  const displayQ = activeQ ?? lastOverlayQ.current
  const displayCategory = categoryName || lastCategoryName.current
  const questionOverlayOpen = overlayMounted && !!displayQ

  const uiPhase = overlayExiting ? lastOverlayPhase.current : state.phase
  const isDD = overlayExiting ? lastIsDD.current : state.dailyDouble !== null
  const displayMedia = overlayExiting ? lastActiveMedia.current : state.activeMedia
  const displayClueRevealed = overlayExiting ? lastClueRevealed.current : state.clueRevealed
  const displayMediaRevealed = overlayExiting ? lastMediaRevealed.current : state.mediaRevealed
  const isDDPlayer = state.dailyDouble?.playerId === myId
  const ddPlayerInfo = state.dailyDouble ? state.players.find(p => p.id === state.dailyDouble!.playerId) : null
  const clueBlurred = settings.blurClueOnBuzz && uiPhase === 'buzzing' && state.buzzQueue.length > 0
  const buzzingOpen = uiPhase === 'buzzing'
  const canShowBuzzDock =
    !isDD && state.clueRevealed && (uiPhase === 'question' || buzzingOpen) && !buzzedOut
  const keepSidebarDuringQuestion =
    !isDD && ['question', 'buzzing', 'revealed'].includes(uiPhase)
  const showPlayerActionZone =
    judgeResult != null || canShowBuzzDock || keepSidebarDuringQuestion
  const showDdMobileCompact =
    isMobileViewport && isDD && (uiPhase === 'dailyDouble' || uiPhase === 'dailyDoubleBet')
  const showMobilePlayerDock = isMobileViewport && showPlayerActionZone
  const showSidebarPanel =
    !showDdMobileCompact &&
    !isMobileViewport &&
    (uiPhase === 'dailyDouble' ||
      (isDD && (uiPhase === 'dailyDoubleBet' || uiPhase === 'question')) ||
      keepSidebarDuringQuestion)
  const showBuzzQueuePanel = !isDD && state.buzzQueue.length > 0
  const showBuzzQueueInSidebar = showBuzzQueuePanel && !isMobileViewport
  const showBuzzQueueMobileToggle = showBuzzQueuePanel && isMobileViewport
  const showSidebar = showSidebarPanel || showBuzzQueueInSidebar
  const buzzQueuePopupVisible = buzzQueuePopupOpen && showBuzzQueuePanel

  const [prevShowBuzzQueuePanel, setPrevShowBuzzQueuePanel] = useState(showBuzzQueuePanel)
  if (showBuzzQueuePanel !== prevShowBuzzQueuePanel) {
    setPrevShowBuzzQueuePanel(showBuzzQueuePanel)
    if (!showBuzzQueuePanel) {
      setBuzzQueuePopupOpen(false)
      setBuzzQueuePopupActive(false)
    }
  }

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const onChange = () => setIsMobileViewport(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  function toggleBuzzQueuePopup() {
    if (buzzQueuePopupVisible) {
      setBuzzQueuePopupOpen(false)
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        setBuzzQueuePopupActive(false)
      }
      return
    }
    setBuzzQueuePopupActive(true)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setBuzzQueuePopupOpen(true))
    })
  }

  function handleBuzzQueuePopupTransitionEnd(e: React.TransitionEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget || e.propertyName !== 'opacity') return
    if (!buzzQueuePopupVisible) setBuzzQueuePopupActive(false)
  }

  const playerActionZoneProps = {
    canShowBuzzDock,
    revealedPhase: uiPhase === 'revealed',
    judgeResult,
    buzzingOpen,
    hasBuzzed,
    isMyTurn,
    myQueuePosition,
    buzzQueueLength: state.buzzQueue.length,
    onBuzz: handleBuzz,
    showBuzzQueueMobileToggle,
    buzzQueuePopupActive,
    buzzQueuePopupVisible,
    onToggleBuzzQueuePopup: toggleBuzzQueuePopup,
    onBuzzQueuePopupTransitionEnd: handleBuzzQueuePopupTransitionEnd,
    buzzQueue: state.buzzQueue,
    players: state.players,
    myId,
  }

  const reservePlayerBuzzSpace =
    showMobilePlayerDock ||
    (!isDD && ['question', 'buzzing', 'revealed'].includes(uiPhase))

  const maxDdWager = (() => {
    const maxPV = Math.max(...(state.board?.pointValues ?? [0]))
    return myScore > maxPV ? myScore : maxPV
  })()

  const ddWagerForm = (
    <div className="dd-wager-form w-full flex flex-col gap-3">
      <div className="font-condensed font-bold text-sm text-center" style={{ color: 'var(--gold-bright)' }}>
        Enter your wager
      </div>
      <div className="text-xs text-center" style={{ color: '#4a5580' }}>
        Min: $1 &middot; Max: ${maxDdWager}
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
  )

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
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 page-fade-in" style={{ background: 'var(--navy)' }}>
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
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 page-fade-in" style={{ background: 'var(--navy)' }}>
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
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 page-fade-in" style={{ background: 'var(--navy)' }}>
        <div className="font-display text-4xl" style={{ color: 'var(--gold-bright)' }}>JEOPARDY!</div>
        <div className="font-condensed text-lg animate-pulse" style={{ color: '#4a5580' }}>
          Connecting to room <span style={{ color: 'var(--gold)' }}>{roomCode}</span>…
        </div>
        <div className="text-sm" style={{ color: '#4a5580' }}>Waiting for host to accept players</div>
      </div>
    )
  }

  return (
    <div
      className={`app-page h-screen flex flex-col overflow-hidden page-fade-in${questionOverlayOpen ? ' app-page--question-open' : ''}`}
      style={{ background: 'var(--navy)' }}
    >
      <header className="player-topbar">
        <div className="player-topbar__brand font-display" style={{ color: 'var(--gold-bright)' }}>
          JEOPARDY!
        </div>
        <div className="player-topbar__meta">
          <div className="player-topbar__identity">
            <span className="player-topbar__name font-condensed font-bold" style={{ color: 'var(--white)' }}>
              {myPlayer?.name ?? playerName}
            </span>
            <span className="player-topbar__sep" aria-hidden>·</span>
            <span
              className={`player-topbar__score font-display${scorePulsing ? ' score-pulse' : ''}`}
              style={{ color: myScore < 0 ? '#e07070' : 'var(--gold-bright)' }}
              onAnimationEnd={() => setScorePulsing(false)}
            >
              {formatScore(myScore)}
            </span>
          </div>
        </div>
        <button
          type="button"
          className="btn-icon-exit player-topbar__exit"
          onClick={handleExitRoom}
          title="Exit room"
          aria-label="Exit room"
        >
          <LogOut size={22} />
        </button>
      </header>

      {/* Main content */}
      <div
        className="flex flex-col flex-1 min-h-0 overflow-hidden"
        style={{ paddingTop: 'var(--space-sm)' }}
      >
        {/* Podium view */}
        {state.phase === 'podium' && (
          <div className="flex-1 flex flex-col items-center justify-center p-4 overflow-auto w-full min-w-0">
            <Podium players={state.players} highlightId={myId} />
          </div>
        )}

        {/* Board area + scoreboard (all phases except podium) */}
        {state.phase !== 'podium' && (
          <div
            className={`player-main flex-1 flex flex-col min-h-0 gap-4 px-4 pb-4${questionOverlayOpen ? ' player-main--hidden' : ''}`}
            aria-hidden={questionOverlayOpen}
          >
            <div className="board-scroll-wrap">
              {state.phase === 'gameStart' && (
                <div className="h-full flex flex-col items-center justify-center gap-4">
                  <div className="font-display text-4xl" style={{ color: 'var(--gold-bright)' }}>JEOPARDY!</div>
                  <div className="font-condensed text-lg animate-pulse" style={{ color: '#4a5580' }}>
                    Waiting for host to start the game…
                  </div>
                  <div className="font-condensed text-sm" style={{ color: '#8899cc' }}>
                    {state.gameBoardIds.length} board{state.gameBoardIds.length !== 1 ? 's' : ''} queued
                  </div>
                </div>
              )}

              {state.phase !== 'gameStart' && state.board && (
                <GameBoard
                  board={state.board}
                  answeredCells={state.answeredCells}
                  fill={boardFill}
                />
              )}

              {state.phase !== 'gameStart' && !state.board && (
                <div className="h-full flex flex-col items-center justify-center gap-2">
                  <div className="font-display text-4xl" style={{ color: 'var(--gold)', opacity: 0.3 }}>?</div>
                  <div className="font-condensed text-lg" style={{ color: '#4a5580' }}>
                    Waiting for host to load a board…
                  </div>
                </div>
              )}
            </div>

            <div className="flex-shrink-0 relative z-20 overflow-visible">
              <button
                className="mobile-players-toggle"
                onClick={() => setMobilePlayersOpen(v => !v)}
                aria-expanded={mobilePlayersOpen}
              >
                <Users size={14} aria-hidden />
                <span>Players ({state.players.filter(p => p.isConnected).length})</span>
                {mobilePlayersOpen ? <ChevronUp size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />}
              </button>
              <div className={`mobile-players-collapsible${mobilePlayersOpen ? ' mobile-players-collapsible--open' : ''}`}>
                <div className="mobile-players-collapsible__inner">
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
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Board transition overlay */}
      {showBoardSplash && (
        <div
          className={`board-transition-overlay${boardTransitionExiting ? ' board-transition-overlay--exit' : ''}`}
          onAnimationEnd={(e) => {
            if (boardTransitionExiting && e.animationName === 'overlayFadeOut') {
              boardSplashLabelRef.current = null
              boardSplashExitingRef.current = false
              bumpAnimRender((n) => n + 1)
            }
          }}
        >
          <div className="board-transition-title">{boardTransitionLabel}</div>
        </div>
      )}

      {/* Question overlay — mirrors QuestionOverlay layout without host controls */}
      {overlayMounted && displayQ && (
        <div
          className={`player-question-overlay fixed inset-0 z-50 flex flex-col${overlayExiting ? ' question-overlay--exit' : ' question-overlay-enter'}`}
          style={{ background: 'rgba(6,11,40,0.97)', backdropFilter: 'blur(4px)' }}
          onAnimationEnd={(e) => {
            if (overlayExiting && e.animationName === 'overlayFadeOut' && e.target === e.currentTarget) {
              overlayOpenRef.current = false
              overlayExitingRef.current = false
              bumpAnimRender((n) => n + 1)
            }
          }}
        >
          <header className="question-overlay-header">
            <div className="font-condensed font-bold uppercase tracking-wider min-w-0" style={{ color: 'var(--gold)', fontSize: 14 }}>
              {displayCategory}
              {displayCategory && <span style={{ opacity: 0.5 }}> &nbsp;·&nbsp; </span>}
              <span className="font-display text-xl" style={{ color: 'var(--gold-bright)' }}>${displayQ.points}</span>
              {isDD && <span style={{ color: 'var(--gold-bright)', marginLeft: 8 }}>DAILY DOUBLE</span>}
            </div>
          </header>

          <div
            className={`question-overlay-layout question-overlay-layout--player${reservePlayerBuzzSpace ? ' question-overlay-layout--has-buzz' : ''}${showDdMobileCompact ? ' question-overlay-layout--dd-compact' : ''}`}
          >
            <div className={`question-overlay-main ${overlayExiting ? 'card-flip-exit' : 'card-flip'}`}>
              {/* DD title splash + wager (mobile: single column; desktop: title only in main) */}
              {uiPhase === 'dailyDouble' && (
                <div className={`daily-double-phase${showDdMobileCompact ? ' daily-double-phase--mobile' : ''}`}>
                  <div className={`daily-double-title${showDdMobileCompact ? ' daily-double-title--compact' : ''}`}>
                    DAILY DOUBLE!
                  </div>
                  {showDdMobileCompact && (
                    isDDPlayer ? (
                      ddWagerForm
                    ) : (
                      <div className="font-condensed text-sm text-center" style={{ color: '#4a5580' }}>
                        Waiting for {ddPlayerInfo?.name ?? 'player'} to wager…
                      </div>
                    )
                  )}
                </div>
              )}

              {/* DD wager submitted — waiting for host to reveal clue */}
              {uiPhase === 'dailyDoubleBet' && (
                <div className={`daily-double-phase${showDdMobileCompact ? ' daily-double-phase--mobile' : ''}`}>
                  <div className={`daily-double-title${showDdMobileCompact ? ' daily-double-title--compact' : ''}`}>
                    DAILY DOUBLE!
                  </div>
                  {state.dailyDouble?.wager != null && (
                    <div className="font-condensed text-center" style={{ color: 'var(--gold-bright)', fontSize: showDdMobileCompact ? '1.125rem' : '1.5rem' }}>
                      {isDDPlayer ? 'Wager submitted' : `${ddPlayerInfo?.name} wagered`}:{' '}
                      <span className="font-display">${state.dailyDouble.wager}</span>
                    </div>
                  )}
                  <div className="font-condensed text-sm animate-pulse text-center" style={{ color: '#4a5580' }}>
                    Waiting for host to reveal the clue…
                  </div>
                </div>
              )}

              {/* Clue (shown in question/buzzing/revealed phases) */}
              {(uiPhase === 'question' || uiPhase === 'buzzing' || uiPhase === 'revealed') && (
                <div className="question-overlay-content flex flex-col items-center w-full max-w-2xl">
                  {!displayClueRevealed && !displayMediaRevealed && (
                    <div className="font-condensed text-sm animate-pulse text-center" style={{ color: '#4a5580' }}>
                      Waiting for host to reveal the clue…
                    </div>
                  )}

                  {displayMedia && displayMediaRevealed && (
                    <QuestionMediaPlayer
                      media={displayMedia}
                      role="player"
                      playback={state.mediaPlayback}
                      mountKey={mediaRevealKey}
                      mediaActive={displayMediaRevealed}
                      className="question-overlay-media clue-reveal"
                      style={{
                        filter: clueBlurred ? 'blur(8px)' : 'none',
                        transition: 'filter 0.3s ease',
                      }}
                    />
                  )}

                  {displayClueRevealed && (
                    <div
                      key={`clue-${clueRevealKey}`}
                      className={`question-overlay-clue font-condensed font-bold text-3xl md:text-4xl leading-snug max-w-2xl${
                        displayMediaRevealed ? '' : ' clue-reveal'
                      }`}
                      style={{
                        color: 'var(--white)',
                        filter: clueBlurred ? 'blur(8px)' : 'none',
                        transition: 'filter 0.3s ease',
                        userSelect: clueBlurred ? 'none' : undefined,
                      }}
                    >
                      {displayQ.question}
                    </div>
                  )}

                  {uiPhase === 'revealed' && (
                    <div
                      key={`answer-${answerRevealKey}`}
                      className="question-overlay-answer font-display text-2xl md:text-3xl answer-reveal"
                    >
                      {displayQ.answer || '—'}
                    </div>
                  )}
                </div>
              )}
            </div>

            {showSidebar && (
            <aside className="question-overlay-sidebar">
              {showSidebarPanel && (
              <div className="panel flex flex-col items-center gap-3">
                {/* DD: title phase — wager input for DD player, waiting message for others */}
                {uiPhase === 'dailyDouble' && (
                  isDDPlayer ? (
                    ddWagerForm
                  ) : (
                    <div className="font-condensed text-sm text-center" style={{ color: '#4a5580' }}>
                      Waiting for {ddPlayerInfo?.name ?? 'player'} to wager…
                    </div>
                  )
                )}

                {/* DD: bet phase — wager confirmed, waiting for host to reveal clue */}
                {isDD && uiPhase === 'dailyDoubleBet' && (
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
                {isDD && uiPhase === 'question' && !judgeResult && (
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

                {/* Buzzer + judge feedback (desktop — in sidebar) */}
                {showPlayerActionZone && !isMobileViewport && (
                  <PlayerActionZone {...playerActionZoneProps} />
                )}
              </div>
              )}

              {/* Buzz queue in sidebar (desktop; mobile uses dock popup) */}
              {showBuzzQueueInSidebar && (
                <div key="buzz-queue" className="panel panel--buzz-queue overlay-sidebar-enter flex flex-col gap-2">
                  <div className="buzz-queue-panel__label font-condensed text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--gold)', opacity: 0.7 }}>
                    Buzz queue
                  </div>
                  {state.buzzQueue.map((pid, idx) => {
                    const p = state.players.find((pl) => pl.id === pid)
                    if (!p) return null
                    return (
                      <div key={pid} className="buzz-queue-entry">
                        <span className="buzz-queue-entry__score text-xs">
                          {p.score < 0 ? `-$${Math.abs(p.score)}` : `$${p.score}`}
                        </span>
                        <span
                          className="buzz-queue-entry__name font-condensed font-bold text-sm"
                          style={{ color: pid === myId ? 'var(--gold-bright)' : undefined }}
                        >
                          {p.name}{pid === myId ? ' (you)' : ''}
                        </span>
                        <span className="buzz-queue-entry__rank text-xs">#{idx + 1}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </aside>
            )}
          </div>

          {/* Buzzer + judge feedback (mobile — fixed dock, outside sidebar flow) */}
          {showMobilePlayerDock && (
            <PlayerActionZone {...playerActionZoneProps} />
          )}
        </div>
      )}
    </div>
  )
}
