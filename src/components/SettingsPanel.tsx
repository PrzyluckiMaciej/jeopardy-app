import { useState } from 'react'
import type { GameSettings, Player } from '../types'
import { formatScore } from '../lib/utils'

interface Props {
  settings: GameSettings
  players: Player[]
  boardControlId: string | null
  onSettingsChange: (s: GameSettings) => void
  onAssignBoardControl: (playerId: string | null) => void
  onUpdatePlayer: (p: Player) => void
  onRemovePlayer: (id: string) => void
}

export default function SettingsPanel({
  settings,
  players,
  boardControlId,
  onSettingsChange,
  onAssignBoardControl,
  onUpdatePlayer,
  onRemovePlayer,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editScore, setEditScore] = useState('')

  function toggle(key: keyof GameSettings) {
    const updated = { ...settings, [key]: !settings[key] }
    if (key === 'autoBuzzQueue' && !updated.autoBuzzQueue) {
      updated.blurClueOnBuzz = false
    }
    onSettingsChange(updated)
  }

  function startEdit(p: Player) {
    setEditingId(p.id)
    setEditName(p.name)
    setEditScore(String(p.score))
  }

  function saveEdit(p: Player) {
    onUpdatePlayer({ ...p, name: editName.trim() || p.name, score: parseInt(editScore) || 0 })
    setEditingId(null)
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Game settings */}
      <div>
        <div className="font-condensed font-bold uppercase tracking-widest text-xs mb-3" style={{ color: 'var(--gold)', opacity: 0.7 }}>
          Game settings
        </div>
        <div className="flex flex-col gap-3">
          <Toggle
            label="Point deduction"
            description="Wrong answers deduct the question value"
            value={settings.pointDeduction}
            onChange={() => toggle('pointDeduction')}
          />
          <Toggle
            label="Negative points"
            description="Deductions can reduce a score below zero"
            value={settings.allowNegativeScore}
            onChange={() => toggle('allowNegativeScore')}
            disabled={!settings.pointDeduction}
          />
          <Toggle
            label="Auto buzz queue"
            description="Players can buzz immediately after the clue is revealed"
            value={settings.autoBuzzQueue}
            onChange={() => toggle('autoBuzzQueue')}
          />
          <Toggle
            label="Blur clue on buzz"
            description="Blurs the clue when any player buzzes in"
            value={settings.blurClueOnBuzz}
            onChange={() => toggle('blurClueOnBuzz')}
            disabled={!settings.autoBuzzQueue}
          />
        </div>
      </div>

      {/* Board control */}
      <div>
        <div className="font-condensed font-bold uppercase tracking-widest text-xs mb-3" style={{ color: 'var(--gold)', opacity: 0.7 }}>
          Board control
        </div>
        <div
          className="px-3 py-2 rounded-lg"
          style={{ background: 'var(--navy)', border: '1px solid var(--navy-light)' }}
        >
          <div className="text-xs mb-2" style={{ color: '#4a5580' }}>
            The selected player picks the next clue (required for Daily Doubles).
          </div>
          <select
            className="w-full text-sm"
            value={boardControlId ?? ''}
            onChange={(e) => onAssignBoardControl(e.target.value || null)}
            disabled={players.length === 0}
          >
            <option value="">None</option>
            {players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {!p.isConnected ? ' (offline)' : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Players */}
      <div>
        <div className="font-condensed font-bold uppercase tracking-widest text-xs mb-3" style={{ color: 'var(--gold)', opacity: 0.7 }}>
          Players
        </div>
        <div className="flex flex-col gap-2">
          {players.map((p) =>
            editingId === p.id ? (
              <div key={p.id} className="panel flex flex-col gap-2">
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Name"
                  className="w-full text-sm"
                  autoFocus
                />
                <input
                  value={editScore}
                  onChange={(e) => setEditScore(e.target.value)}
                  placeholder="Score"
                  type="number"
                  className="w-full text-sm"
                />
                <div className="flex gap-2">
                  <button className="btn-gold flex-1 text-sm py-1" onClick={() => saveEdit(p)}>Save</button>
                  <button className="btn-ghost flex-1 text-sm py-1" onClick={() => setEditingId(null)}>Cancel</button>
                </div>
              </div>
            ) : (
              <div
                key={p.id}
                className="flex items-center gap-2 px-3 py-2 rounded-lg"
                style={{
                  background: 'var(--navy)',
                  border: '1px solid var(--navy-light)',
                  opacity: p.isConnected ? 1 : 0.7,
                }}
              >
                <div
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ background: p.isConnected ? 'var(--green)' : '#4a5580' }}
                  title={p.isConnected ? 'Connected' : 'Not connected'}
                />
                <div className="flex-1 min-w-0">
                  <div className="font-condensed font-bold text-sm truncate">
                    {p.name}
                    {boardControlId === p.id && (
                      <span
                        className="ml-1.5 font-condensed text-xs px-1.5 py-0.5 rounded"
                        style={{
                          background: 'rgba(0,200,180,0.2)',
                          color: '#40e0d0',
                          border: '1px solid rgba(0,200,180,0.45)',
                          verticalAlign: 'middle',
                        }}
                      >
                        BOARD
                      </span>
                    )}
                  </div>
                  <div className="text-xs" style={{ color: p.score < 0 ? '#e07070' : 'var(--gold)' }}>
                    {formatScore(p.score)}
                  </div>
                </div>
                <button
                  className="text-xs py-1 px-2 rounded"
                  style={{
                    background: boardControlId === p.id ? 'rgba(0,200,180,0.2)' : 'rgba(0,200,180,0.08)',
                    border: '1px solid rgba(0,200,180,0.35)',
                    color: '#40e0d0',
                    fontFamily: 'Barlow Condensed',
                    fontWeight: 600,
                  }}
                  title={boardControlId === p.id ? 'This player has board control' : 'Give this player board control'}
                  onClick={() => onAssignBoardControl(p.id)}
                >
                  {boardControlId === p.id ? 'Control' : 'Assign'}
                </button>
                <button className="btn-ghost text-xs py-1 px-2" onClick={() => startEdit(p)}>Edit</button>
                <button
                  className="text-xs py-1 px-2 rounded"
                  style={{ background: 'rgba(192,57,43,0.15)', border: '1px solid rgba(192,57,43,0.3)', color: '#e07070', fontFamily: 'Barlow Condensed', fontWeight: 600 }}
                  onClick={() => onRemovePlayer(p.id)}
                >
                  Remove
                </button>
              </div>
            )
          )}
          {players.length === 0 && (
            <div className="text-sm text-center py-2" style={{ color: '#4a5580' }}>
              Players appear here when they join with a room code.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Toggle({ label, description, value, onChange, disabled }: {
  label: string
  description: string
  value: boolean
  onChange: () => void
  disabled?: boolean
}) {
  return (
    <div
      className="flex items-center gap-3 px-3 py-2 rounded-lg"
      style={{
        background: 'var(--navy)',
        border: '1px solid var(--navy-light)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
      }}
      onClick={disabled ? undefined : onChange}
    >
      <div className="flex-1">
        <div className="font-condensed font-bold text-sm">{label}</div>
        <div className="text-xs" style={{ color: '#4a5580' }}>{description}</div>
      </div>
      <div
        className="w-11 h-6 rounded-full relative transition-colors flex-shrink-0"
        style={{ background: value ? 'var(--gold)' : 'var(--navy-light)' }}
      >
        <div
          className="absolute top-0.5 w-5 h-5 rounded-full transition-transform"
          style={{
            background: 'var(--navy-mid)',
            left: value ? 'calc(100% - 22px)' : '2px',
          }}
        />
      </div>
    </div>
  )
}
