import { useState } from 'react'
import { Pencil, Trash2, Crown, Check, X, RefreshCw, Eye } from 'lucide-react'
import type { GameSettings, Player, PlayerSyncStatus } from '../types'
import { formatScore } from '../lib/utils'
import SettingsToggle from './SettingsToggle'
import StyledDropdown from './StyledDropdown'

interface Props {
  settings: GameSettings
  players: Player[]
  boardControlId: string | null
  onSettingsChange: (s: GameSettings) => void
  onAssignBoardControl: (playerId: string | null) => void
  onUpdatePlayer: (p: Player) => void
  onRemovePlayer: (id: string) => void
  mediaSyncStatus?: Map<string, PlayerSyncStatus>
}

const sectionTitleStyle = {
  color: 'var(--gold)',
  opacity: 0.8,
  fontSize: '0.8125rem',
  letterSpacing: '0.12em',
} as const

/** Returns a sanitized integer string, or null if the keystroke should be ignored. */
function sanitizeIntegerInput(raw: string, allowNegative: boolean): string | null {
  if (raw === '') return ''
  if (allowNegative && (raw === '-' || raw === '0-' || /^-0+$/.test(raw))) return '-'
  const pattern = allowNegative ? /^-?\d+$/ : /^\d+$/
  if (!pattern.test(raw)) return null
  return String(parseInt(raw, 10))
}

function parseIntegerOrZero(raw: string): number {
  const n = parseInt(raw, 10)
  return Number.isNaN(n) ? 0 : n
}

