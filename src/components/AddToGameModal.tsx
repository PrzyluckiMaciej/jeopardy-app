import { useCallback, useEffect, useRef, useState, type AnimationEvent } from 'react'
import { Check, ChevronDown, Layers } from 'lucide-react'

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
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [dropdownExiting, setDropdownExiting] = useState(false)
  const [exiting, setExiting] = useState(false)
  const pendingCloseAction = useRef<(() => void) | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const selectedGame = games.find((g) => g.id === selectedGameId)
  const dropdownVisible = dropdownOpen || dropdownExiting
  const dropdownActive = dropdownOpen && !dropdownExiting

  const canAdd =
    boardIds.length > 0 &&
    (creating ? newGameName.trim().length > 0 : selectedGameId.length > 0)

  function openDropdown() {
    setDropdownExiting(false)
    setDropdownOpen(true)
  }

  const closeDropdown = useCallback(() => {
    if (!dropdownOpen || dropdownExiting) return
    setDropdownExiting(true)
  }, [dropdownOpen, dropdownExiting])

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

  function handleMenuAnimationEnd(e: AnimationEvent<HTMLUListElement>) {
    if (!dropdownExiting) return
    if (e.target !== e.currentTarget) return
    if (e.animationName !== 'addToGameDropdownOut') return
    setDropdownOpen(false)
    setDropdownExiting(false)
  }

  useEffect(() => {
    if (!dropdownActive || exiting) return
    function handlePointerDown(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        closeDropdown()
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') closeDropdown()
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [dropdownActive, exiting, closeDropdown])

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
            <div className="add-to-game-dropdown" ref={dropdownRef}>
              <button
                type="button"
                className={`add-to-game-dropdown__trigger${dropdownActive ? ' add-to-game-dropdown__trigger--open' : ''}`}
                aria-haspopup="listbox"
                aria-expanded={dropdownActive}
                aria-labelledby="add-to-game-select-label"
                onClick={() => {
                  if (dropdownActive) closeDropdown()
                  else openDropdown()
                }}
              >
                <span className="add-to-game-dropdown__value">
                  <Layers size={14} className="flex-shrink-0 opacity-70" />
                  <span className="truncate">{selectedGame?.name ?? 'Select a game'}</span>
                </span>
                <ChevronDown
                  size={16}
                  className={`add-to-game-dropdown__chevron${dropdownActive ? ' add-to-game-dropdown__chevron--open' : ''}`}
                />
              </button>
              {dropdownVisible && (
                <ul
                  className={`add-to-game-dropdown__menu${dropdownExiting ? ' add-to-game-dropdown__menu--exit' : ' add-to-game-dropdown__menu--enter'}`}
                  role="listbox"
                  aria-labelledby="add-to-game-select-label"
                  onAnimationEnd={handleMenuAnimationEnd}
                >
                  {games.map((g) => {
                    const selected = g.id === selectedGameId
                    return (
                      <li key={g.id} role="presentation">
                        <button
                          type="button"
                          role="option"
                          aria-selected={selected}
                          className={`add-to-game-dropdown__option${selected ? ' add-to-game-dropdown__option--selected' : ''}`}
                          onClick={() => {
                            setSelectedGameId(g.id)
                            closeDropdown()
                          }}
                        >
                          <span className="add-to-game-dropdown__option-label">
                            <Layers size={12} className="flex-shrink-0 opacity-70" />
                            <span className="truncate">{g.name}</span>
                          </span>
                          {selected && <Check size={14} className="flex-shrink-0 text-gold" />}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
            <button
              type="button"
              className="btn-ghost w-full"
              onClick={() => {
                closeDropdown()
                setCreating(true)
              }}
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
