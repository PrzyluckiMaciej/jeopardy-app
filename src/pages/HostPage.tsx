import { useEffect, useRef, useState } from 'react'
import { Settings, Trash2, Pencil, Check, FolderOpen, LogOut } from 'lucide-react'
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

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

export default function HostPage() {
  const navigate = useNavigate()
  const store = useGameStore()
  const { state, settings, roomCode, setSettings, addPlayer, removePlayer, updatePlayer,
    openCard, patchState, setPlayerConnected, addBuzz, resetBoard, setBoardControl } = store
  const boardStore = useBoardStore()

  const [tab, setTab] = useState<Tab>('board')
  const [editing, setEditing] = useState(false)
  const [activeBoard, setActiveBoard] = useState<Board | null>(null)
  const [showBoardPicker, setShowBoardPicker] = useState(false)
  const [copied, setCopied] = useState(false)

  // Board picker group state
  const [pickerGroup, setPickerGroup] = useState<string | null>(null)
  const [creatingGroup, setCreatingGroup] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null)
  const [editingGroupName, setEditingGroupName] = useState('')

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
    const connectedPlayers = useGameStore.getState().state.players.filter(p => p.isConnected)
    const randomControl = connectedPlayers.length > 0 ? pickRandom(connectedPlayers).id : null
    patchState({ board: b, answeredCells: [], phase: 'board', boardControlId: randomControl })
    net.broadcast({ type: 'SYNC_STATE', state: { ...useGameStore.getState().state, board: b, answeredCells: [], phase: 'board', boardControlId: randomControl } })
    closeBoardPicker()
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
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  function handleExitRoom() {
    if (!window.confirm('Exit the room? All players will be disconnected.')) return
    net.leaveRoom()
    store.reset()
    navigate('/')
  }

  function openBoardPicker() {
    setPickerGroup(null)
    setCreatingGroup(false)
    setNewGroupName('')
    setEditingGroupId(null)
    setEditingGroupName('')
    setShowBoardPicker(true)
  }

  function closeBoardPicker() {
    setCreatingGroup(false)
    setNewGroupName('')
    setEditingGroupId(null)
    setEditingGroupName('')
    setShowBoardPicker(false)
  }

  function commitNewGroup() {
    const name = newGroupName.trim()
    if (!name) return
    boardStore.createGroup(name)
    setNewGroupName('')
    setCreatingGroup(false)
  }

  function commitGroupRename(id: string) {
    const name = editingGroupName.trim()
    if (!name) return
    boardStore.renameGroup(id, name)
    setEditingGroupId(null)
  }

  function handleDeleteGroup(id: string) {
    boardStore.deleteGroup(id)
    if (pickerGroup === id) setPickerGroup(null)
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
          className="btn-icon"
          style={{ color: tab === 'settings' ? 'var(--gold)' : undefined }}
          onClick={() => setTab(tab === 'settings' ? 'board' : 'settings')}
          title={tab === 'settings' ? 'Back to board' : 'Settings'}
        >
          <Settings size={26} />
        </button>
        <button
          className="btn-icon-exit"
          onClick={handleExitRoom}
          title="Exit room"
        >
          <LogOut size={22} />
        </button>
      </div>

      <div className="flex flex-1 min-h-0">
        {tab === 'board' && (
          <div className="flex-1 flex flex-col p-4 gap-4 overflow-auto">
            {!editing && (
              <div className="flex items-center gap-3 flex-wrap">
                <button className="btn-outline text-sm" onClick={openBoardPicker}>
                  Select board
                </button>
                <button className="btn-ghost text-sm" onClick={() => { if (board) setEditing(true); else handleNewBoard() }}>
                  {board ? 'Edit board' : 'New board'}
                </button>
                {board && <span className="font-condensed font-bold" style={{ color: 'var(--gold)' }}>{board.name}</span>}
                {board && (
                  <button
                    className="btn-ghost text-sm"
                    style={{ color: 'var(--red)', borderColor: 'var(--red)' }}
                    onClick={handleResetBoard}
                    title="Mark all questions as unanswered and reset all scores to 0"
                  >
                    Reset board
                  </button>
                )}
              </div>
            )}

            {editing && board ? (
              <div className="flex-1 min-h-0">
                <BoardEditor board={board} onChange={handleBoardChange} onClose={() => {
                  setEditing(false)
                  const current = useGameStore.getState().state
                  net.broadcast({ type: 'SYNC_STATE', state: current })
                }} />
              </div>
            ) : board ? (
              <GameBoard board={board} answeredCells={state.answeredCells} onOpenCell={handleOpenCell} />
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center gap-4">
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
          <div className="flex items-center justify-between mb-3">
            <div className="font-condensed font-bold uppercase tracking-widest text-xs" style={{ color: 'var(--gold)', opacity: 0.7 }}>
              Scoreboard
            </div>
            {state.players.some(p => p.isConnected) && (
              <button
                className="font-condensed text-xs px-2 py-1 rounded"
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
                Randomize
              </button>
            )}
          </div>
          <Scoreboard players={state.players} buzzQueue={state.buzzQueue} boardControlId={state.boardControlId} />
        </div>
      </div>

      {/* Board picker modal */}
      {showBoardPicker && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4" style={{ background: 'rgba(6,11,40,0.9)' }}>
          <div className="panel w-full max-w-2xl flex flex-col" style={{ height: '70vh' }}>
            {/* Header */}
            <div className="flex items-center justify-between mb-4 flex-shrink-0">
              <h2 className="font-condensed font-bold text-lg uppercase" style={{ color: 'var(--gold)' }}>Select Board</h2>
              <button className="btn-ghost text-sm" onClick={closeBoardPicker}>✕</button>
            </div>

            <div className="flex gap-4 flex-1 min-h-0 overflow-hidden">
              {/* Left: Groups panel */}
              <div className="w-44 flex-shrink-0 flex flex-col gap-1 overflow-auto">
                <div className="font-condensed text-xs uppercase tracking-widest mb-1 flex-shrink-0" style={{ color: 'var(--gold)', opacity: 0.7 }}>
                  Groups
                </div>

                {/* All boards */}
                <button
                  className="text-left px-3 py-2 rounded-lg font-condensed font-bold text-sm flex-shrink-0"
                  style={{
                    background: pickerGroup === null ? 'rgba(212,160,23,0.18)' : 'transparent',
                    border: pickerGroup === null ? '1px solid rgba(212,160,23,0.45)' : '1px solid transparent',
                    color: pickerGroup === null ? 'var(--gold)' : '#fff',
                  }}
                  onClick={() => setPickerGroup(null)}
                >
                  All Boards
                  <span className="ml-1 text-xs" style={{ opacity: 0.5 }}>({boardStore.boards.length})</span>
                </button>

                {/* Group list */}
                {boardStore.groups.map((g) =>
                  editingGroupId === g.id ? (
                    <div key={g.id} className="flex items-center gap-1 flex-shrink-0">
                      <input
                        className="flex-1 px-2 py-1 rounded text-sm font-condensed"
                        style={{ background: 'var(--navy)', border: '1px solid var(--gold)', color: '#fff', minWidth: 0 }}
                        value={editingGroupName}
                        onChange={(e) => setEditingGroupName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitGroupRename(g.id)
                          if (e.key === 'Escape') setEditingGroupId(null)
                        }}
                        autoFocus
                      />
                      <button
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--green)', padding: '2px' }}
                        onClick={() => commitGroupRename(g.id)}
                        title="Save"
                      >
                        <Check size={14} />
                      </button>
                    </div>
                  ) : (
                    <div
                      key={g.id}
                      className="group flex items-center gap-1 px-2 py-1.5 rounded-lg flex-shrink-0"
                      style={{
                        background: pickerGroup === g.id ? 'rgba(212,160,23,0.18)' : 'transparent',
                        border: pickerGroup === g.id ? '1px solid rgba(212,160,23,0.45)' : '1px solid transparent',
                      }}
                    >
                      <button
                        className="flex-1 text-left font-condensed font-bold text-sm truncate"
                        style={{ background: 'none', border: 'none', color: pickerGroup === g.id ? 'var(--gold)' : '#fff', cursor: 'pointer', minWidth: 0 }}
                        onClick={() => setPickerGroup(g.id)}
                      >
                        <span className="flex items-center gap-1">
                          <FolderOpen size={12} style={{ flexShrink: 0, opacity: 0.7 }} />
                          <span className="truncate">{g.name}</span>
                          <span className="text-xs flex-shrink-0" style={{ opacity: 0.5 }}>
                            ({boardStore.boards.filter((b) => g.boardIds.includes(b.id)).length})
                          </span>
                        </span>
                      </button>
                      <button
                        className="opacity-0 group-hover:opacity-100 flex-shrink-0"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8899cc', padding: '2px', transition: 'opacity 150ms' }}
                        title="Rename group"
                        onClick={() => { setEditingGroupId(g.id); setEditingGroupName(g.name) }}
                      >
                        <Pencil size={11} />
                      </button>
                      <button
                        className="opacity-0 group-hover:opacity-100 flex-shrink-0"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: '2px', transition: 'opacity 150ms' }}
                        title="Delete group"
                        onClick={() => handleDeleteGroup(g.id)}
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  )
                )}

                {/* New group */}
                <div className="flex-shrink-0 mt-1">
                  {creatingGroup ? (
                    <div className="flex items-center gap-1">
                      <input
                        className="flex-1 px-2 py-1 rounded text-sm font-condensed"
                        style={{ background: 'var(--navy)', border: '1px solid var(--gold)', color: '#fff', minWidth: 0 }}
                        placeholder="Group name"
                        value={newGroupName}
                        onChange={(e) => setNewGroupName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitNewGroup()
                          if (e.key === 'Escape') { setCreatingGroup(false); setNewGroupName('') }
                        }}
                        autoFocus
                      />
                      <button
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--green)', padding: '2px' }}
                        onClick={commitNewGroup}
                        title="Create"
                      >
                        <Check size={14} />
                      </button>
                    </div>
                  ) : (
                    <button
                      className="btn-ghost text-sm w-full text-left"
                      style={{ opacity: 0.8 }}
                      onClick={() => setCreatingGroup(true)}
                    >
                      + New Group
                    </button>
                  )}
                </div>
              </div>

              {/* Divider */}
              <div className="w-px flex-shrink-0" style={{ background: 'var(--navy-light)' }} />

              {/* Right: Boards panel */}
              <div className="flex-1 flex flex-col min-h-0">
                <div className="flex-1 overflow-auto flex flex-col gap-2 pr-1">
                  {/* Boards in current view */}
                  {(pickerGroup
                    ? boardStore.boards.filter((b) =>
                        boardStore.groups.find((g) => g.id === pickerGroup)?.boardIds.includes(b.id)
                      )
                    : boardStore.boards
                  ).map((b) => (
                    <div key={b.id} className="group flex items-center gap-2">
                      <button
                        className="flex-1 flex items-center px-3 py-2 rounded-lg text-left"
                        style={{ background: 'var(--navy)', border: '1px solid var(--navy-light)' }}
                        onClick={() => handleSelectBoard(b)}
                      >
                        <span className="font-condensed font-bold">{b.name}</span>
                      </button>
                      <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100" style={{ transition: 'opacity 150ms' }}>
                        {pickerGroup && (
                          <button
                            className="w-6 h-6 rounded flex items-center justify-center text-sm font-bold"
                            style={{ background: 'rgba(212,160,23,0.12)', border: '1px solid rgba(212,160,23,0.3)', color: 'var(--gold)', cursor: 'pointer' }}
                            title="Remove from group"
                            onClick={() => boardStore.removeBoardFromGroup(pickerGroup, b.id)}
                          >
                            –
                          </button>
                        )}
                        <button
                          className="w-6 h-6 rounded flex items-center justify-center"
                          style={{ background: 'var(--red)', color: '#fff', border: 'none', cursor: 'pointer' }}
                          title="Delete board"
                          onClick={(e) => { e.stopPropagation(); handleDeleteBoard(b.id) }}
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </div>
                  ))}

                  {/* Empty state for current view */}
                  {(pickerGroup
                    ? boardStore.boards.filter((b) =>
                        boardStore.groups.find((g) => g.id === pickerGroup)?.boardIds.includes(b.id)
                      )
                    : boardStore.boards
                  ).length === 0 && (
                    <div className="text-sm text-center py-4" style={{ color: '#4a5580' }}>
                      {pickerGroup ? 'No boards in this group yet' : 'No saved boards'}
                    </div>
                  )}

                  {/* Add boards to group section */}
                  {pickerGroup && (() => {
                    const unassigned = boardStore.boards.filter(
                      (b) => !boardStore.groups.find((g) => g.id === pickerGroup)?.boardIds.includes(b.id)
                    )
                    if (unassigned.length === 0) return null
                    return (
                      <div className="mt-2">
                        <div className="text-xs uppercase tracking-widest mb-2" style={{ color: '#4a5580' }}>
                          Add to group
                        </div>
                        {unassigned.map((b) => (
                          <div
                            key={b.id}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg mb-1"
                            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--navy-light)' }}
                          >
                            <span className="flex-1 font-condensed text-sm" style={{ color: '#6b7db3' }}>{b.name}</span>
                            <button
                              className="text-xs px-2 py-0.5 rounded"
                              style={{ background: 'rgba(212,160,23,0.15)', border: '1px solid rgba(212,160,23,0.3)', color: 'var(--gold)', cursor: 'pointer' }}
                              onClick={() => boardStore.addBoardToGroup(pickerGroup, b.id)}
                            >
                              + Add
                            </button>
                          </div>
                        ))}
                      </div>
                    )
                  })()}
                </div>

                <button className="btn-gold w-full mt-3 flex-shrink-0" onClick={handleNewBoard}>
                  + Create New Board
                </button>
              </div>
            </div>
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
