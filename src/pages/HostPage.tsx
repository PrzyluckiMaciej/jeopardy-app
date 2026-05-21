import { useEffect, useRef, useState } from 'react'
import { Settings, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useGameStore, useBoardStore } from '../store/gameStore'
import * as net from '../lib/network'
import type { Board, Player, NetMessage, Question, GameSettings } from '../types'
import { createDefaultBoard, cellId } from '../lib/utils'
import { getMedia, blobToDataUrl } from '../lib/db'
import { logEvent } from '../lib/logger'
import BoardEditor from '../components/BoardEditor'
import GameBoard from '../components/GameBoard'
import QuestionOverlay from '../components/QuestionOverlay'
import SettingsPanel from '../components/SettingsPanel'
import Scoreboard from '../components/Scoreboard'

type Tab = 'board' | 'settings'

export default function HostPage() {
  const navigate = useNavigate()
  const store = useGameStore()
  const { state, settings, roomCode, setSettings, addPlayer, removePlayer, updatePlayer,
    openCard, patchState, setPlayerConnected, addBuzz } = store
  const boardStore = useBoardStore()

  const [tab, setTab] = useState<Tab>('board')
  const [editing, setEditing] = useState(false)
  const [activeBoard, setActiveBoard] = useState<Board | null>(null)
  const [showBoardPicker, setShowBoardPicker] = useState(false)
  const [copied, setCopied] = useState(false)

  // Maps Trystero peerId → stable clientId for every connected peer
  const peerToClient = useRef(new Map<string, string>())

  useEffect(() => {
    if (!roomCode) { navigate('/'); return }

    net.createRoom(roomCode)

    net.onPeerJoin((peerId) => {
      const current = useGameStore.getState()
      net.send({ type: 'SYNC_STATE', state: current.state }, peerId)
    })

    net.onPeerLeave((peerId) => {
      const clientId = peerToClient.current.get(peerId)
      if (clientId) {
        setPlayerConnected(clientId, false)
        const leavingPlayer = useGameStore.getState().state.players.find(p => p.id === clientId)
        logEvent({
          role: 'host',
          roomCode: roomCode ?? '',
          actor: 'host',
          event: `Player disconnected: ${leavingPlayer?.name ?? clientId}`,
        })
        peerToClient.current.delete(peerId)
      }
    })

    net.onMessage((msg: NetMessage, peerId: string) => {
      if (msg.type === 'PLAYER_JOIN') {
        const clientId = msg.player.id

        // Remove any stale peer mapping for this clientId (e.g. from a pre-refresh connection)
        for (const [oldPeerId, cid] of peerToClient.current.entries()) {
          if (cid === clientId && oldPeerId !== peerId) {
            peerToClient.current.delete(oldPeerId)
          }
        }
        peerToClient.current.set(peerId, clientId)

        const existing = useGameStore.getState().state.players.find(p => p.id === clientId)
        if (existing) {
          // Reconnect: restore the player's slot with their existing score
          setPlayerConnected(clientId, true)
          logEvent({
            role: 'host',
            roomCode: roomCode ?? '',
            actor: 'host',
            event: `Player reconnected: ${existing.name}`,
          })
          setTimeout(() => {
            net.broadcast({ type: 'SYNC_STATE', state: useGameStore.getState().state })
          }, 100)
          return
        }

        // New join: reject if name is already taken by a connected player
        const nameTaken = useGameStore.getState().state.players.some(
          p => p.name === msg.player.name && p.isConnected
        )
        if (nameTaken) {
          net.send({ type: 'JOIN_REJECTED', reason: 'NAME_TAKEN' }, peerId)
          return
        }

        const player: Player = { ...msg.player, id: clientId, isConnected: true }
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
    })

    return () => net.leaveRoom()
  }, [roomCode]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleSelectBoard(board: Board) {
    const b = { ...board }
    setActiveBoard(b)
    patchState({ board: b, answeredCells: [], phase: 'board' })
    net.broadcast({ type: 'SYNC_STATE', state: { ...useGameStore.getState().state, board: b, answeredCells: [], phase: 'board' } })
    setShowBoardPicker(false)
    setEditing(false)
  }

  function handleDeleteBoard(id: string) {
    boardStore.deleteBoard(id)
    if (activeBoard?.id === id) {
      setActiveBoard(null)
      setEditing(false)
      patchState({ board: null, answeredCells: [], phase: 'lobby' })
      net.broadcast({ type: 'SYNC_STATE', state: { ...useGameStore.getState().state, board: null, answeredCells: [], phase: 'lobby' } })
    }
  }

  function handleNewBoard() {
    const b = createDefaultBoard()
    boardStore.saveBoard(b)
    setActiveBoard(b)
    patchState({ board: b, answeredCells: [], phase: 'board' })
    setEditing(true)
    setShowBoardPicker(false)
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

    openCard(categoryId, question, mediaDataUrl)
    net.broadcast({ type: 'OPEN_CARD', categoryId, question, mediaDataUrl })
  }

  function handleSettingsChange(s: GameSettings) {
    setSettings(s)
    net.broadcast({ type: 'UPDATE_SETTINGS', settings: s })
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

  function copyCode() {
    navigator.clipboard.writeText(roomCode ?? '')
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const board = activeBoard ?? state.board
  const showOverlay = ['question', 'buzzing', 'revealed'].includes(state.phase) && !!state.activeQuestion

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--navy)' }}>
      {/* Top bar */}
      <div className="flex items-center gap-5 border-b" style={{ borderColor: 'var(--navy-light)', background: 'var(--navy-mid)', padding: '10px 24px' }}>
        <button className="font-display text-2xl" style={{ color: 'var(--gold-bright)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }} onClick={() => setTab('board')}>JEOPARDY!</button>
        <div className="w-px h-6" style={{ background: 'var(--navy-light)' }} />
        <div className="flex items-center gap-3">
          <span className="font-condensed text-sm uppercase" style={{ color: '#4a5580' }}>Room</span>
          <button
            className="font-display text-xl tracking-widest px-3 py-1 rounded"
            style={{ background: 'rgba(212,160,23,0.1)', border: '1px solid rgba(212,160,23,0.3)', color: 'var(--gold-bright)' }}
            onClick={copyCode}
            title="Click to copy"
          >
            {roomCode}
          </button>
          {copied && <span className="text-sm" style={{ color: 'var(--green)' }}>Copied!</span>}
        </div>
        <div className="flex-1" />
        <button
          className="flex items-center justify-center p-1"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: tab === 'settings' ? 'var(--gold)' : '#4a5580',
          }}
          onClick={() => setTab(tab === 'settings' ? 'board' : 'settings')}
          title={tab === 'settings' ? 'Back to board' : 'Settings'}
        >
          <Settings size={28} />
        </button>
      </div>

      <div className="flex flex-1 min-h-0">
        {tab === 'board' && (
          <div className="flex-1 flex flex-col p-4 gap-4 overflow-auto">
            {!editing && (
              <div className="flex items-center gap-3 flex-wrap">
                <button className="btn-outline text-sm" onClick={() => setShowBoardPicker(true)}>
                  Select board
                </button>
                <button className="btn-ghost text-sm" onClick={() => { if (board) setEditing(true); else handleNewBoard() }}>
                  {board ? 'Edit board' : 'New board'}
                </button>
                {board && <span className="font-condensed font-bold" style={{ color: 'var(--gold)' }}>{board.name}</span>}
              </div>
            )}

            {editing && board ? (
              <div className="flex-1 min-h-0">
                <BoardEditor board={board} onChange={handleBoardChange} onClose={() => setEditing(false)} />
              </div>
            ) : board ? (
              <GameBoard board={board} answeredCells={state.answeredCells} onOpenCell={handleOpenCell} />
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center gap-4">
                <div className="font-condensed text-lg" style={{ color: '#4a5580' }}>No board loaded</div>
                <div className="flex gap-3">
                  <button className="btn-gold" onClick={handleNewBoard}>Create new board</button>
                  {boardStore.boards.length > 0 && (
                    <button className="btn-outline" onClick={() => setShowBoardPicker(true)}>Load existing board</button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'settings' && (
          <div className="flex-1 p-4 overflow-auto max-w-2xl">
            <SettingsPanel
              settings={settings}
              players={state.players}
              onSettingsChange={handleSettingsChange}
              onUpdatePlayer={handleUpdatePlayer}
              onRemovePlayer={handleRemovePlayer}
            />
          </div>
        )}

        <div className="w-64 flex-shrink-0 border-l p-4 overflow-auto" style={{ borderColor: 'var(--navy-light)' }}>
          <div className="font-condensed font-bold uppercase tracking-widest text-xs mb-3" style={{ color: 'var(--gold)', opacity: 0.7 }}>
            Scoreboard
          </div>
          <Scoreboard players={state.players} buzzQueue={state.buzzQueue} />
        </div>
      </div>

      {/* Board picker modal */}
      {showBoardPicker && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4" style={{ background: 'rgba(6,11,40,0.9)' }}>
          <div className="panel w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-condensed font-bold text-lg uppercase" style={{ color: 'var(--gold)' }}>Select board</h2>
              <button className="btn-ghost text-sm" onClick={() => setShowBoardPicker(false)}>✕</button>
            </div>
            <div className="flex flex-col gap-2 mb-4">
              {boardStore.boards.map((b) => (
                <div key={b.id} className="relative group">
                  <button
                    className="flex items-center justify-between px-3 py-2 rounded-lg text-left w-full"
                    style={{ background: 'var(--navy)', border: '1px solid var(--navy-light)' }}
                    onClick={() => handleSelectBoard(b)}
                  >
                    <span className="font-condensed font-bold">{b.name}</span>
                  </button>
                  <button
                    className="absolute top-1/2 right-2 -translate-y-1/2 w-5 h-5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 hover:brightness-75"
                    style={{ background: 'var(--red)', color: '#fff', border: 'none', transition: 'opacity 150ms, filter 150ms' }}
                    onClick={(e) => { e.stopPropagation(); handleDeleteBoard(b.id) }}
                    title="Delete board"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              ))}
              {boardStore.boards.length === 0 && (
                <div className="text-sm text-center py-2" style={{ color: '#4a5580' }}>No saved boards</div>
              )}
            </div>
            <button className="btn-gold w-full" onClick={handleNewBoard}>+ Create new board</button>
          </div>
        </div>
      )}

      {showOverlay && (
        <QuestionOverlay
          state={state}
          settings={settings}
          onClose={() => {}}
        />
      )}
    </div>
  )
}
