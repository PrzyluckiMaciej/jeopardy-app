import { useState } from 'react'
import { Pencil, Trash2, Crown, Check, X } from 'lucide-react'
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

const sectionTitleStyle = {
  color: 'var(--gold)',
  opacity: 0.8,
  fontSize: '0.8125rem',
  letterSpacing: '0.12em',
} as const

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
    <div className="settings-grid">
      {/* Left column: Game Settings + Board Control */}
      <div className="flex flex-col gap-8">
        {/* Game Settings */}
        <div className="panel">
          <div className="font-condensed font-bold uppercase mb-5" style={sectionTitleStyle}>
            Game settings
          </div>
          <div className="flex flex-col gap-4">
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

        {/* Board Control */}
        <div className="panel">
          <div className="font-condensed font-bold uppercase mb-4" style={sectionTitleStyle}>
            Board control
          </div>
          <p className="mb-4 leading-relaxed" style={{ color: '#6b7db3', fontSize: '0.9375rem' }}>
            The selected player picks the next clue (required for Daily Doubles).
          </p>
          <select
            className="w-full"
            style={{ fontSize: '1rem', padding: '12px 14px' }}
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

      {/* Right column: Players */}
      <div className="panel flex flex-col gap-5">
        <div className="font-condensed font-bold uppercase" style={sectionTitleStyle}>
          Players
        </div>
        <div className="flex flex-col gap-3">
          {players.map((p) =>
            editingId === p.id ? (
              <div
                key={p.id}
                className="flex flex-col gap-3 rounded-lg"
                style={{
                  background: 'var(--navy)',
                  border: '1px solid var(--navy-light)',
                  padding: 'var(--space-md) var(--space-lg)',
                }}
              >
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Name"
                  className="w-full"
                  style={{ fontSize: '1rem' }}
                  autoFocus
                />
                <input
                  value={editScore}
                  onChange={(e) => setEditScore(e.target.value)}
                  placeholder="Score"
                  type="number"
                  className="w-full"
                  style={{ fontSize: '1rem' }}
                />
                <div className="flex gap-3">
                  <button
                    className="btn-gold flex-1 btn-with-icon justify-center"
                    style={{ fontSize: '0.9375rem', padding: '10px 16px' }}
                    onClick={() => saveEdit(p)}
                  >
                    <Check size={16} aria-hidden />
                    <span>Save</span>
                  </button>
                  <button
                    className="btn-ghost flex-1 btn-with-icon justify-center"
                    style={{ fontSize: '0.9375rem', padding: '10px 16px' }}
                    onClick={() => setEditingId(null)}
                  >
                    <X size={16} aria-hidden />
                    <span>Cancel</span>
                  </button>
                </div>
              </div>
            ) : (
              <div
                key={p.id}
                className="flex items-center gap-3 rounded-lg"
                style={{
                  background: 'var(--navy)',
                  border: '1px solid var(--navy-light)',
                  opacity: p.isConnected ? 1 : 0.7,
                  padding: 'var(--space-md) var(--space-lg)',
                }}
              >
                <div
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ background: p.isConnected ? 'var(--green)' : '#4a5580' }}
                  title={p.isConnected ? 'Connected' : 'Not connected'}
                />
                <div className="flex-1 min-w-0">
                  <div
                    className="font-condensed font-bold flex items-center min-w-0"
                    style={{ fontSize: '1.0625rem', gap: '0.5rem' }}
                  >
                    <span className="truncate min-w-0">{p.name}</span>
                    {boardControlId === p.id && (
                      <span
                        className="inline-flex flex-shrink-0 items-center justify-center rounded"
                        title="Board control"
                        aria-label="Board control"
                        style={{
                          background: 'rgba(0,200,180,0.2)',
                          color: '#40e0d0',
                          border: '1px solid rgba(0,200,180,0.45)',
                          padding: '2px 5px',
                        }}
                      >
                        <Crown size={12} aria-hidden />
                      </span>
                    )}
                  </div>
                  <div style={{ color: p.score < 0 ? '#e07070' : 'var(--gold)', fontSize: '0.9375rem', marginTop: 2 }}>
                    {formatScore(p.score)}
                  </div>
                </div>
                <button
                  className="btn-icon-only rounded"
                  style={{
                    background: boardControlId === p.id ? 'rgba(0,200,180,0.2)' : 'rgba(0,200,180,0.08)',
                    border: '1px solid rgba(0,200,180,0.35)',
                    color: '#40e0d0',
                  }}
                  title={boardControlId === p.id ? 'This player has board control' : 'Give this player board control'}
                  aria-label={boardControlId === p.id ? 'Has board control' : 'Assign board control'}
                  onClick={() => onAssignBoardControl(p.id)}
                >
                  <Crown size={16} aria-hidden />
                </button>
                <button
                  className="btn-ghost btn-icon-only"
                  title="Edit player name and score"
                  aria-label="Edit player"
                  onClick={() => startEdit(p)}
                >
                  <Pencil size={16} aria-hidden />
                </button>
                <button
                  className="btn-icon-only rounded"
                  style={{
                    background: 'rgba(192,57,43,0.15)',
                    border: '1px solid rgba(192,57,43,0.3)',
                    color: '#e07070',
                  }}
                  title="Remove player from game"
                  aria-label="Remove player"
                  onClick={() => onRemovePlayer(p.id)}
                >
                  <Trash2 size={16} aria-hidden />
                </button>
              </div>
            )
          )}
          {players.length === 0 && (
            <div className="text-center py-6 leading-relaxed" style={{ color: '#6b7db3', fontSize: '0.9375rem' }}>
              Players appear here when they join with a room code.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Toggle({
  label,
  description,
  value,
  onChange,
  disabled,
}: {
  label: string
  description: string
  value: boolean
  onChange: () => void
  disabled?: boolean
}) {
  return (
    <div
      role="switch"
      aria-checked={value}
      className={`settings-toggle${disabled ? ' settings-toggle--disabled' : ''}`}
      onClick={disabled ? undefined : onChange}
    >
      <div className="flex-1 min-w-0">
        <div className="font-condensed font-bold" style={{ fontSize: '1.0625rem', lineHeight: 1.3 }}>
          {label}
        </div>
        <div
          className="leading-relaxed"
          style={{ color: '#6b7db3', fontSize: '0.9375rem', marginTop: 'var(--space-xs)' }}
        >
          {description}
        </div>
      </div>
      <div
        className="rounded-full relative transition-colors flex-shrink-0"
        style={{
          background: value ? 'var(--gold)' : 'var(--navy-light)',
          width: 48,
          height: 26,
        }}
      >
        <div
          className="absolute rounded-full transition-transform"
          style={{
            background: 'var(--navy-mid)',
            width: 22,
            height: 22,
            top: 2,
            left: value ? 'calc(100% - 24px)' : 2,
          }}
        />
      </div>
    </div>
  )
}
