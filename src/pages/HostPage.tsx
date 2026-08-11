import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { Settings, Trash2, Pencil, Check, Copy, Layers, LogOut, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Play, LayoutGrid, RotateCcw, Shuffle, X, Users, CircleHelp } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useGameStore, useBoardStore, isBoardTrashed, isFolderTrashed } from '../store/gameStore'
import * as net from '../lib/network'
import type { Board, BoardFolder, Player, NetMessage, Question, GameSettings, PlayerSyncStatus } from '../types'
import { createDefaultBoard, cellId } from '../lib/utils'
import { getCategoryGameplaySettings } from '../lib/settings'
import { duplicateBoard } from '../lib/duplicateBoard'
import { duplicateFolder } from '../lib/duplicateFolder'
import { collectFolderSubtree } from '../lib/folderSubtree'
import { getMedia, blobToDataUrl } from '../lib/db'
import { logEvent } from '../lib/logger'
import {
  evaluatePlayerJoin,
  normalizePlayerName,
  type NameSession,
} from '../lib/playerJoin'
import AddToGameModal from '../components/AddToGameModal'
import BoardEditor from '../components/BoardEditor'
import BoardPickerExplorer from '../components/BoardPickerExplorer'
import ContextMenu, { type ContextMenuItem } from '../components/ContextMenu'
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
  const [boardPickerExiting, setBoardPickerExiting] = useState(false)
  const [copyFeedback, setCopyFeedback] = useState<'hidden' | 'visible' | 'hiding'>('hidden')
  const [showDdNoControlAlert, setShowDdNoControlAlert] = useState(false)
  const [renameFolderId, setRenameFolderId] = useState<string | null>(null)
  const [renameBoardId, setRenameBoardId] = useState<string | null>(null)
  const [boardContextMenu, setBoardContextMenu] = useState<{
    x: number
    y: number
    items: ContextMenuItem[]
  } | null>(null)
  const [trashNavMenu, setTrashNavMenu] = useState<{
    x: number
    y: number
    items: ContextMenuItem[]
  } | null>(null)
  const [boardTransitionExiting, setBoardTransitionExiting] = useState(false)

  /** `'all'` | `'trash'` | game id */
  const [pickerNav, setPickerNav] = useState<string>('all')
  const [creatingGame, setCreatingGame] = useState(false)
  const [newGameName, setNewGameName] = useState('')
  const [editingGameId, setEditingGameId] = useState<string | null>(null)
  const [editingGameName, setEditingGameName] = useState('')
  const [addToGameTarget, setAddToGameTarget] = useState<{
    boardIds: string[]
    label: string
  } | null>(null)
  const [activeEmojis, setActiveEmojis] = useState<Record<string, { emoji: string; seq: number }>>({})
  const [mobilePlayersOpen, setMobilePlayersOpen] = useState(false)

  const peerToClient = useRef(new Map<string, string>())
  const nameSessions = useRef(new Map<string, NameSession>())
  const emojiTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const copyFeedbackTimers = useRef<ReturnType<typeof setTimeout>[]>([])

  const mediaBlobCache = useRef(new Map<string, Blob>())
  const mediaSyncMap = useRef(new Map<string, Set<string>>())
  const currentManifestIds = useRef<string[]>([])
  const [mediaSyncStatus, setMediaSyncStatus] = useState<Map<string, PlayerSyncStatus>>(new Map())

  function collectBoardMediaIds(board: Board): string[] {
    const ids: string[] = []
    for (const cat of board.categories) {
      for (const q of cat.questions) {
        if (q.mediaId) ids.push(q.mediaId)
      }
    }
    return ids
  }

  function collectMediaIdsFromBoards(boards: Board[]): string[] {
    const ids = new Set<string>()
    for (const board of boards) {
      for (const id of collectBoardMediaIds(board)) ids.add(id)
    }
    return [...ids]
  }

  function collectMediaIdsFromBoardIds(boardIds: string[]): string[] {
    const boards = boardIds
      .map((id) => boardStore.getBoard(id))
      .filter((b): b is Board => !!b)
    return collectMediaIdsFromBoards(boards)
  }

  function manifestCoversBoard(board: Board): boolean {
    const ids = collectBoardMediaIds(board)
    return ids.every((id) => currentManifestIds.current.includes(id))
  }

  async function loadMediaBlobs(mediaIds: string[]) {
    for (const id of mediaIds) {
      if (mediaBlobCache.current.has(id)) continue
      const rec = await getMedia(id)
      if (rec) mediaBlobCache.current.set(id, rec.blob)
    }
  }

  async function sendManifestAndMedia(targetPeerId: string | null) {
    const mediaIds = currentManifestIds.current
    if (mediaIds.length === 0) return

    await loadMediaBlobs(mediaIds)

    const items = mediaIds.map((mediaId) => {
      const blob = mediaBlobCache.current.get(mediaId)
      return {
        mediaId,
        mimeType: blob?.type ?? 'application/octet-stream',
        size: blob?.size ?? 0,
      }
    })

    if (targetPeerId) {
      net.send({ type: 'MEDIA_MANIFEST', items }, targetPeerId)
    } else {
      net.broadcast({ type: 'MEDIA_MANIFEST', items })
    }

    for (const mediaId of mediaIds) {
      const blob = mediaBlobCache.current.get(mediaId)
      if (!blob) continue
      net.sendMedia(blob, targetPeerId, { mediaId, mimeType: blob.type })
    }
  }

  function clearMediaSync() {
    currentManifestIds.current = []
    mediaSyncMap.current.clear()
    setMediaSyncStatus(new Map())
  }

  function initSyncForAllPlayers() {
    const players = useGameStore.getState().state.players
    for (const p of players) {
      if (p.isConnected && !mediaSyncMap.current.has(p.id)) {
        mediaSyncMap.current.set(p.id, new Set())
      }
    }
    updateSyncStatusState()
  }

  async function startPreTransferMedia(mediaIds: string[], replace = false) {
    const uniqueIds = replace
      ? [...new Set(mediaIds)]
      : [...new Set([...currentManifestIds.current, ...mediaIds])]

    if (uniqueIds.length === 0) {
      clearMediaSync()
      return
    }
    if (uniqueIds.join(',') === currentManifestIds.current.join(',')) return

    currentManifestIds.current = uniqueIds
    initSyncForAllPlayers()

    await loadMediaBlobs(uniqueIds)
    await sendManifestAndMedia(null)
  }

  async function startPreTransfer(board: Board) {
    await startPreTransferMedia(collectBoardMediaIds(board), true)
  }

  function handleMediaAck(playerId: string, mediaId: string) {
    const synced = mediaSyncMap.current.get(playerId)
    if (synced) {
      synced.add(mediaId)
    } else {
      mediaSyncMap.current.set(playerId, new Set([mediaId]))
    }
    updateSyncStatusState()
  }

  function updateSyncStatusState() {
    const total = currentManifestIds.current.length
    const next = new Map<string, PlayerSyncStatus>()
    for (const [playerId, synced] of mediaSyncMap.current) {
      next.set(playerId, { total, synced: synced.size })
    }
    setMediaSyncStatus(next)
  }

  useEffect(() => () => {
    copyFeedbackTimers.current.forEach(clearTimeout)
  }, [])

  useEffect(() => {
    if (!state.board) return
    const mediaIds = collectBoardMediaIds(state.board)
    const newIds = mediaIds.filter((id) => !currentManifestIds.current.includes(id))
    if (newIds.length > 0) void startPreTransferMedia(newIds, false)
  }, [state.board]) // eslint-disable-line react-hooks/exhaustive-deps

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
          mediaSyncMap.current.set(playerId, new Set())
          updateSyncStatusState()
          setTimeout(() => {
            net.broadcast({ type: 'SYNC_STATE', state: useGameStore.getState().state })
          }, 100)
          setTimeout(() => {
            if (currentManifestIds.current.length > 0) {
              sendManifestAndMedia(peerId)
            }
          }, 500)
          return
        }

        const player: Player = { ...msg.player, id: playerId, isConnected: true }
        addPlayer(player)
        mediaSyncMap.current.set(playerId, new Set())
        updateSyncStatusState()
        logEvent({
          role: 'host',
          roomCode: roomCode ?? '',
          actor: 'host',
          event: `Player joined: ${player.name}`,
        })
        setTimeout(() => {
          net.broadcast({ type: 'SYNC_STATE', state: useGameStore.getState().state })
        }, 100)
        setTimeout(() => {
          if (currentManifestIds.current.length > 0) {
            sendManifestAndMedia(peerId)
          }
        }, 500)
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
      if (msg.type === 'MEDIA_ACK') {
        const clientId = peerToClient.current.get(peerId)
        if (clientId) handleMediaAck(clientId, msg.mediaId)
      }
      if (msg.type === 'MEDIA_REQUEST') {
        const blob = mediaBlobCache.current.get(msg.mediaId)
        if (blob) {
          net.sendMedia(blob, peerId, { mediaId: msg.mediaId, mimeType: blob.type })
        } else {
          getMedia(msg.mediaId).then((rec) => {
            if (rec) {
              mediaBlobCache.current.set(msg.mediaId, rec.blob)
              net.sendMedia(rec.blob, peerId, { mediaId: msg.mediaId, mimeType: rec.mimeType })
            }
          })
        }
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
    startPreTransfer(b)
  }

  function handleEditBoard(board: Board) {
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
    setEditing(true)
    startPreTransfer(b)
  }

  function openBoardRowContextMenu(
    e: ReactMouseEvent,
    board: Board,
  ) {
    e.preventDefault()
    e.stopPropagation()
    setBoardContextMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        { id: 'edit', label: 'Edit', onSelect: () => handleEditBoard(board) },
        {
          id: 'duplicate',
          label: 'Duplicate',
          onSelect: () => { void handleDuplicateBoard(board) },
        },
        {
          id: 'add-to-game',
          label: 'Add to game',
          onSelect: () => setAddToGameTarget({ boardIds: [board.id], label: board.name }),
        },
        {
          id: 'delete',
          label: 'Delete',
          danger: true,
          onSelect: () => handleTrashBoard(board.id),
        },
      ],
    })
  }

  function clearActiveBoardIfNeeded(boardId: string) {
    if (activeBoard?.id === boardId) {
      setActiveBoard(null)
      setEditing(false)
      patchState({ board: null, answeredCells: [], phase: 'lobby' })
      clearMediaSync()
      net.broadcast({ type: 'SYNC_STATE', state: useGameStore.getState().state })
    }
  }

  function clearActiveBoardIfInIds(boardIds: Set<string>) {
    if (activeBoard && boardIds.has(activeBoard.id)) {
      setActiveBoard(null)
      setEditing(false)
      patchState({ board: null, answeredCells: [], phase: 'lobby' })
      clearMediaSync()
      net.broadcast({ type: 'SYNC_STATE', state: useGameStore.getState().state })
    }
  }

  function handleTrashBoard(id: string) {
    boardStore.trashBoard(id)
    if (renameBoardId === id) setRenameBoardId(null)
    clearActiveBoardIfNeeded(id)
  }

  function handleTrashFolder(folder: BoardFolder) {
    const before = useBoardStore.getState()
    const folderIds = collectFolderSubtree(before.folders, folder.id)
    const boardIds = new Set(
      before.boards
        .filter((b) => b.folderId != null && folderIds.has(b.folderId))
        .map((b) => b.id),
    )
    boardStore.trashFolder(folder.id)
    if (renameFolderId === folder.id) setRenameFolderId(null)
    clearActiveBoardIfInIds(boardIds)
  }

  function handleRestoreBoard(board: Board) {
    boardStore.restoreBoard(board.id)
  }

  function handleRestoreFolder(folder: BoardFolder) {
    boardStore.restoreFolder(folder.id)
  }

  function handlePermanentDeleteBoard(board: Board) {
    boardStore.deleteBoard(board.id)
    if (renameBoardId === board.id) setRenameBoardId(null)
    clearActiveBoardIfNeeded(board.id)
  }

  function handlePermanentDeleteFolder(folder: BoardFolder) {
    const before = useBoardStore.getState()
    const folderIds = collectFolderSubtree(before.folders, folder.id)
    const boardIds = new Set(
      before.boards
        .filter((b) => b.folderId != null && folderIds.has(b.folderId))
        .map((b) => b.id),
    )
    boardStore.deleteFolder(folder.id)
    if (renameFolderId === folder.id) setRenameFolderId(null)
    clearActiveBoardIfInIds(boardIds)
  }

  function handleEmptyTrash() {
    const before = useBoardStore.getState()
    const trashedBoardIds = new Set(
      before.boards.filter((b) => isBoardTrashed(b)).map((b) => b.id),
    )
    for (const b of before.boards) {
      if (b.folderId != null) {
        const folder = before.folders.find((f) => f.id === b.folderId)
        if (folder && isFolderTrashed(folder)) trashedBoardIds.add(b.id)
      }
    }
    boardStore.emptyTrash()
    clearActiveBoardIfInIds(trashedBoardIds)
  }

  function openTrashNavMenu(e: ReactMouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    setTrashNavMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        {
          id: 'empty-trash',
          label: 'Empty Trash',
          danger: true,
          onSelect: () => handleEmptyTrash(),
        },
      ],
    })
  }

  function handleUnselectBoard() {
    const { activeGameId, gameBoardIds } = useGameStore.getState().state
    setActiveBoard(null)
    setEditing(false)
    patchState({
      board: null,
      answeredCells: [],
      phase: activeGameId ? 'gameStart' : 'lobby',
      activeQuestion: null,
      buzzQueue: [],
      activeMedia: null,
      mediaPlayback: null,
      boardControlId: null,
      dailyDouble: null,
      boardTransition: null,
    })
    net.broadcast({ type: 'SYNC_STATE', state: useGameStore.getState().state })
    closeBoardPicker()
    if (activeGameId) {
      void startPreTransferMedia(collectMediaIdsFromBoardIds(gameBoardIds), true)
    } else {
      clearMediaSync()
    }
  }

  function handleSelectGame(gameId: string, boardIds: string[]) {
    selectGame(gameId, boardIds)
    setActiveBoard(null)
    void startPreTransferMedia(collectMediaIdsFromBoardIds(boardIds), true)
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
    if (!manifestCoversBoard(b)) void startPreTransfer(b)

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
    patchState({ board: b, answeredCells: [], phase: 'board', activeQuestion: null, buzzQueue: [], activeMedia: null, mediaPlayback: null, dailyDouble: null })
    net.broadcast({ type: 'SYNC_STATE', state: useGameStore.getState().state })
    if (!manifestCoversBoard(b)) void startPreTransfer(b)

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
        void startPreTransferMedia(collectMediaIdsFromBoardIds(gameBoardIds), true)
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
    patchState({ board: b, answeredCells: [], phase: 'board', activeQuestion: null, buzzQueue: [], activeMedia: null, mediaPlayback: null, dailyDouble: null })
    net.broadcast({ type: 'SYNC_STATE', state: useGameStore.getState().state })
    if (!manifestCoversBoard(b)) void startPreTransfer(b)

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
      activeQuestion: null, buzzQueue: [], activeMedia: null, mediaPlayback: null, dailyDouble: null,
    })
    setActiveBoard(null)
    clearMediaSync()
    net.broadcast({ type: 'SYNC_STATE', state: useGameStore.getState().state })
  }

  function handleDeleteBoard(id: string) {
    handleTrashBoard(id)
  }

  async function handleDuplicateBoard(board: Board) {
    const copy = await duplicateBoard(board)
    boardStore.saveBoard(copy)
    if (pickerNav !== 'all' && pickerNav !== 'trash') {
      boardStore.addBoardToGame(pickerNav, copy.id)
    }
  }

  async function handleDuplicateFolder(folder: BoardFolder) {
    await duplicateFolder(
      folder,
      boardStore.folders,
      boardStore.boards,
      boardStore.createFolder,
      boardStore.saveBoard,
    )
  }

  function handleNewBoard(folderId: string | null = null) {
    const b = { ...createDefaultBoard(), folderId }
    boardStore.saveBoard(b)
    setRenameFolderId(null)
    setRenameBoardId(b.id)
    if (pickerNav !== 'all') setPickerNav('all')
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
      openCard(categoryId, question, mediaDataUrl, { clue: false, media: false })
      startDailyDouble(ddPlayerId)
      net.broadcast({ type: 'DAILY_DOUBLE_REVEAL', playerId: ddPlayerId, categoryId, question })
    } else {
      const category = currentBoard?.categories.find((c) => c.id === categoryId)
      const catSettings = getCategoryGameplaySettings(category, settings)
      const hasClue = !!question.question.trim()
      const hasMedia = !!question.mediaId || !!mediaDataUrl
      // Empty clue: nothing to reveal — skip straight to open-buzzing controls
      // (do not auto-open buzz queue even if that setting is on).
      const clueRevealed = !hasClue || catSettings.autoRevealClue
      const mediaRevealed = !!hasMedia && catSettings.autoRevealMedia
      openCard(categoryId, question, mediaDataUrl, { clue: clueRevealed, media: mediaRevealed })
      net.broadcast({ type: 'OPEN_CARD', categoryId, question, clueRevealed, mediaRevealed })
      const autoBuzzFromClue = hasClue && catSettings.autoBuzzQueue && clueRevealed
      const autoBuzzFromMedia = hasMedia && catSettings.autoBuzzQueueOnMedia && mediaRevealed
      if (autoBuzzFromClue || autoBuzzFromMedia) {
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
    setPickerNav('all')
    setCreatingGame(false)
    setNewGameName('')
    setEditingGameId(null)
    setEditingGameName('')
    setBoardPickerExiting(false)
    setShowBoardPicker(true)
  }

  function closeBoardPicker() {
    if (boardPickerExiting) return
    setBoardPickerExiting(true)
  }

  function finishCloseBoardPicker() {
    setCreatingGame(false)
    setNewGameName('')
    setEditingGameId(null)
    setEditingGameName('')
    setBoardPickerExiting(false)
    setShowBoardPicker(false)
  }

  function handleBoardPickerExitAnimationEnd(e: React.AnimationEvent<HTMLDivElement>) {
    if (!boardPickerExiting) return
    if (e.target !== e.currentTarget) return
    if (e.animationName !== 'fadeSlideDown') return
    finishCloseBoardPicker()
  }

  function commitNewGame() {
    const name = newGameName.trim()
    if (!name) return
    boardStore.createGame(name)
    setNewGameName('')
    setCreatingGame(false)
  }

  function handleRequestAddToGame(boardIds: string[], label: string) {
    setAddToGameTarget({ boardIds, label })
  }

  function addBoardsToGame(gameId: string, boardIds: string[]) {
    for (const id of boardIds) {
      boardStore.addBoardToGame(gameId, id)
    }
  }

  function handleAddToGameConfirm(gameId: string) {
    if (!addToGameTarget) return
    addBoardsToGame(gameId, addToGameTarget.boardIds)
    setAddToGameTarget(null)
  }

  function handleAddToGameCreateAndConfirm(name: string) {
    if (!addToGameTarget) return
    const gameId = boardStore.createGame(name)
    addBoardsToGame(gameId, addToGameTarget.boardIds)
    setAddToGameTarget(null)
  }

  function commitGameRename(id: string) {
    const name = editingGameName.trim()
    if (!name) return
    boardStore.renameGame(id, name)
    setEditingGameId(null)
  }

  function handleDeleteGame(id: string) {
    boardStore.deleteGame(id)
    if (pickerNav === id) setPickerNav('all')
  }

  const board = activeBoard ?? state.board
  const showOverlay = ['question', 'buzzing', 'revealed', 'dailyDouble', 'dailyDoubleBet'].includes(state.phase) && !!state.activeQuestion
  const inGame = !!state.activeGameId
  const activeGameData = inGame ? boardStore.games.find(g => g.id === state.activeGameId) : null

  const pickerIsAll = pickerNav === 'all'
  const pickerIsTrash = pickerNav === 'trash'
  const pickerGameId = !pickerIsAll && !pickerIsTrash ? pickerNav : null
  const libraryBoards = boardStore.boards.filter((b) => !isBoardTrashed(b))
  const trashBoardCount = boardStore.boards.filter((b) => isBoardTrashed(b)).length
  const pickerGameData = pickerGameId ? boardStore.games.find(g => g.id === pickerGameId) : null
  const pickerBoardIds = pickerGameData?.boardIds ?? []
  const pickerBoards = pickerGameId
    ? pickerBoardIds
        .map(id => boardStore.boards.find(b => b.id === id))
        .filter((b): b is Board => !!b && !isBoardTrashed(b))
    : libraryBoards

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
                      <BoardEditor
                        board={board}
                        globalSettings={settings}
                        onChange={handleBoardChange}
                        onDelete={() => handleDeleteBoard(board.id)}
                        onClose={() => {
                          setEditing(false)
                          const current = useGameStore.getState().state
                          net.broadcast({ type: 'SYNC_STATE', state: current })
                          if (board) void startPreTransferMedia(collectBoardMediaIds(board), false)
                        }}
                      />
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
                          <button className="btn-gold" onClick={openBoardPicker}>
                            {boardStore.boards.length > 0 ? 'Load existing board' : 'Open board selection'}
                          </button>
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
              mediaSyncStatus={mediaSyncStatus}
            />
          </div>
        )}
      </div>

      {/* Board picker modal */}
      {showBoardPicker && (
        <div
          className={`board-picker-overlay${boardPickerExiting ? ' board-picker-overlay--exit' : ''}`}
          onClick={closeBoardPicker}
        >
          <div
            className={`panel board-picker-modal${boardPickerExiting ? ' modal-exit' : ' modal-enter'}`}
            onClick={(e) => e.stopPropagation()}
            onAnimationEnd={handleBoardPickerExitAnimationEnd}
            role="dialog"
            aria-labelledby="board-picker-title"
          >
            <div className="board-picker-header">
              <h2 id="board-picker-title" className="board-picker-header__title">Select Board</h2>
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
                <div className="board-picker-system-folders">
                  <button
                    type="button"
                    className={`board-picker-nav-item flex-shrink-0${pickerIsAll ? ' board-picker-nav-item--active' : ''}`}
                    onClick={() => setPickerNav('all')}
                  >
                    <LayoutGrid size={14} className="flex-shrink-0 opacity-70" aria-hidden />
                    <span className="board-picker-nav-item__text">
                      <span className="truncate">All Boards</span>
                      <span className="board-picker-nav-item__count">({libraryBoards.length})</span>
                    </span>
                  </button>

                  <button
                    type="button"
                    className={`board-picker-nav-item flex-shrink-0${pickerIsTrash ? ' board-picker-nav-item--active' : ''}`}
                    onClick={() => setPickerNav('trash')}
                    onContextMenu={openTrashNavMenu}
                  >
                    <Trash2 size={14} className="flex-shrink-0 opacity-70" aria-hidden />
                    <span className="board-picker-nav-item__text">
                      <span className="truncate">Trash</span>
                      <span className="board-picker-nav-item__count">({trashBoardCount})</span>
                    </span>
                  </button>
                </div>

                <div className="board-picker-system-sep" aria-hidden />

                <div className="board-picker-section-label">Games</div>

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
                      className={`board-picker-game-row${pickerGameId === g.id ? ' board-picker-game-row--active' : ''}`}
                    >
                      <button
                        type="button"
                        className="board-picker-game-row__btn truncate"
                        onClick={() => setPickerNav(g.id)}
                      >
                        <span className="flex items-center gap-1">
                          <Layers size={12} className="flex-shrink-0 opacity-70" />
                          <span className="truncate">{g.name}</span>
                          <span className="text-xs flex-shrink-0 opacity-50">
                            ({boardStore.boards.filter((b) => g.boardIds.includes(b.id) && !isBoardTrashed(b)).length})
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
                <div className="board-picker-section-label board-picker-boards-header">
                  <span>{pickerIsTrash ? 'Trash' : 'Boards'}</span>
                  {(pickerIsAll || pickerIsTrash) && (
                    <span
                      className="board-picker-help"
                      data-tooltip={
                        pickerIsTrash
                          ? 'Right-click an item to restore it or delete it permanently. Right-click Trash to empty it.'
                          : 'Click a folder to open it. Right-click empty space or a folder to create items, or a board/folder to edit, duplicate, or delete.'
                      }
                      aria-label={
                        pickerIsTrash
                          ? 'Right-click an item to restore it or delete it permanently. Right-click Trash to empty it.'
                          : 'Click a folder to open it. Right-click empty space or a folder to create items, or a board/folder to edit, duplicate, or delete.'
                      }
                      tabIndex={0}
                    >
                      <CircleHelp size={18} aria-hidden />
                    </span>
                  )}
                </div>
                {pickerIsAll || pickerIsTrash ? (
                  <BoardPickerExplorer
                    key={pickerIsTrash ? 'trash' : 'library'}
                    mode={pickerIsTrash ? 'trash' : 'library'}
                    boards={boardStore.boards}
                    folders={boardStore.folders}
                    onSelectBoard={handleSelectBoard}
                    onEditBoard={handleEditBoard}
                    onDeleteBoard={(b) => handleTrashBoard(b.id)}
                    onDuplicateBoard={(b) => { void handleDuplicateBoard(b) }}
                    onDuplicateFolder={(f) => { void handleDuplicateFolder(f) }}
                    onRequestDeleteFolder={handleTrashFolder}
                    onCreateBoard={handleNewBoard}
                    onRequestAddToGame={handleRequestAddToGame}
                    onRestoreBoard={handleRestoreBoard}
                    onRestoreFolder={handleRestoreFolder}
                    onPermanentDeleteBoard={handlePermanentDeleteBoard}
                    onPermanentDeleteFolder={handlePermanentDeleteFolder}
                    renameFolderId={renameFolderId}
                    onRenameFolderIdChange={setRenameFolderId}
                    renameBoardId={renameBoardId}
                    onRenameBoardIdChange={setRenameBoardId}
                  />
                ) : (
                <div className="board-picker-boards__scroll">
                  {pickerBoards.map((b, idx) => (
                    <div
                      key={b.id}
                      className="board-picker-board-row"
                      onContextMenu={(e) => openBoardRowContextMenu(e, b)}
                    >
                      <div className="flex flex-col gap-0.5 flex-shrink-0">
                          <button
                            type="button"
                            className="board-picker-reorder-btn"
                            disabled={idx === 0}
                            onClick={() => boardStore.reorderBoardInGame(pickerGameId!, idx, idx - 1)}
                            title="Move up"
                          >
                            <ChevronUp size={12} />
                          </button>
                          <button
                            type="button"
                            className="board-picker-reorder-btn"
                            disabled={idx === pickerBoards.length - 1}
                            onClick={() => boardStore.reorderBoardInGame(pickerGameId!, idx, idx + 1)}
                            title="Move down"
                          >
                            <ChevronDown size={12} />
                          </button>
                        </div>
                      <button
                        type="button"
                        className="board-picker-board-btn"
                        onClick={() => handleSelectBoard(b)}
                      >
                        <span
                          className={`board-picker-board-order${idx === 0 ? ' board-picker-board-order--first' : ''}`}
                          aria-label={`Board position ${idx + 1}`}
                        >
                          {idx + 1}
                        </span>
                        <LayoutGrid size={14} className="flex-shrink-0 opacity-70" />
                        <span className="font-condensed font-bold truncate">{b.name}</span>
                      </button>
                      <div className="board-picker-board-row__actions">
                        <button
                          type="button"
                          className="board-picker-remove-btn"
                          title="Remove from game"
                          onClick={() => boardStore.removeBoardFromGame(pickerGameId!, b.id)}
                        >
                          –
                        </button>
                      </div>
                    </div>
                  ))}

                  {pickerBoards.length === 0 && (
                    <div className="board-picker-empty">
                      No boards in this game yet
                    </div>
                  )}

                  {(() => {
                    const unassigned = libraryBoards.filter(
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
                              onClick={() => boardStore.addBoardToGame(pickerGameId!, b.id)}
                            >
                              + Add
                            </button>
                          </div>
                        ))}
                      </div>
                    )
                  })()}
                </div>
                )}

                {pickerGameId && pickerBoards.length > 0 && (
                  <div className="flex gap-2 mt-3 flex-shrink-0">
                    <button
                      type="button"
                      className="btn-gold flex-1 flex items-center justify-center gap-2"
                      onClick={() => handleSelectGame(pickerGameId, pickerBoardIds)}
                    >
                      <Play size={16} />
                      Play Game
                    </button>
                  </div>
                )}
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

      {boardContextMenu && (
        <ContextMenu
          x={boardContextMenu.x}
          y={boardContextMenu.y}
          items={boardContextMenu.items}
          onClose={() => setBoardContextMenu(null)}
        />
      )}

      {trashNavMenu && (
        <ContextMenu
          x={trashNavMenu.x}
          y={trashNavMenu.y}
          items={trashNavMenu.items}
          onClose={() => setTrashNavMenu(null)}
        />
      )}

      {addToGameTarget && (
        <AddToGameModal
          boardIds={addToGameTarget.boardIds}
          label={addToGameTarget.label}
          games={boardStore.games.map((g) => ({ id: g.id, name: g.name }))}
          onConfirm={handleAddToGameConfirm}
          onCreateAndConfirm={handleAddToGameCreateAndConfirm}
          onCancel={() => setAddToGameTarget(null)}
        />
      )}
    </div>
  )
}
