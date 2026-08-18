import { useRef, useState, type AnimationEvent } from 'react'
import { Layers } from 'lucide-react'
import StyledDropdown from './StyledDropdown'

interface GameOption {
  id: string
  name: string
}

interface Props {
  boardIds: string[]
  label: string
  games: GameOption[]
  onConfirm: (gameId: string) => void
  onCreateAndConfirm: (name: string) => void
  onCancel: () => void
}

export default function AddToGameModal({
  boardIds,
  label,
  games,
  onConfirm,
  onCreateAndConfirm,
  onCancel,
}: Props) {
  const [selectedGameId, setSelectedGameId] = useState(games[0]?.id ?? '')
  const [creating, setCreating] = useState(games.length === 0)
  const [newGameName, setNewGameName] = useState('')
  const [exiting, setExiting] = useState(false)
  const pendingCloseAction = useRef<(() => void) | null>(null)

  const canAdd =
    boardIds.length > 0 &&
    (creating ? newGameName.trim().length > 0 : selectedGameId.length > 0)

  function requestClose(afterClose?: () => void) {
    if (exiting) return
    pendingCloseAction.current = afterClose ?? (() => onCancel())
    setExiting(true)
  }

  function handleModalExitAnimationEnd(e: AnimationEvent<HTMLDivElement>) {
    if (!exiting) return
    if (e.target !== e.currentTarget) return
    if (e.animationName !== 'fadeSlideDown') return
    const action = pendingCloseAction.current
    pendingCloseAction.current = null
    action?.()
  }

  function handleAdd() {
    if (!canAdd || exiting) return
    if (creating) {
      const name = newGameName.trim()
      requestClose(() => onCreateAndConfirm(name))
      return
    }
    const gameId = selectedGameId
    requestClose(() => onConfirm(gameId))
  }

  return (
    <div
      className={`add-to-game-modal-overlay${exiting ? ' add-to-game-modal-overlay--exit' : ''}`}
      onClick={() => requestClose()}
      role="presentation"
    >
      <div
        className={`panel flex flex-col gap-4 max-w-sm w-full${exiting ? ' modal-exit' : ' modal-enter'}`}
        onClick={(e) => e.stopPropagation()}
        onAnimationEnd={handleModalExitAnimationEnd}
        role="dialog"
        aria-labelledby="add-to-game-title"
        aria-describedby="add-to-game-label"
      >
        <div
          id="add-to-game-title"
          className="font-display text-2xl text-center"
          style={{ color: 'var(--gold-bright)' }}
        >
          Add to game
        </div>
        <div
          id="add-to-game-label"
          className="font-condensed text-base text-center"
          style={{ color: 'var(--white)' }}
        >
          {label}
        </div>

        {creating ? (
          <div className="flex flex-col gap-2">
            <label className="font-condensed text-sm text-muted" htmlFor="add-to-game-name">
              New game name
            </label>
            <input
              id="add-to-game-name"
              type="text"
              className="w-full board-picker-input"
              value={newGameName}
              onChange={(e) => setNewGameName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAdd()
              }}
              placeholder="Game name"
              autoFocus
            />
            {games.length > 0 && (
              <button
                type="button"
                className="btn-ghost w-full"
                onClick={() => {
                  setCreating(false)
                  setNewGameName('')
                }}
              >
                Choose existing game
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <span className="font-condensed text-sm text-muted" id="add-to-game-select-label">
              Game
            </span>
            <StyledDropdown
              value={selectedGameId}
              onChange={setSelectedGameId}
              placeholder="Select a game"
              ariaLabelledBy="add-to-game-select-label"
              triggerIcon={<Layers size={14} className="flex-shrink-0 opacity-70" />}
              optionIcon={<Layers size={12} className="flex-shrink-0 opacity-70" />}
              options={games.map((g) => ({ value: g.id, label: g.name }))}
            />
            <button
              type="button"
              className="btn-ghost w-full"
              onClick={() => setCreating(true)}
            >
              Create new game
            </button>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <button
            type="button"
            className="w-full btn-gold"
            onClick={handleAdd}
            disabled={!canAdd || exiting}
          >
            Add
          </button>
          <button
            type="button"
            className="btn-ghost w-full"
            onClick={() => requestClose()}
            disabled={exiting}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
