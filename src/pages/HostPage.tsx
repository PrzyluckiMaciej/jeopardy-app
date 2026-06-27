import { useEffect, useRef, useState } from 'react'
import { Settings, Trash2, Pencil, Check, Copy, CopyPlus, FolderOpen, LogOut, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Play, LayoutGrid, RotateCcw, Shuffle, X, Users } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useGameStore, useBoardStore } from '../store/gameStore'
import * as net from '../lib/network'
import type { Board, Player, NetMessage, Question, GameSettings } from '../types'
import { createDefaultBoard, cellId } from '../lib/utils'
import { duplicateBoard } from '../lib/duplicateBoard'
import { getMedia, blobToDataUrl } from '../lib/db'
import { logEvent } from '../lib/logger'
import {
  evaluatePlayerJoin,
  normalizePlayerName,
  type NameSession,
} from '../lib/playerJoin'
import BoardEditor from '../components/BoardEditor'
import GameBoard from '../components/GameBoard'
import QuestionOverlay from '../components/QuestionOverlay'
import SettingsPanel from '../components/SettingsPanel'
import Scoreboard from '../components/Scoreboard'
import Podium from '../components/Podium'

type Tab = 'board' | 'settings'

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function pruneStalePlayers(
  peerToClient: Map<string, string>,
  nameSessions: Map<string, NameSession>,
  setPlayerConnected: (id: string, connected: boolean) => void,
  onStale: (playerId: string) => void,
) {
  const livePeers = new Set(net.getConnectedPeerIds())
  if (livePeers.size === 0) return

  for (const player of useGameStore.getState().state.players) {
    if (!player.isConnected) continue
    const peerId = [...peerToClient.entries()].find(([, cid]) => cid === player.id)?.[0]
    if (!peerId || livePeers.has(peerId)) continue
    setPlayerConnected(player.id, false)
    onStale(player.id)
    nameSessions.delete(normalizePlayerName(player.name))
    for (const [pid, cid] of [...peerToClient.entries()]) {
      if (cid === player.id) peerToClient.delete(pid)
    }
  }
}

