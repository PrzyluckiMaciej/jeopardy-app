import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent } from 'react'
import { ArrowLeft, Check, ChevronDown, ChevronUp, Folder, Layers } from 'lucide-react'
import type { Game, GameFolder } from '../types'
import { buildPathString, isFolderInside, resolveFolderOrItemPath } from '../lib/folderPath'
import { formatBoardTimestamp } from '../lib/utils'
import {
  isGameFolderTrashed,
  isGameTrashed,
  useBoardStore,
} from '../store/gameStore'
import ContextMenu, { type ContextMenuItem } from './ContextMenu'

const DND_MIME = 'application/x-jeopardy-games-picker'

type DragPayload =
  | { type: 'game'; id: string }
  | { type: 'folder'; id: string }

type SortKey = 'name' | 'createdAt' | 'updatedAt'
type SortDir = 'asc' | 'desc'

interface RenameDraft {
  id: string
  value: string
}

interface Props {
  games: Game[]
  folders: GameFolder[]
  onSelectGame: (game: Game) => void
  onDeleteGame: (game: Game) => void
  onDuplicateFolder: (folder: GameFolder) => void
  onRequestDeleteFolder: (folder: GameFolder) => void
  /** When set, start inline rename for this folder id (e.g. after create). */
  renameFolderId?: string | null
  onRenameFolderIdChange?: (id: string | null) => void
  /** When set, start inline rename for this game id (e.g. after create). */
  renameGameId?: string | null
  onRenameGameIdChange?: (id: string | null) => void
  /** Folder to show when the explorer mounts / when this value changes. */
  initialFolderId?: string | null
}

function parseDragPayload(e: DragEvent): DragPayload | null {
  try {
    const raw = e.dataTransfer.getData(DND_MIME) || e.dataTransfer.getData('text/plain')
    if (!raw) return null
    const data = JSON.parse(raw) as DragPayload
    if (data?.type === 'game' || data?.type === 'folder') return data
  } catch {
    /* ignore */
  }
  return null
}

function compareOptionalTime(a: number | null | undefined, b: number | null | undefined, dir: SortDir): number {
  const aMissing = a == null || !Number.isFinite(a)
  const bMissing = b == null || !Number.isFinite(b)
  if (aMissing && bMissing) return 0
  if (aMissing) return 1
  if (bMissing) return -1
  const cmp = a - b
  return dir === 'asc' ? cmp : -cmp
}

function compareBySortKey(
  a: { name: string; createdAt?: number; updatedAt?: number },
  b: { name: string; createdAt?: number; updatedAt?: number },
  key: SortKey,
  dir: SortDir,
): number {
  if (key === 'name') {
    const cmp = a.name.localeCompare(b.name)
    return dir === 'asc' ? cmp : -cmp
  }
  const cmp = compareOptionalTime(a[key], b[key], dir)
  if (cmp !== 0) return cmp
  return a.name.localeCompare(b.name)
}

