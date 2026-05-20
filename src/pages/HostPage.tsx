import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore, useBoardStore } from '../store/gameStore'
import * as net from '../lib/network'
import type { Board, Player, NetMessage, Question, GameSettings } from '../types'
import { createDefaultBoard, cellId } from '../lib/utils'
import { getMedia, blobToDataUrl } from '../lib/db'
import BoardEditor from '../components/BoardEditor'
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

  useEffect(() => {
    if (!roomCode) { navigate('/'); return }

    net.createRoom(roomCode)

    net.onPeerJoin((peerId) => {
      const current = useGameStore.getState()
      net.send({ type: 'SYNC_STATE', state: current.state }, peerId)
    })

    net.onPeerLeave((peerId) => {
      setPlayerConnected(peerId, false)
    })

    net.onMessage((msg: NetMessage, peerId: string) => {
      if (msg.type === 'PLAYER_JOIN') {
        const player: Player = { ...msg.player, id: peerId, isConnected: true }
        addPlayer(player)
        setTimeout(() => {
          net.broadcast({ type: 'SYNC_STATE', state: useGameStore.getState().state })
        }, 100)
      }
      if (msg.type === 'BUZZ') {
        addBuzz(peerId)
        net.broadcast({ type: 'BUZZ', playerId: peerId, playerName: msg.playerName })
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
    updatePlayer(p)
    net.broadcast({ type: 'UPDATE_PLAYER', player: p })
  }

  function handleRemovePlayer(id: string) {
    removePlayer(id)
    net.broadcast({ type: 'REMOVE_PLAYER', playerId: id })
  }

  function handleAddPlayer(p: Player) {
    addPlayer(p)
    setTimeout(() => {
      net.broadcast({ type: 'SYNC_STATE', state: useGameStore.getState().state })
    }, 100)
  }

  function copyCode() {
    navigator.clipboard.writeText(roomCode ?? '')
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const board = activeBoard ?? state.board
  const showOverlay = ['question', 'buzzing', 'judging', 'revealed'].includes(state.phase) && !!state.activeQuestion

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--navy)' }}>
      {/* Top bar */}
      <div className="flex items-center gap-4 px-4 py-3 border-b" style={{ borderColor: 'var(--navy-light)', background: 'var(--navy-mid)' }}>
        <button className="font-display text-xl" style={{ color: 'var(--gold-bright)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }} onClick={() => setTab('board')}>JEOPARDY!</button>
        <div className="w-px h-5" style={{ background: 'var(--navy-light)' }} />
        <div className="flex items-center gap-2">
          <span className="font-condensed text-xs uppercase" style={{ color: '#4a5580' }}>Room</span>
          <button
            className="font-display text-lg tracking-widest px-2 py-0.5 rounded"
            style={{ background: 'rgba(212,160,23,0.1)', border: '1px solid rgba(212,160,23,0.3)', color: 'var(--gold-bright)' }}
            onClick={copyCode}
            title="Click to copy"
          >
            {roomCode}
          </button>
          {copied && <span className="text-xs" style={{ color: 'var(--green)' }}>Copied!</span>}
        </div>
        <div className="flex-1" />
        <div className="flex" style={{ background: 'var(--navy)', border: '1px solid var(--navy-light)', borderRadius: 8, padding: 2 }}>
          {(['board', 'settings'] as Tab[]).map((t) => (
            <button
              key={t}
              className="font-condensed text-sm uppercase px-4 py-1 rounded"
              style={{
                background: tab === t ? 'var(--navy-light)' : 'transparent',
                color: tab === t ? 'var(--gold)' : '#4a5580',
                border: 'none',
                letterSpacing: '0.05em',
              }}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ))}
        </div>
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
              onAddPlayer={handleAddPlayer}
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
                <button
                  key={b.id}
                  className="flex items-center justify-between px-3 py-2 rounded-lg text-left w-full"
                  style={{ background: 'var(--navy)', border: '1px solid var(--navy-light)' }}
                  onClick={() => handleSelectBoard(b)}
                >
                  <span className="font-condensed font-bold">{b.name}</span>
                  <span className="text-xs" style={{ color: '#4a5580' }}>{b.categories.length} cats</span>
                </button>
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

function GameBoard({ board, answeredCells, onOpenCell }: {
  board: Board
  answeredCells: string[]
  onOpenCell: (categoryId: string, q: Question) => void
}) {
  return (
    <div className="overflow-auto">
      <div
        className="grid gap-2 min-w-max"
        style={{ gridTemplateColumns: `repeat(${board.categories.length}, minmax(140px, 1fr))` }}
      >
        {board.categories.map((cat) => (
          <div
            key={cat.id}
            className="flex items-center justify-center text-center px-2 py-4 rounded font-condensed font-bold uppercase"
            style={{ background: 'var(--navy-mid)', border: '2px solid var(--navy-light)', letterSpacing: 1, fontSize: 14, minHeight: 72 }}
          >
            {cat.name}
          </div>
        ))}

        {board.pointValues.map((pts) =>
          board.categories.map((cat) => {
            const q = cat.questions.find((q) => q.points === pts)
            if (!q) return <div key={`${cat.id}-${pts}`} />
            const isAnswered = answeredCells.includes(cellId(cat.id, q.id))
            return (
              <button
                key={q.id}
                className={`board-cell rounded flex flex-col items-center justify-center gap-1 ${isAnswered ? 'answered' : ''}`}
                style={{ minHeight: 90 }}
                onClick={() => !isAnswered && onOpenCell(cat.id, q)}
                disabled={isAnswered}
              >
                <span className="font-display text-3xl" style={{ color: isAnswered ? '#4a5580' : 'var(--gold-bright)' }}>
                  ${pts}
                </span>
                {q.mediaId && !isAnswered && (
                  <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: 'var(--gold)', opacity: 0.6 }} />
                )}
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