export default function HostPage() {
  const navigate = useNavigate()
  const store = useGameStore()
  const { state, settings, roomCode, setSettings, addPlayer, removePlayer, updatePlayer,
    openCard, patchState, setPlayerConnected, addBuzz, resetBoard, setBoardControl,
    startDailyDouble, setDailyDoubleBet, selectGame, setBoardTransition, showPodium } = store
  const boardStore = useBoardStore()

  const [tab, setTab] = useState<Tab>('board')
  const [editing, setEditing] = useState(false)
  const [activeBoard, setActiveBoard] = useState<Board | null>(null)
  const [showBoardPicker, setShowBoardPicker] = useState(false)
  const [copyFeedback, setCopyFeedback] = useState<'hidden' | 'visible' | 'hiding'>('hidden')
  const [showDdNoControlAlert, setShowDdNoControlAlert] = useState(false)
  const [boardTransitionExiting, setBoardTransitionExiting] = useState(false)

  const [pickerGame, setPickerGame] = useState<string | null>(null)
  const [creatingGame, setCreatingGame] = useState(false)
  const [newGameName, setNewGameName] = useState('')
  const [editingGameId, setEditingGameId] = useState<string | null>(null)
  const [editingGameName, setEditingGameName] = useState('')
  const [activeEmojis, setActiveEmojis] = useState<Record<string, { emoji: string; seq: number }>>({})
  const [mobilePlayersOpen, setMobilePlayersOpen] = useState(false)

  const peerToClient = useRef(new Map<string, string>())
  const nameSessions = useRef(new Map<string, NameSession>())
  const emojiTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const copyFeedbackTimers = useRef<ReturnType<typeof setTimeout>[]>([])

  useEffect(() => () => {
    copyFeedbackTimers.current.forEach(clearTimeout)
  }, [])

  useEffect(() => {
    if (!roomCode) { navigate('/'); return }

    net.createRoom(roomCode)

    const markPlayerLeft = (playerId: string) => {
      net.broadcast({ type: 'PLAYER_LEAVE', playerId })
    }

    net.onPeerJoin((peerId) => {
      const current = useGameStore.getState()
      net.send({ type: 'SYNC_STATE', state: current.state }, peerId)
    })

    net.onPeerLeave((peerId) => {
      const clientId = peerToClient.current.get(peerId)
      if (clientId) {
        setPlayerConnected(clientId, false)
        markPlayerLeft(clientId)
        const leavingPlayer = useGameStore.getState().state.players.find(p => p.id === clientId)
        logEvent({
          role: 'host',
          roomCode: roomCode ?? '',
          actor: 'host',
          event: `Player disconnected: ${leavingPlayer?.name ?? clientId}`,
        })
        peerToClient.current.delete(peerId)
        if (leavingPlayer) {
          nameSessions.current.delete(normalizePlayerName(leavingPlayer.name))
        }
      }
      pruneStalePlayers(
        peerToClient.current,
        nameSessions.current,
        setPlayerConnected,
        markPlayerLeft,
      )
    })

    net.onMessage((msg: NetMessage, peerId: string) => {
      if (msg.type === 'PLAYER_JOIN') {
        const decision = evaluatePlayerJoin({
          joiningId: msg.player.id,
          joiningName: msg.player.name,
          players: useGameStore.getState().state.players,
          peerToClient: peerToClient.current,
          joiningPeerId: peerId,
          nameSessions: nameSessions.current,
        })

        if (decision.action === 'reject') {
          net.send({ type: 'JOIN_REJECTED', reason: decision.reason }, peerId)
          return
        }

        const playerId = decision.playerId
        const joiningId = msg.player.id

        for (const [oldPeerId, cid] of peerToClient.current.entries()) {
          if ((cid === playerId || cid === joiningId) && oldPeerId !== peerId) {
            peerToClient.current.delete(oldPeerId)
            const oldPlayer = useGameStore.getState().state.players.find((p) => p.id === cid)
            if (oldPlayer) {
              nameSessions.current.delete(normalizePlayerName(oldPlayer.name))
            }
          }
        }
        peerToClient.current.set(peerId, playerId)
        nameSessions.current.set(normalizePlayerName(msg.player.name), {
          peerId,
          clientId: playerId,
        })

        if (decision.action === 'reconnect') {
          setPlayerConnected(playerId, true)
          logEvent({
            role: 'host',
            roomCode: roomCode ?? '',
            actor: 'host',
            event: `Player reconnected: ${msg.player.name}`,
          })
          setTimeout(() => {
            net.broadcast({ type: 'SYNC_STATE', state: useGameStore.getState().state })
          }, 100)
          return
        }

        const player: Player = { ...msg.player, id: playerId, isConnected: true }
        addPlayer(player)
        logEvent({
          role: 'host',
          roomCode: roomCode ?? '',
          actor: 'host',
          event: `Player joined: ${player.name}`,
        })
        setTimeout(() => {
          net.broadcast({ type: 'SYNC_STATE', state: useGameStore.getState().state })
        }, 100)
      }
      if (msg.type === 'BUZZ') {
        const clientId = peerToClient.current.get(peerId)
        if (!clientId) return
        addBuzz(clientId)
        net.broadcast({ type: 'BUZZ', playerId: clientId, playerName: msg.playerName })
      }
      if (msg.type === 'DAILY_DOUBLE_BET') {
        const clientId = peerToClient.current.get(peerId)
        if (!clientId) return
        const gs = useGameStore.getState()
        if (!gs.state.dailyDouble || gs.state.dailyDouble.playerId !== clientId) return
        const player = gs.state.players.find(p => p.id === clientId)
        if (!player) return
        const maxPointValue = Math.max(...(gs.state.board?.pointValues ?? [0]))
        const maxWager = player.score > maxPointValue ? player.score : maxPointValue
        const wager = Math.max(1, Math.min(msg.wager, maxWager))
        setDailyDoubleBet(wager)
        net.broadcast({ type: 'DAILY_DOUBLE_ACCEPT_BET', wager })
      }
      if (msg.type === 'EMOJI_REACT') {
        const { playerId, emoji } = msg
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
    })

    return () => net.leaveRoom()
  }, [roomCode]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleSelectBoard(board: Board) {
    const b = { ...board }
    setActiveBoard(b)
    const connectedPlayers = useGameStore.getState().state.players.filter(p => p.isConnected)
    const randomControl = connectedPlayers.length > 0 ? pickRandom(connectedPlayers).id : null
    patchState({
      board: b, answeredCells: [], phase: 'board', boardControlId: randomControl,
      activeGameId: null, gameBoardIds: [], currentBoardIndex: 0, boardTransition: null,
    })
    net.broadcast({ type: 'SYNC_STATE', state: useGameStore.getState().state })
    closeBoardPicker()
    setEditing(false)
  }

  function handleUnselectBoard() {
    const { activeGameId } = useGameStore.getState().state
    setActiveBoard(null)
    setEditing(false)
    patchState({
      board: null,
      answeredCells: [],
      phase: activeGameId ? 'gameStart' : 'lobby',
      activeQuestion: null,
      buzzQueue: [],
      activeMedia: null,
      boardControlId: null,
      dailyDouble: null,
      boardTransition: null,
    })
    net.broadcast({ type: 'SYNC_STATE', state: useGameStore.getState().state })
    closeBoardPicker()
  }

  function handleSelectGame(gameId: string, boardIds: string[]) {
    selectGame(gameId, boardIds)
    setActiveBoard(null)
    net.broadcast({ type: 'SYNC_STATE', state: useGameStore.getState().state })
    closeBoardPicker()
    setEditing(false)
  }

  function handleStartGame() {
    const { gameBoardIds, currentBoardIndex } = useGameStore.getState().state
    const boardId = gameBoardIds[currentBoardIndex]
    const boardData = boardStore.getBoard(boardId)
    if (!boardData) return

    const b = { ...boardData }
    setActiveBoard(b)
    setBoardTransitionExiting(false)
    setBoardTransition(b.name)
    patchState({ board: b, answeredCells: [], phase: 'board' })
    net.broadcast({ type: 'SYNC_STATE', state: useGameStore.getState().state })

    setTimeout(() => {
      const connectedPlayers = useGameStore.getState().state.players.filter(p => p.isConnected)
      const randomControl = connectedPlayers.length > 0 ? pickRandom(connectedPlayers).id : null
      setBoardTransitionExiting(true)
      patchState({ boardControlId: randomControl })
      net.broadcast({ type: 'SYNC_STATE', state: useGameStore.getState().state })
    }, 1600)
  }

  function handleNextBoard() {
    const { gameBoardIds, currentBoardIndex } = useGameStore.getState().state
    const nextIndex = currentBoardIndex + 1
    if (nextIndex >= gameBoardIds.length) {
      showPodium()
      net.broadcast({ type: 'SYNC_STATE', state: useGameStore.getState().state })
      return
    }
    const boardData = boardStore.getBoard(gameBoardIds[nextIndex])
    if (!boardData) return

    const b = { ...boardData }
    setActiveBoard(b)
    setBoardTransitionExiting(false)
    patchState({ currentBoardIndex: nextIndex })
    setBoardTransition(b.name)
    patchState({ board: b, answeredCells: [], phase: 'board', activeQuestion: null, buzzQueue: [], activeMedia: null, dailyDouble: null })
    net.broadcast({ type: 'SYNC_STATE', state: useGameStore.getState().state })

    setTimeout(() => {
      const connectedPlayers = useGameStore.getState().state.players.filter(p => p.isConnected)
      const randomControl = connectedPlayers.length > 0 ? pickRandom(connectedPlayers).id : null
      setBoardTransitionExiting(true)
      patchState({ boardControlId: randomControl })
      net.broadcast({ type: 'SYNC_STATE', state: useGameStore.getState().state })
    }, 1600)
  }

  function handlePrevBoard() {
    const { currentBoardIndex, activeGameId, gameBoardIds } = useGameStore.getState().state
    if (currentBoardIndex <= 0) {
      if (activeGameId) {
        patchState({ phase: 'gameStart', board: null, answeredCells: [], boardTransition: null })
        setActiveBoard(null)
        net.broadcast({ type: 'SYNC_STATE', state: useGameStore.getState().state })
      }
      return
    }
    const prevIndex = currentBoardIndex - 1
    const boardData = boardStore.getBoard(gameBoardIds[prevIndex])
    if (!boardData) return

    const b = { ...boardData }
    setActiveBoard(b)
    setBoardTransitionExiting(false)
    patchState({ currentBoardIndex: prevIndex })
    setBoardTransition(b.name)
    patchState({ board: b, answeredCells: [], phase: 'board', activeQuestion: null, buzzQueue: [], activeMedia: null, dailyDouble: null })
    net.broadcast({ type: 'SYNC_STATE', state: useGameStore.getState().state })

    setTimeout(() => {
      const connectedPlayers = useGameStore.getState().state.players.filter(p => p.isConnected)
      const randomControl = connectedPlayers.length > 0 ? pickRandom(connectedPlayers).id : null
      setBoardTransitionExiting(true)
      patchState({ boardControlId: randomControl })
      net.broadcast({ type: 'SYNC_STATE', state: useGameStore.getState().state })
    }, 1600)
  }

  function handleEndGame() {
    patchState({
      phase: 'lobby', board: null, answeredCells: [], activeGameId: null,
      gameBoardIds: [], currentBoardIndex: 0, boardTransition: null,
      activeQuestion: null, buzzQueue: [], activeMedia: null, dailyDouble: null,
    })
    setActiveBoard(null)
    net.broadcast({ type: 'SYNC_STATE', state: useGameStore.getState().state })
  }

  function handleDeleteBoard(id: string) {
    boardStore.deleteBoard(id)
    if (activeBoard?.id === id) {
      setActiveBoard(null)
      setEditing(false)
      patchState({ board: null, answeredCells: [], phase: 'lobby' })
      net.broadcast({ type: 'SYNC_STATE', state: useGameStore.getState().state })
    }
  }

  async function handleDuplicateBoard(board: Board) {
    const copy = await duplicateBoard(board)
    boardStore.saveBoard(copy)
    if (pickerGame) {
      boardStore.addBoardToGame(pickerGame, copy.id)
    }
  }

  function handleNewBoard() {
    const b = createDefaultBoard()
    boardStore.saveBoard(b)
    setActiveBoard(b)
    patchState({ board: b, answeredCells: [], phase: 'board' })
    setEditing(true)
    closeBoardPicker()
  }

  function handleBoardChange(b: Board) {
    boardStore.saveBoard(b)
    setActiveBoard(b)
    patchState({ board: b })
  }

  async function handleOpenCell(categoryId: string, question: Question) {
    const cId = cellId(categoryId, question.id)
    if (state.answeredCells.includes(cId)) return

    let mediaDataUrl: string | undefined
    if (question.mediaId) {
      const rec = await getMedia(question.mediaId)
      if (rec) mediaDataUrl = await blobToDataUrl(rec.blob)
    }

    const currentBoard = useGameStore.getState().state.board
    const isDailyDouble = currentBoard?.dailyDoubleQuestionId === question.id

    if (isDailyDouble) {
      const { boardControlId, players } = useGameStore.getState().state
      const ddPlayerId =
        boardControlId && players.some((p) => p.id === boardControlId)
          ? boardControlId
          : null
      if (!ddPlayerId) {
        setShowDdNoControlAlert(true)
        return
      }
      openCard(categoryId, question, mediaDataUrl)
      startDailyDouble(ddPlayerId)
      net.broadcast({ type: 'DAILY_DOUBLE_REVEAL', playerId: ddPlayerId, categoryId, question, mediaDataUrl })
    } else {
      openCard(categoryId, question, mediaDataUrl)
      net.broadcast({ type: 'OPEN_CARD', categoryId, question, mediaDataUrl })
      if (settings.autoBuzzQueue) {
        store.startBuzzing()
        net.broadcast({ type: 'START_BUZZING' })
      }
    }
  }

  function handleSettingsChange(s: GameSettings) {
    setSettings(s)
    net.broadcast({ type: 'UPDATE_SETTINGS', settings: s })
  }

  function handleAssignBoardControl(playerId: string | null) {
    setBoardControl(playerId)
    net.broadcast({ type: 'SET_BOARD_CONTROL', playerId })
  }

  function handleUpdatePlayer(p: Player) {
    const prev = state.players.find(pl => pl.id === p.id)
    updatePlayer(p)
    net.broadcast({ type: 'UPDATE_PLAYER', player: p })
    if (prev && prev.score !== p.score) {
      logEvent({
        role: 'host',
        roomCode: roomCode ?? '',
        actor: 'host',
        event: `Score updated for ${p.name}: $${prev.score} → $${p.score}`,
      })
    }
  }

  function handleRemovePlayer(id: string) {
    const target = state.players.find(p => p.id === id)
    removePlayer(id)
    net.broadcast({ type: 'REMOVE_PLAYER', playerId: id })
    logEvent({
      role: 'host',
      roomCode: roomCode ?? '',
      actor: 'host',
      event: `Player removed: ${target?.name ?? id}`,
    })
  }

  function handleResetBoard() {
    if (!window.confirm('Reset the board? This will mark all questions as unanswered and set all scores to 0.')) return
    resetBoard()
    net.broadcast({ type: 'SYNC_STATE', state: useGameStore.getState().state })
    logEvent({
      role: 'host',
      roomCode: roomCode ?? '',
      actor: 'host',
      event: 'Board reset: all questions cleared and scores zeroed',
    })
  }

  function copyCode() {
    navigator.clipboard.writeText(roomCode ?? '')
    copyFeedbackTimers.current.forEach(clearTimeout)
    copyFeedbackTimers.current = []
    setCopyFeedback('visible')
    const hideTimer = setTimeout(() => setCopyFeedback('hiding'), 1400)
    const resetTimer = setTimeout(() => setCopyFeedback('hidden'), 1750)
    copyFeedbackTimers.current = [hideTimer, resetTimer]
  }

  function handleExitRoom() {
    if (!window.confirm('Exit the room? All players will be disconnected.')) return
    net.leaveRoom()
    store.reset()
    navigate('/')
  }

  function openBoardPicker() {
    setPickerGame(null)
    setCreatingGame(false)
    setNewGameName('')
    setEditingGameId(null)
    setEditingGameName('')
    setShowBoardPicker(true)
  }

  function closeBoardPicker() {
    setCreatingGame(false)
    setNewGameName('')
    setEditingGameId(null)
    setEditingGameName('')
    setShowBoardPicker(false)
  }

  function commitNewGame() {
    const name = newGameName.trim()
    if (!name) return
    boardStore.createGame(name)
    setNewGameName('')
    setCreatingGame(false)
  }

  function commitGameRename(id: string) {
    const name = editingGameName.trim()
    if (!name) return
    boardStore.renameGame(id, name)
    setEditingGameId(null)
  }

  function handleDeleteGame(id: string) {
    boardStore.deleteGame(id)
    if (pickerGame === id) setPickerGame(null)
  }

  const board = activeBoard ?? state.board
  const showOverlay = ['question', 'buzzing', 'revealed', 'dailyDouble', 'dailyDoubleBet'].includes(state.phase) && !!state.activeQuestion
  const inGame = !!state.activeGameId
  const activeGameData = inGame ? boardStore.games.find(g => g.id === state.activeGameId) : null

  const pickerGameData = pickerGame ? boardStore.games.find(g => g.id === pickerGame) : null
  const pickerBoardIds = pickerGameData?.boardIds ?? []
  const pickerBoards = pickerGame
    ? pickerBoardIds.map(id => boardStore.boards.find(b => b.id === id)).filter((b): b is Board => !!b)
    : boardStore.boards

  return (
    <div className="app-page h-screen flex flex-col overflow-hidden page-fade-in" style={{ background: 'var(--navy)' }}>
      {/* Top bar */}
      <header className="host-topbar">
        <button type="button" className="host-topbar__logo" onClick={() => setTab('board')}>
          JEOPARDY!
        </button>
        <div className="host-topbar__divider" aria-hidden />
        <div className="host-topbar__room">
          <span className="host-topbar__room-label">Room</span>
          <button
            type="button"
            className="host-topbar__room-code"
            onClick={copyCode}
            title="Click to copy room code"
            aria-label={`Copy room code ${roomCode}`}
          >
            <Copy size={15} className="host-topbar__copy-icon" aria-hidden />
            <span className="host-topbar__room-code-text">{roomCode}</span>
          </button>
          {copyFeedback !== 'hidden' && (
            <span
              className={`host-topbar__copied${copyFeedback === 'hiding' ? ' host-topbar__copied--exit' : ' host-topbar__copied--enter'}`}
              role="status"
            >
              Copied!
            </span>
          )}
        </div>
        <div className="host-topbar__actions">
          <button
            type="button"
            className="btn-icon"
            style={{ color: tab === 'settings' ? 'var(--gold)' : undefined }}
            onClick={() => setTab(tab === 'settings' ? 'board' : 'settings')}
            title={tab === 'settings' ? 'Back to board' : 'Settings'}
            aria-label={tab === 'settings' ? 'Back to board' : 'Settings'}
          >
            <Settings size={26} />
          </button>
          <button
            type="button"
            className="btn-icon-exit"
            onClick={handleExitRoom}
            title="Exit room"
            aria-label="Exit room"
          >
            <LogOut size={22} />
          </button>
        </div>
      </header>

      <div className="flex flex-col flex-1 min-h-0">
        {tab === 'board' && (
          <div className="flex-1 flex flex-col min-h-0 tab-fade-in">
            {/* Game start view */}
            {state.phase === 'gameStart' && activeGameData && (
              <div className="flex-1 flex flex-col items-center justify-center gap-6 p-4 overflow-auto">
                <div className="font-condensed text-lg uppercase tracking-widest" style={{ color: '#4a5580' }}>Game</div>
                <div className="font-display text-5xl" style={{ color: 'var(--gold-bright)' }}>{activeGameData.name}</div>
                <div className="font-condensed text-sm" style={{ color: '#8899cc' }}>
                  {state.gameBoardIds.length} board{state.gameBoardIds.length !== 1 ? 's' : ''}
                  {' · '}
                  {state.players.filter(p => p.isConnected).length} player{state.players.filter(p => p.isConnected).length !== 1 ? 's' : ''} connected
                </div>
                <button className="btn-gold text-xl px-12 py-4 flex items-center gap-3" onClick={handleStartGame}>
                  <Play size={24} />
                  START
                </button>
                <button className="btn-ghost text-sm mt-2" onClick={handleEndGame}>
                  Cancel
                </button>
              </div>
            )}

            {/* Podium view */}
            {state.phase === 'podium' && (
              <div className="flex-1 flex flex-col items-center justify-center gap-6 p-4 overflow-auto w-full min-w-0">
                <Podium players={state.players} />
                <button className="btn-gold text-sm mt-4" onClick={handleEndGame}>
                  Back to lobby
                </button>
              </div>
            )}

            {/* Normal board/editor view */}
            {state.phase !== 'gameStart' && state.phase !== 'podium' && (
              <div className="flex-1 flex flex-col min-h-0">
                {/* Toolbar — sits directly below top bar with fixed spacing */}
                {!editing && (
                  <div className="host-board-toolbar">
                    <div className="host-board-toolbar__left">
                      <button
                        className="btn-outline text-sm btn-with-icon"
                        onClick={openBoardPicker}
                        title="Select a board from your library"
                      >
                        <LayoutGrid size={16} aria-hidden />
                        <span>Select</span>
                      </button>
                      {board && (
                        <>
                          <button
                            className="btn-ghost text-sm btn-with-icon"
                            onClick={() => setEditing(true)}
                            title="Edit the current board"
                          >
                            <Pencil size={16} aria-hidden />
                            <span>Edit</span>
                          </button>
                          <button
                            className="btn-ghost text-sm btn-with-icon"
                            onClick={handleUnselectBoard}
                            title="Unload the current board"
                          >
                            <X size={16} aria-hidden />
                            <span>Unload</span>
                          </button>
                        </>
                      )}
                    </div>

                    <div className="host-board-toolbar__center">
                      {board && (
                        <span className="host-board-toolbar__title font-condensed font-bold">
                          {board.name}
                        </span>
                      )}
                      {inGame && activeGameData && (
                        <span
                          className="font-condensed text-xs px-2 py-1 rounded"
                          style={{ background: 'rgba(212,160,23,0.12)', border: '1px solid rgba(212,160,23,0.3)', color: 'var(--gold)' }}
                        >
                          {activeGameData.name} — Board {state.currentBoardIndex + 1}/{state.gameBoardIds.length}
                        </span>
                      )}
                    </div>

                    <div className="host-board-toolbar__right">
                      {inGame && (
                        <div className="host-board-toolbar__nav">
                          <button
                            className="btn-ghost text-sm btn-icon-only"
                            onClick={handlePrevBoard}
                            title={state.currentBoardIndex === 0 ? 'Back to start' : 'Previous board'}
                            aria-label={state.currentBoardIndex === 0 ? 'Back to start' : 'Previous board'}
                          >
                            <ChevronLeft size={18} aria-hidden />
                          </button>
                          <button
                            className="btn-ghost text-sm btn-icon-only"
                            onClick={handleNextBoard}
                            title={state.currentBoardIndex >= state.gameBoardIds.length - 1 ? 'Go to podium' : 'Next board'}
                            aria-label={state.currentBoardIndex >= state.gameBoardIds.length - 1 ? 'Go to podium' : 'Next board'}
                          >
                            <ChevronRight size={18} aria-hidden />
                          </button>
                        </div>
                      )}
                      {board && !inGame && (
                        <button
                          className="btn-ghost text-sm btn-icon-only"
                          style={{ color: 'var(--red)', borderColor: 'var(--red)' }}
                          onClick={handleResetBoard}
                          title="Mark all questions as unanswered and reset all scores to 0"
                          aria-label="Reset board"
                        >
                          <RotateCcw size={18} aria-hidden />
                        </button>
                      )}
                    </div>
                  </div>
                )}

                <div className="board-and-players flex-1 flex flex-col min-h-0 overflow-hidden gap-4 px-4 pb-4 pt-2">
                  {/* Board — grows to fill space above scoreboard */}
                  <div className="board-scroll-wrap">
                    {editing && board ? (
                      <BoardEditor board={board} onChange={handleBoardChange} onClose={() => {
                        setEditing(false)
                        const current = useGameStore.getState().state
                        net.broadcast({ type: 'SYNC_STATE', state: current })
                      }} />
                    ) : board ? (
                      <GameBoard
                        board={board}
                        answeredCells={state.answeredCells}
                        onOpenCell={handleOpenCell}
                        dailyDoubleQuestionId={board.dailyDoubleQuestionId}
                        fill
                      />
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center gap-4">
                        <div className="font-condensed text-lg" style={{ color: '#4a5580' }}>No board loaded</div>
                        <div className="flex gap-3">
                          <button className="btn-gold" onClick={handleNewBoard}>Create new board</button>
                          {boardStore.boards.length > 0 && (
                            <button className="btn-outline" onClick={openBoardPicker}>Load existing board</button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Scoreboard — pinned below board, collapsible on mobile */}
                  {!editing && (
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
                          {state.players.some(p => p.isConnected) && (
                            <div className="flex justify-end mb-2">
                              <button
                                className="font-condensed text-xs px-2 py-1 rounded btn-with-icon"
                                style={{
                                  background: 'rgba(0,200,180,0.15)',
                                  color: '#40e0d0',
                                  border: '1px solid rgba(0,200,180,0.35)',
                                }}
                                title="Randomly select a player to have board control"
                                onClick={() => {
                                  const connected = state.players.filter(p => p.isConnected)
                                  if (connected.length === 0) return
                                  const pick = pickRandom(connected)
                                  setBoardControl(pick.id)
                                  net.broadcast({ type: 'SET_BOARD_CONTROL', playerId: pick.id })
                                }}
                              >
                                <Shuffle size={14} aria-hidden />
                                <span>Randomize</span>
                              </button>
                            </div>
                          )}
                          <Scoreboard
                            players={state.players}
                            buzzQueue={state.buzzQueue}
                            boardControlId={state.boardControlId}
                            activeEmojis={activeEmojis}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'settings' && (
          <div
            className="flex-1 overflow-auto tab-fade-in safe-area-x host-settings-scroll"
            style={{
              paddingTop: 'var(--space-sm)',
              paddingBottom: 'var(--space-lg)',
            }}
          >
            <SettingsPanel
              settings={settings}
              players={state.players}
              boardControlId={state.boardControlId}
              onSettingsChange={handleSettingsChange}
              onAssignBoardControl={handleAssignBoardControl}
              onUpdatePlayer={handleUpdatePlayer}
              onRemovePlayer={handleRemovePlayer}
            />
          </div>
        )}
      </div>

      {/* Board picker modal */}
      {showBoardPicker && (
        <div className="board-picker-overlay">
          <div className="panel modal-enter board-picker-modal">
            <div className="board-picker-header">
              <h2 className="board-picker-header__title">Select Board</h2>
              <button
                type="button"
                className="board-picker-close"
                onClick={closeBoardPicker}
                aria-label="Close board picker"
              >
                <X size={18} aria-hidden />
              </button>
            </div>

            <div className="board-picker-body">
              <div className="board-picker-games">
                <div className="board-picker-section-label">Games</div>

                <button
                  type="button"
                  className={`board-picker-nav-item flex-shrink-0${pickerGame === null ? ' board-picker-nav-item--active' : ''}`}
                  onClick={() => setPickerGame(null)}
                >
                  All Boards
                  <span className="ml-1 text-xs opacity-50">({boardStore.boards.length})</span>
                </button>

                {boardStore.games.map((g) =>
                  editingGameId === g.id ? (
                    <div key={g.id} className="flex items-center gap-1 flex-shrink-0">
                      <input
                        className="board-picker-input"
                        value={editingGameName}
                        onChange={(e) => setEditingGameName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitGameRename(g.id)
                          if (e.key === 'Escape') setEditingGameId(null)
                        }}
                        autoFocus
                      />
                      <button
                        type="button"
                        className="board-picker-save-btn"
                        onClick={() => commitGameRename(g.id)}
                        title="Save"
                      >
                        <Check size={14} />
                      </button>
                    </div>
                  ) : (
                    <div
                      key={g.id}
                      className={`board-picker-game-row${pickerGame === g.id ? ' board-picker-game-row--active' : ''}`}
                    >
                      <button
                        type="button"
                        className="board-picker-game-row__btn truncate"
                        onClick={() => setPickerGame(g.id)}
                      >
                        <span className="flex items-center gap-1">
                          <FolderOpen size={12} className="flex-shrink-0 opacity-70" />
                          <span className="truncate">{g.name}</span>
                          <span className="text-xs flex-shrink-0 opacity-50">
                            ({boardStore.boards.filter((b) => g.boardIds.includes(b.id)).length})
                          </span>
                        </span>
                      </button>
                      <button
                        type="button"
                        className="board-picker-icon-btn"
                        title="Rename game"
                        onClick={() => { setEditingGameId(g.id); setEditingGameName(g.name) }}
                      >
                        <Pencil size={11} />
                      </button>
                      <button
                        type="button"
                        className="board-picker-icon-btn board-picker-icon-btn--danger"
                        title="Delete game"
                        onClick={() => handleDeleteGame(g.id)}
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  )
                )}

                <div className="flex-shrink-0 mt-1">
                  {creatingGame ? (
                    <div className="flex items-center gap-1">
                      <input
                        className="board-picker-input"
                        placeholder="Game name"
                        value={newGameName}
                        onChange={(e) => setNewGameName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitNewGame()
                          if (e.key === 'Escape') { setCreatingGame(false); setNewGameName('') }
                        }}
                        autoFocus
                      />
                      <button
                        type="button"
                        className="board-picker-save-btn"
                        onClick={commitNewGame}
                        title="Create"
                      >
                        <Check size={14} />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="btn-ghost text-sm w-full text-left opacity-80"
                      onClick={() => setCreatingGame(true)}
                    >
                      + New Game
                    </button>
                  )}
                </div>
              </div>

              <div className="board-picker-divider" />

              <div className="board-picker-boards">
                <div className="board-picker-section-label">Boards</div>
                <div className="board-picker-boards__scroll">
                  {pickerBoards.map((b, idx) => (
                    <div key={b.id} className="board-picker-board-row">
                      {pickerGame && (
                        <div className="flex flex-col gap-0.5 flex-shrink-0">
                          <button
                            type="button"
                            className="board-picker-reorder-btn"
                            disabled={idx === 0}
                            onClick={() => boardStore.reorderBoardInGame(pickerGame, idx, idx - 1)}
                            title="Move up"
                          >
                            <ChevronUp size={12} />
                          </button>
                          <button
                            type="button"
                            className="board-picker-reorder-btn"
                            disabled={idx === pickerBoards.length - 1}
                            onClick={() => boardStore.reorderBoardInGame(pickerGame, idx, idx + 1)}
                            title="Move down"
                          >
                            <ChevronDown size={12} />
                          </button>
                        </div>
                      )}
                      <button
                        type="button"
                        className="board-picker-board-btn"
                        onClick={() => handleSelectBoard(b)}
                      >
                        {pickerGame && (
                          <span
                            className={`board-picker-board-order${idx === 0 ? ' board-picker-board-order--first' : ''}`}
                            aria-label={`Board position ${idx + 1}`}
                          >
                            {idx + 1}
                          </span>
                        )}
                        <span className="font-condensed font-bold">{b.name}</span>
                      </button>
                      <div className="board-picker-board-row__actions">
                        {pickerGame && (
                          <button
                            type="button"
                            className="board-picker-remove-btn"
                            title="Remove from game"
                            onClick={() => boardStore.removeBoardFromGame(pickerGame, b.id)}
                          >
                            –
                          </button>
                        )}
                        <button
                          type="button"
                          className="board-picker-icon-btn"
                          title="Duplicate board"
                          onClick={(e) => { e.stopPropagation(); void handleDuplicateBoard(b) }}
                        >
                          <CopyPlus size={11} />
                        </button>
                        <button
                          type="button"
                          className="board-picker-delete-btn"
                          title="Delete board"
                          onClick={(e) => { e.stopPropagation(); handleDeleteBoard(b.id) }}
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </div>
                  ))}

                  {pickerBoards.length === 0 && (
                    <div className="board-picker-empty">
                      {pickerGame ? 'No boards in this game yet' : 'No saved boards'}
                    </div>
                  )}

                  {pickerGame && (() => {
                    const unassigned = boardStore.boards.filter(
                      (b) => !pickerBoardIds.includes(b.id)
                    )
                    if (unassigned.length === 0) return null
                    return (
                      <div className="mt-2">
                        <div className="board-picker-section-label text-muted">Add to game</div>
                        {unassigned.map((b) => (
                          <div key={b.id} className="board-picker-unassigned">
                            <span className="flex-1 font-condensed text-sm text-subtle">{b.name}</span>
                            <button
                              type="button"
                              className="board-picker-add-btn"
                              onClick={() => boardStore.addBoardToGame(pickerGame, b.id)}
                            >
                              + Add
                            </button>
                          </div>
                        ))}
                      </div>
                    )
                  })()}
                </div>

                <div className="flex gap-2 mt-3 flex-shrink-0">
                  {pickerGame && pickerBoards.length > 0 && (
                    <button
                      type="button"
                      className="btn-gold flex-1 flex items-center justify-center gap-2"
                      onClick={() => handleSelectGame(pickerGame, pickerBoardIds)}
                    >
                      <Play size={16} />
                      Play Game
                    </button>
                  )}
                  <button
                    type="button"
                    className={`btn-gold${pickerGame && pickerBoards.length > 0 ? '' : ' w-full'}`}
                    onClick={handleNewBoard}
                  >
                    + Create New Board
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Board transition overlay */}
      {state.boardTransition && (
        <div
          className={`board-transition-overlay${boardTransitionExiting ? ' board-transition-overlay--exit' : ''}`}
          onAnimationEnd={(e) => {
            if (boardTransitionExiting && e.animationName === 'overlayFadeOut') {
              setBoardTransitionExiting(false)
              setBoardTransition(null)
              net.broadcast({ type: 'SYNC_STATE', state: useGameStore.getState().state })
            }
          }}
        >
          <div className="board-transition-title">{state.boardTransition}</div>
        </div>
      )}

      {showOverlay && (
        <QuestionOverlay
          state={state}
          settings={settings}
          onClose={() => {}}
        />
      )}

      {showDdNoControlAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(6,11,40,0.85)' }}>
          <div className="panel modal-enter flex flex-col gap-4 max-w-sm w-full text-center">
            <div className="font-display text-2xl" style={{ color: 'var(--gold-bright)' }}>DAILY DOUBLE</div>
            <div className="font-condensed text-base" style={{ color: 'var(--white)' }}>
              No player has board control.
            </div>
            <div className="text-sm" style={{ color: '#4a5580' }}>
              Assign board control to a player before opening a Daily Double question. Use the <span style={{ color: 'var(--gold)' }}>Randomize</span> button on the board tab, or choose a player under Board control in Settings.
            </div>
            <button className="btn-gold w-full" onClick={() => setShowDdNoControlAlert(false)}>
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