export default function GamesPickerExplorer({
  games,
  folders,
  onSelectGame,
  onDeleteGame,
  onDuplicateFolder,
  onRequestDeleteFolder,
  renameFolderId: controlledRenameFolderId,
  onRenameFolderIdChange,
  renameGameId: controlledRenameGameId,
  onRenameGameIdChange,
  initialFolderId = null,
}: Props) {
  const moveGameToFolder = useBoardStore((s) => s.moveGameToFolder)
  const moveGameFolder = useBoardStore((s) => s.moveGameFolder)
  const renameGameFolder = useBoardStore((s) => s.renameGameFolder)
  const createGameFolder = useBoardStore((s) => s.createGameFolder)
  const createGame = useBoardStore((s) => s.createGame)
  const renameGame = useBoardStore((s) => s.renameGame)

  const [userFolderId, setUserFolderId] = useState<string | null>(initialFolderId)
  const [pathEditing, setPathEditing] = useState(false)
  const [pathDraft, setPathDraft] = useState('/')
  const [dragOverTarget, setDragOverTarget] = useState<string | null>(null)
  const [activeDrag, setActiveDrag] = useState<DragPayload | null>(null)
  const [internalRenameFolderId, setInternalRenameFolderId] = useState<string | null>(null)
  const [internalRenameGameId, setInternalRenameGameId] = useState<string | null>(null)
  const [folderRenameDraft, setFolderRenameDraft] = useState<RenameDraft | null>(null)
  const [gameRenameDraft, setGameRenameDraft] = useState<RenameDraft | null>(null)
  const [menu, setMenu] = useState<{
    x: number
    y: number
    items: ContextMenuItem[]
  } | null>(null)
  const [prevRenameNavKey, setPrevRenameNavKey] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('createdAt')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const dragGhostRef = useRef<HTMLElement | null>(null)
  const prevInitialFolderId = useRef(initialFolderId)

  useEffect(() => {
    if (prevInitialFolderId.current !== initialFolderId) {
      prevInitialFolderId.current = initialFolderId
      setUserFolderId(initialFolderId)
    }
  }, [initialFolderId])

  const scopedFolders = useMemo(
    () => folders.filter((f) => !isGameFolderTrashed(f)),
    [folders],
  )
  const scopedGames = useMemo(
    () => games.filter((g) => !isGameTrashed(g)),
    [games],
  )

  const editingFolderId =
    controlledRenameFolderId !== undefined ? controlledRenameFolderId : internalRenameFolderId
  const editingGameId =
    controlledRenameGameId !== undefined ? controlledRenameGameId : internalRenameGameId

  const folderRenameValue =
    folderRenameDraft?.id === editingFolderId
      ? folderRenameDraft.value
      : (scopedFolders.find((f) => f.id === editingFolderId)?.name ?? '')

  const gameRenameValue =
    gameRenameDraft?.id === editingGameId
      ? gameRenameDraft.value
      : (scopedGames.find((g) => g.id === editingGameId)?.name ?? '')

  const folderRenameConflict = useMemo(() => {
    if (!editingFolderId) return false
    const name = folderRenameValue.trim()
    if (!name) return false
    const folder = scopedFolders.find((f) => f.id === editingFolderId)
    if (!folder) return false
    if (folder.name.trim().toLowerCase() === name.toLowerCase()) return false
    return scopedFolders.some(
      (f) =>
        f.id !== editingFolderId &&
        f.parentId === folder.parentId &&
        f.name.trim().toLowerCase() === name.toLowerCase(),
    )
  }, [editingFolderId, folderRenameValue, scopedFolders])

  if (userFolderId !== null && !scopedFolders.some((f) => f.id === userFolderId)) {
    setUserFolderId(null)
  }

  const renameNavKey = editingGameId ?? editingFolderId ?? null
  if (renameNavKey !== prevRenameNavKey) {
    setPrevRenameNavKey(renameNavKey)
    if (editingGameId) {
      const game = scopedGames.find((g) => g.id === editingGameId)
      if (game) setUserFolderId(game.folderId ?? null)
    } else if (editingFolderId) {
      const folder = scopedFolders.find((f) => f.id === editingFolderId)
      if (folder) setUserFolderId(folder.parentId)
    }
  }

  const currentFolderId =
    userFolderId !== null && !scopedFolders.some((f) => f.id === userFolderId)
      ? null
      : userFolderId

  const currentPath = useMemo(
    () => buildPathString(scopedFolders, currentFolderId),
    [scopedFolders, currentFolderId],
  )
  const pathValue = pathEditing ? pathDraft : currentPath

  const setEditingFolderId = useCallback(
    (id: string | null, name?: string) => {
      if (onRenameGameIdChange) onRenameGameIdChange(null)
      else setInternalRenameGameId(null)
      setGameRenameDraft(null)
      if (onRenameFolderIdChange) {
        onRenameFolderIdChange(id)
      } else {
        setInternalRenameFolderId(id)
      }
      if (id && name !== undefined) setFolderRenameDraft({ id, value: name })
      else setFolderRenameDraft(null)
    },
    [onRenameFolderIdChange, onRenameGameIdChange],
  )

  const setEditingGameId = useCallback(
    (id: string | null, name?: string) => {
      if (onRenameFolderIdChange) onRenameFolderIdChange(null)
      else setInternalRenameFolderId(null)
      setFolderRenameDraft(null)
      if (onRenameGameIdChange) {
        onRenameGameIdChange(id)
      } else {
        setInternalRenameGameId(id)
      }
      if (id && name !== undefined) setGameRenameDraft({ id, value: name })
      else setGameRenameDraft(null)
    },
    [onRenameGameIdChange, onRenameFolderIdChange],
  )

  const visibleEntries = useMemo(() => {
    type Entry =
      | { kind: 'folder'; item: GameFolder }
      | { kind: 'game'; item: Game }
    const folderEntries: Entry[] = scopedFolders
      .filter((f) => f.parentId === currentFolderId)
      .map((item) => ({ kind: 'folder', item }))
    const gameEntries: Entry[] = scopedGames
      .filter((g) => (g.folderId ?? null) === currentFolderId)
      .map((item) => ({ kind: 'game', item }))
    return [...folderEntries, ...gameEntries].sort((a, b) =>
      compareBySortKey(a.item, b.item, sortKey, sortDir),
    )
  }, [scopedFolders, scopedGames, currentFolderId, sortKey, sortDir])

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  function renderSortHeader(key: SortKey, label: string, className: string) {
    const active = sortKey === key
    const Icon = sortDir === 'asc' ? ChevronUp : ChevronDown
    return (
      <button
        type="button"
        className={`${className}${active ? ' board-picker-explorer-header__sort--active' : ''}`}
        onClick={() => toggleSort(key)}
        aria-label={`Sort by ${label}${active ? `, currently ${sortDir === 'asc' ? 'ascending' : 'descending'}` : ''}`}
      >
        <span>{label}</span>
        {active && <Icon size={12} className="board-picker-explorer-header__sort-icon" aria-hidden />}
      </button>
    )
  }

  const parentFolderId = useMemo(() => {
    if (!currentFolderId) return null
    return scopedFolders.find((f) => f.id === currentFolderId)?.parentId ?? null
  }, [scopedFolders, currentFolderId])

  function navigateTo(folderId: string | null) {
    setUserFolderId(folderId)
    setPathEditing(false)
  }

  function goBack() {
    if (currentFolderId === null) return
    navigateTo(parentFolderId)
  }

  function commitPath() {
    const resolved = resolveFolderOrItemPath(scopedFolders, scopedGames, pathValue.trim())
    if (resolved === undefined) {
      setPathDraft(currentPath)
      return
    }
    setPathEditing(false)
    if (resolved.kind === 'folder') {
      setUserFolderId(resolved.id)
      return
    }
    const game = scopedGames.find((g) => g.id === resolved.id)
    if (game) onSelectGame(game)
  }

  function closeMenu() {
    setMenu(null)
  }

  function openEmptyMenu(e: MouseEvent) {
    const target = e.target as HTMLElement
    if (target.closest('.board-picker-board-row, .board-picker-folder-row')) return
    e.preventDefault()
    e.stopPropagation()
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        {
          id: 'new-game',
          label: 'New Game',
          onSelect: () => {
            const id = createGame('New Game', currentFolderId)
            const createdName =
              useBoardStore.getState().games.find((g) => g.id === id)?.name ?? 'New Game'
            setEditingGameId(id, createdName)
          },
        },
        {
          id: 'new-folder',
          label: 'New Folder',
          onSelect: () => {
            const id = createGameFolder('New Folder', currentFolderId)
            const createdName =
              useBoardStore.getState().gameFolders.find((f) => f.id === id)?.name ?? 'New Folder'
            setEditingFolderId(id, createdName)
          },
        },
      ],
    })
  }

  function openFolderMenu(e: MouseEvent, folder: GameFolder) {
    e.preventDefault()
    e.stopPropagation()
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        {
          id: 'new-game',
          label: 'New Game',
          onSelect: () => {
            navigateTo(folder.id)
            const id = createGame('New Game', folder.id)
            const createdName =
              useBoardStore.getState().games.find((g) => g.id === id)?.name ?? 'New Game'
            setEditingGameId(id, createdName)
          },
        },
        {
          id: 'rename',
          label: 'Rename',
          onSelect: () => setEditingFolderId(folder.id, folder.name),
        },
        {
          id: 'duplicate',
          label: 'Duplicate',
          onSelect: () => onDuplicateFolder(folder),
        },
        {
          id: 'delete',
          label: 'Delete',
          danger: true,
          onSelect: () => onRequestDeleteFolder(folder),
        },
      ],
    })
  }

  function openGameMenu(e: MouseEvent, game: Game) {
    e.preventDefault()
    e.stopPropagation()
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        {
          id: 'rename',
          label: 'Rename',
          onSelect: () => setEditingGameId(game.id, game.name),
        },
        {
          id: 'delete',
          label: 'Delete',
          danger: true,
          onSelect: () => onDeleteGame(game),
        },
      ],
    })
  }

  function commitRename(folderId: string) {
    const name = folderRenameValue.trim()
    if (!name) {
      setEditingFolderId(null)
      return
    }
    if (renameGameFolder(folderId, name)) {
      setEditingFolderId(null)
    }
  }

  function commitGameRename(gameId: string) {
    const name = gameRenameValue.trim()
    const game = scopedGames.find((g) => g.id === gameId)
    if (game && name && name !== game.name) {
      renameGame(gameId, name)
    }
    setEditingGameId(null)
  }

  function renderDateColumns(createdAt?: number, updatedAt?: number) {
    return (
      <>
        <span className="board-picker-explorer-row__date">{formatBoardTimestamp(createdAt)}</span>
        <span className="board-picker-explorer-row__date">{formatBoardTimestamp(updatedAt)}</span>
      </>
    )
  }

  function clearDragGhost() {
    dragGhostRef.current?.remove()
    dragGhostRef.current = null
  }

  function setDragData(e: DragEvent, payload: DragPayload, dragImageEl?: HTMLElement | null) {
    const json = JSON.stringify(payload)
    e.dataTransfer.setData(DND_MIME, json)
    e.dataTransfer.setData('text/plain', json)
    e.dataTransfer.effectAllowed = 'move'
    clearDragGhost()
    if (dragImageEl) {
      const contentEl =
        dragImageEl.querySelector('.board-picker-board-btn, .board-picker-folder-row__btn') ??
        dragImageEl
      const source = contentEl instanceof HTMLElement ? contentEl : dragImageEl
      const ghost = document.createElement('div')
      ghost.className = 'board-picker-drag-ghost'
      ghost.appendChild(source.cloneNode(true))
      document.body.appendChild(ghost)
      dragGhostRef.current = ghost
      const rect = source.getBoundingClientRect()
      e.dataTransfer.setDragImage(
        ghost,
        Math.min(Math.max(e.clientX - rect.left, 0), rect.width),
        Math.min(Math.max(e.clientY - rect.top, 0), rect.height),
      )
    }
    setActiveDrag(payload)
  }

  function clearDrag() {
    clearDragGhost()
    setActiveDrag(null)
    setDragOverTarget(null)
  }

  function canDropOnFolder(payload: DragPayload | null, targetFolderId: string): boolean {
    if (!payload) return false
    if (payload.type === 'game') return true
    if (payload.id === targetFolderId) return false
    if (isFolderInside(scopedFolders, targetFolderId, payload.id)) return false
    return true
  }

  function canDropOnParent(payload: DragPayload | null): boolean {
    if (!payload || currentFolderId === null) return false
    if (parentFolderId === null) return true
    return canDropOnFolder(payload, parentFolderId)
  }

  function handleDropOnFolder(e: DragEvent, targetFolderId: string) {
    e.preventDefault()
    e.stopPropagation()
    const payload = activeDrag ?? parseDragPayload(e)
    clearDrag()
    if (!payload || !canDropOnFolder(payload, targetFolderId)) return
    if (payload.type === 'game') {
      moveGameToFolder(payload.id, targetFolderId)
    } else {
      moveGameFolder(payload.id, targetFolderId)
    }
  }

  function handleDropOnParent(e: DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    const payload = activeDrag ?? parseDragPayload(e)
    clearDrag()
    if (!payload || !canDropOnParent(payload)) return
    if (payload.type === 'game') {
      moveGameToFolder(payload.id, parentFolderId)
    } else {
      moveGameFolder(payload.id, parentFolderId)
    }
  }

  function handleDropOnCurrent(e: DragEvent) {
    e.preventDefault()
    const payload = activeDrag ?? parseDragPayload(e)
    clearDrag()
    if (!payload) return
    if (payload.type === 'game') {
      moveGameToFolder(payload.id, currentFolderId)
    } else {
      if (currentFolderId && payload.id === currentFolderId) return
      if (currentFolderId && isFolderInside(scopedFolders, currentFolderId, payload.id)) return
      moveGameFolder(payload.id, currentFolderId)
    }
  }

  function renderGameRow(game: Game) {
    const isEditing = editingGameId === game.id

    return (
      <div
        key={game.id}
        className="board-picker-board-row board-picker-explorer-row"
        draggable={!isEditing}
        onDragStart={(e) => {
          const nameEl = e.currentTarget.querySelector('.board-picker-explorer-row__name')
          setDragData(
            e,
            { type: 'game', id: game.id },
            nameEl instanceof HTMLElement ? nameEl : null,
          )
        }}
        onDragEnd={clearDrag}
        onDragOver={(e) => {
          e.stopPropagation()
        }}
        onDrop={(e) => {
          e.preventDefault()
          e.stopPropagation()
          clearDrag()
        }}
        onContextMenu={(e) => {
          if (isEditing) return
          openGameMenu(e, game)
        }}
      >
        <div className="board-picker-explorer-row__name">
          {isEditing ? (
            <div className="flex items-center gap-1 flex-1 min-w-0">
              <Layers size={14} className="flex-shrink-0 opacity-70" />
              <input
                className="board-picker-input"
                value={gameRenameValue}
                onChange={(e) => {
                  if (editingGameId) {
                    setGameRenameDraft({ id: editingGameId, value: e.target.value })
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitGameRename(game.id)
                  if (e.key === 'Escape') setEditingGameId(null)
                }}
                onBlur={() => commitGameRename(game.id)}
                autoFocus
                onFocus={(e) => e.target.select()}
                onClick={(e) => e.stopPropagation()}
              />
              <button
                type="button"
                className="board-picker-save-btn"
                onClick={() => commitGameRename(game.id)}
                title="Save"
              >
                <Check size={14} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="board-picker-board-btn"
              onClick={() => onSelectGame(game)}
            >
              <Layers size={14} className="flex-shrink-0 opacity-70" />
              <span className="font-condensed font-bold truncate">{game.name}</span>
            </button>
          )}
        </div>
        {renderDateColumns(game.createdAt, game.updatedAt)}
      </div>
    )
  }

  function renderFolderRow(folder: GameFolder) {
    const isEditing = editingFolderId === folder.id
    const dropKey = `folder:${folder.id}`
    const isDragOver = dragOverTarget === dropKey

    return (
      <div
        key={folder.id}
        className={`board-picker-folder-row board-picker-explorer-row${isDragOver ? ' board-picker-folder-row--drag-over' : ''}`}
        draggable={!isEditing}
        onDragStart={(e) => {
          const nameEl = e.currentTarget.querySelector('.board-picker-explorer-row__name')
          setDragData(
            e,
            { type: 'folder', id: folder.id },
            nameEl instanceof HTMLElement ? nameEl : null,
          )
        }}
        onDragEnd={clearDrag}
        onDragOver={(e) => {
          e.preventDefault()
          e.stopPropagation()
          if (canDropOnFolder(activeDrag, folder.id)) {
            e.dataTransfer.dropEffect = 'move'
            setDragOverTarget(dropKey)
          } else {
            e.dataTransfer.dropEffect = 'none'
          }
        }}
        onDragLeave={() => {
          setDragOverTarget((cur) => (cur === dropKey ? null : cur))
        }}
        onDrop={(e) => handleDropOnFolder(e, folder.id)}
        onContextMenu={(e) => openFolderMenu(e, folder)}
      >
        <div className="board-picker-explorer-row__name">
          {isEditing ? (
            <div className="board-picker-rename flex-1 min-w-0">
              <div className="flex items-center gap-1 min-w-0">
                <Folder size={14} className="flex-shrink-0 opacity-70" />
                <input
                  className={`board-picker-input${folderRenameConflict ? ' board-picker-input--error' : ''}`}
                  value={folderRenameValue}
                  onChange={(e) => {
                    if (editingFolderId) {
                      setFolderRenameDraft({ id: editingFolderId, value: e.target.value })
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename(folder.id)
                    if (e.key === 'Escape') setEditingFolderId(null)
                  }}
                  onBlur={() => commitRename(folder.id)}
                  autoFocus
                  onFocus={(e) => e.target.select()}
                  onClick={(e) => e.stopPropagation()}
                  aria-invalid={folderRenameConflict}
                  aria-describedby={folderRenameConflict ? `game-folder-rename-error-${folder.id}` : undefined}
                />
                <button
                  type="button"
                  className="board-picker-save-btn"
                  onClick={() => commitRename(folder.id)}
                  title="Save"
                  disabled={folderRenameConflict}
                >
                  <Check size={14} />
                </button>
              </div>
              {folderRenameConflict && (
                <div
                  id={`game-folder-rename-error-${folder.id}`}
                  className="board-picker-rename-error"
                  role="alert"
                >
                  Name already taken in this folder
                </div>
              )}
            </div>
          ) : (
            <button
              type="button"
              className="board-picker-folder-row__btn"
              onClick={() => navigateTo(folder.id)}
            >
              <Folder size={14} className="flex-shrink-0 opacity-70" />
              <span className="truncate">{folder.name}</span>
            </button>
          )}
        </div>
        {renderDateColumns(folder.createdAt, folder.updatedAt)}
      </div>
    )
  }

  const isEmpty = visibleEntries.length === 0
  const currentDragOver = dragOverTarget === 'current'
  const parentDragOver = dragOverTarget === 'parent'
  const atRoot = currentFolderId === null

  return (
    <>
      <div className="board-picker-path-bar">
        <button
          type="button"
          className={`board-picker-path-back${parentDragOver ? ' board-picker-path-back--drag-over' : ''}`}
          onClick={goBack}
          disabled={atRoot}
          aria-label="Go to parent folder"
          title={activeDrag ? undefined : 'Back'}
          data-tooltip={
            !atRoot && activeDrag
              ? 'This item will be placed in the parent folder'
              : undefined
          }
          onDragEnter={(e) => {
            if (atRoot || !canDropOnParent(activeDrag)) return
            e.preventDefault()
            e.stopPropagation()
            setDragOverTarget('parent')
          }}
          onDragOver={(e) => {
            if (atRoot) return
            e.preventDefault()
            e.stopPropagation()
            if (canDropOnParent(activeDrag)) {
              e.dataTransfer.dropEffect = 'move'
              if (dragOverTarget !== 'parent') setDragOverTarget('parent')
            } else {
              e.dataTransfer.dropEffect = 'none'
            }
          }}
          onDragLeave={(e) => {
            const related = e.relatedTarget as Node | null
            if (related && e.currentTarget.contains(related)) return
            setDragOverTarget((cur) => (cur === 'parent' ? null : cur))
          }}
          onDrop={handleDropOnParent}
        >
          <ArrowLeft size={16} aria-hidden />
        </button>
        <input
          className="board-picker-path-input"
          value={pathValue}
          onFocus={() => {
            setPathDraft(currentPath)
            setPathEditing(true)
          }}
          onChange={(e) => setPathDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commitPath()
              ;(e.target as HTMLInputElement).blur()
            }
            if (e.key === 'Escape') {
              e.preventDefault()
              setPathDraft(currentPath)
              setPathEditing(false)
              ;(e.target as HTMLInputElement).blur()
            }
          }}
          onBlur={() => {
            setPathEditing(false)
            setPathDraft(currentPath)
          }}
          aria-label="Folder path"
          spellCheck={false}
        />
      </div>
      <div
        className={`board-picker-boards__scroll board-picker-explorer${currentDragOver ? ' board-picker-explorer--drag-over' : ''}`}
        onContextMenu={openEmptyMenu}
        onDragOver={(e) => {
          e.preventDefault()
          e.dataTransfer.dropEffect = 'move'
          setDragOverTarget('current')
        }}
        onDragLeave={(e) => {
          if (e.currentTarget === e.target) {
            setDragOverTarget((cur) => (cur === 'current' ? null : cur))
          }
        }}
        onDrop={handleDropOnCurrent}
      >
        {!isEmpty && (
          <div className="board-picker-explorer-header">
            {renderSortHeader('name', 'Name', 'board-picker-explorer-header__name')}
            {renderSortHeader('createdAt', 'Created at', 'board-picker-explorer-header__date')}
            {renderSortHeader('updatedAt', 'Last modified at', 'board-picker-explorer-header__date')}
          </div>
        )}
        {visibleEntries.map((entry) =>
          entry.kind === 'folder' ? renderFolderRow(entry.item) : renderGameRow(entry.item),
        )}
        {isEmpty && (
          <div className="board-picker-empty">
            No saved games
          </div>
        )}
      </div>
      {menu && (
        <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={closeMenu} />
      )}
    </>
  )
}