export default function SettingsPanel({
  settings,
  players,
  boardControlId,
  onSettingsChange,
  onAssignBoardControl,
  onUpdatePlayer,
  onRemovePlayer,
  mediaSyncStatus,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editScore, setEditScore] = useState('')
  const [minWagerText, setMinWagerText] = useState('')
  const [minWagerFocused, setMinWagerFocused] = useState(false)

  const minWagerDisplay = minWagerFocused
    ? minWagerText
    : String(settings.dailyDoubleMinWager)

  function toggle(key: keyof GameSettings) {
    onSettingsChange({ ...settings, [key]: !settings[key] })
  }

  function commitMinWager(raw: string) {
    const n = Math.max(0, parseInt(raw, 10) || 0)
    if (n !== settings.dailyDoubleMinWager) {
      onSettingsChange({ ...settings, dailyDoubleMinWager: n })
    }
  }

  function startEdit(p: Player) {
    setEditingId(p.id)
    setEditName(p.name)
    setEditScore(String(p.score))
  }

  function saveEdit(p: Player) {
    onUpdatePlayer({ ...p, name: editName.trim() || p.name, score: parseIntegerOrZero(editScore) })
    setEditingId(null)
  }

  return (
    <div className="settings-grid">
      {/* Left column: Game Settings */}
      <div className="flex flex-col gap-8">
        {/* Game Settings */}
        <div className="panel">
          <div className="font-condensed font-bold uppercase mb-5" style={sectionTitleStyle}>
            Game settings
          </div>
          <div className="flex flex-col gap-4">
            <SettingsToggle
              label="Point deduction"
              description="Wrong answers deduct the question value"
              value={settings.pointDeduction}
              onChange={() => toggle('pointDeduction')}
            />
            <SettingsToggle
              label="Negative points"
              description="Deductions can reduce a score below zero"
              value={settings.allowNegativeScore}
              onChange={() => toggle('allowNegativeScore')}
              disabled={!settings.pointDeduction}
            />
            <div
              className="settings-toggle"
              style={{ cursor: 'default' }}
            >
              <div className="flex-1 min-w-0">
                <div className="font-condensed font-bold" style={{ fontSize: '1.0625rem', lineHeight: 1.3 }}>
                  Daily Double minimum wager
                </div>
                <div
                  className="leading-relaxed"
                  style={{ color: '#6b7db3', fontSize: '0.9375rem', marginTop: 'var(--space-xs)' }}
                >
                  Lowest amount a player can wager on a Daily Double
                </div>
              </div>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                className="w-20 text-center font-display flex-shrink-0"
                style={{ padding: '8px 4px' }}
                value={minWagerDisplay}
                onFocus={() => {
                  setMinWagerFocused(true)
                  setMinWagerText(String(settings.dailyDoubleMinWager))
                }}
                onChange={(e) => {
                  const next = sanitizeIntegerInput(e.target.value, false)
                  if (next === null) return
                  setMinWagerText(next)
                }}
                onBlur={() => {
                  commitMinWager(minWagerText)
                  setMinWagerFocused(false)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.currentTarget.blur()
                  }
                }}
                onClick={(e) => e.stopPropagation()}
              />
            </div>
            <SettingsToggle
              label="Auto buzz queue on clue"
              description="Players can buzz immediately after the clue is revealed"
              value={settings.autoBuzzQueue}
              onChange={() => toggle('autoBuzzQueue')}
            />
            <SettingsToggle
              label="Auto buzz queue on media"
              description="Players can buzz immediately after the media is revealed"
              value={settings.autoBuzzQueueOnMedia}
              onChange={() => toggle('autoBuzzQueueOnMedia')}
            />
            <SettingsToggle
              label="Blur clue on buzz"
              description="Blurs the clue when any player buzzes in"
              value={settings.blurClueOnBuzz}
              onChange={() => toggle('blurClueOnBuzz')}
            />
            <SettingsToggle
              label="Pause media on buzz"
              description="Pauses audio or video when the first player buzzes in"
              value={settings.pauseMediaOnBuzz}
              onChange={() => toggle('pauseMediaOnBuzz')}
            />
            <SettingsToggle
              label="Auto-reveal clue"
              description="Show the clue text to players as soon as a question opens"
              value={settings.autoRevealClue}
              onChange={() => toggle('autoRevealClue')}
            />
            <SettingsToggle
              label="Auto-reveal media"
              description="Show attached media to players as soon as a question opens"
              value={settings.autoRevealMedia}
              onChange={() => toggle('autoRevealMedia')}
            />
            <SettingsToggle
              label="Auto-start Final Jeopardy timer"
              description="Start the answering timer when the clue or media is revealed. When off, use the Start timer button instead"
              value={settings.autoStartFinalTimer}
              onChange={() => toggle('autoStartFinalTimer')}
            />
          </div>
        </div>
      </div>

      {/* Right column: Board Control + Players */}
      <div className="flex flex-col gap-4">
        {/* Board Control */}
        <div className="panel">
          <div className="font-condensed font-bold uppercase mb-4" style={sectionTitleStyle}>
            Board control
          </div>
          <p className="mb-4 leading-relaxed" style={{ color: '#6b7db3', fontSize: '0.9375rem' }}>
            The selected player picks the next clue (required for Daily Doubles).
          </p>
          <StyledDropdown
            value={boardControlId ?? ''}
            onChange={(v) => onAssignBoardControl(v || null)}
            placeholder="None"
            disabled={players.length === 0}
            triggerIcon={<Crown size={14} className="flex-shrink-0 opacity-70" />}
            optionIcon={<Crown size={12} className="flex-shrink-0 opacity-70" />}
            options={[
              { value: '', label: 'None' },
              ...players
                .filter((p) => !p.isSpectator)
                .map((p) => ({
                  value: p.id,
                  label: `${p.name}${!p.isConnected ? ' (offline)' : ''}`,
                })),
            ]}
          />
        </div>

        {/* Players */}
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
                  onChange={(e) => {
                    const next = sanitizeIntegerInput(e.target.value, true)
                    if (next === null) return
                    setEditScore(next)
                  }}
                  placeholder="Score"
                  type="text"
                  inputMode="numeric"
                  pattern="-?[0-9]*"
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
                    className="font-condensed font-bold truncate min-w-0 flex items-center gap-2"
                    style={{ fontSize: '1.0625rem' }}
                  >
                    <span className="truncate">{p.name}</span>
                    {p.isSpectator && (
                      <span
                        className="inline-flex items-center gap-1 flex-shrink-0 font-condensed"
                        style={{ color: '#8899cc', fontSize: '0.75rem' }}
                        title="Spectator"
                      >
                        <Eye size={12} aria-hidden />
                        <span>Spectator</span>
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2" style={{ marginTop: 2 }}>
                    {!p.isSpectator && (
                      <span style={{ color: p.score < 0 ? '#e07070' : 'var(--gold)', fontSize: '0.9375rem' }}>
                        {formatScore(p.score)}
                      </span>
                    )}
                    {(() => {
                      const sync = mediaSyncStatus?.get(p.id)
                      if (!sync || sync.total === 0) return null
                      if (sync.synced >= sync.total) {
                        return (
                          <span
                            className="inline-flex items-center gap-1"
                            style={{ color: 'var(--green)', fontSize: '0.75rem' }}
                            title={`${sync.synced} of ${sync.total} media files synced`}
                          >
                            <Check size={12} aria-hidden />
                            <span className="font-condensed">synced {sync.synced}/{sync.total}</span>
                          </span>
                        )
                      }
                      return (
                        <span
                          className="inline-flex items-center gap-1"
                          style={{ color: '#6b7db3', fontSize: '0.75rem' }}
                          title={`${sync.synced} of ${sync.total} media files synced`}
                        >
                          <RefreshCw size={11} className="animate-spin" style={{ animationDuration: '2s' }} aria-hidden />
                          <span className="font-condensed">{sync.synced}/{sync.total}</span>
                        </span>
                      )
                    })()}
                  </div>
                </div>
                <button
                  type="button"
                  className={`btn-icon-only rounded settings-board-control-btn${boardControlId === p.id ? ' settings-board-control-btn--active' : ''}`}
                  aria-pressed={boardControlId === p.id}
                  disabled={p.isSpectator}
                  title={
                    p.isSpectator
                      ? 'Spectators cannot hold board control'
                      : boardControlId === p.id
                        ? 'Remove board control from this player'
                        : 'Give this player board control'
                  }
                  aria-label={
                    p.isSpectator
                      ? 'Spectators cannot hold board control'
                      : boardControlId === p.id
                        ? 'Remove board control'
                        : 'Assign board control'
                  }
                  onClick={() =>
                    onAssignBoardControl(boardControlId === p.id ? null : p.id)
                  }
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
    </div>
  )
}
