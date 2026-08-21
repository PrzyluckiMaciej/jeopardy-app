import { useCallback, useMemo, useRef, useState, type DragEvent, type MouseEvent } from 'react'
import { ArrowLeft, Check, ChevronDown, ChevronUp, EllipsisVertical, Folder, Layers, LayoutGrid, Trophy } from 'lucide-react'
import type { Board, BoardFolder, Game, GameFolder } from '../types'
import { buildPathString, isFolderInside, resolvePath } from '../lib/folderPath'
import { collectFolderSubtree } from '../lib/folderSubtree'
import {
  comparePickerRows,
  pickerCreatableTypes,
  pickerItemTypeFromKind,
  pickerItemTypeLabel,
  type PickerItemType,
  type PickerSortDir,
  type PickerSortKey,
} from '../lib/pickerItemType'
import {
  BOARDS_DND_MIME,
  GAMES_DND_MIME,
  type PickerNavDragPayload,
} from '../lib/pickerDnD'
import { formatBoardTimestamp, isFinalBoard } from '../lib/utils'
import {
  isBoardTrashed,
  isFolderTrashed,
  isGameFolderTrashed,
  isGameTrashed,
  uniqueBoardName,
  uniqueFolderName,
  useBoardStore,
} from '../store/gameStore'
import ConfirmModal from './ConfirmModal'
import ContextMenu, { type ContextMenuItem } from './ContextMenu'
import NewItemModal from './NewItemModal'

type DragPayload =
  | { type: 'board'; id: string }
  | { type: 'folder'; id: string }

type GamesDragPayload =
  | { type: 'game'; id: string }
  | { type: 'folder'; id: string }

type SortKey = PickerSortKey
type SortDir = PickerSortDir

type PickerEntry =
  | { kind: 'folder'; item: BoardFolder }
  | { kind: 'board'; item: Board }
  | { kind: 'gameFolder'; item: GameFolder }
  | { kind: 'game'; item: Game }

function pickerEntryType(entry: PickerEntry): PickerItemType {
  return pickerItemTypeFromKind(entry.kind, entry.kind === 'board' ? entry.item : undefined)
}

function pickerEntrySortRow(entry: PickerEntry) {
  return {
    name: entry.item.name,
    type: pickerEntryType(entry),
    createdAt: entry.item.createdAt,
    updatedAt: entry.item.updatedAt,
  }
}

interface RenameDraft {
  id: string
  value: string
}

interface PendingMove {
  kind: 'board' | 'folder'
  id: string
  targetFolderId: string | null
  currentName: string
  uniqueName: string
}

export type BoardPickerExplorerMode = 'library' | 'trash'

interface Props {
  boards: Board[]
  folders: BoardFolder[]
  /** Shown in trash mode alongside boards/folders. */
  games?: Game[]
  gameFolders?: GameFolder[]
  mode?: BoardPickerExplorerMode
  onSelectBoard: (board: Board) => void
  onEditBoard: (board: Board) => void
  onDeleteBoard: (board: Board) => void
  onDuplicateBoard: (board: Board) => void
  onDuplicateFolder: (folder: BoardFolder) => void
  onRequestDeleteFolder: (folder: BoardFolder) => void
  onCreateBoard: (folderId: string | null) => void
  onCreateFinal?: (folderId: string | null) => void
  onRequestAddToGame: (boardIds: string[], label: string) => void
  onRestoreBoard?: (board: Board) => void
  onRestoreFolder?: (folder: BoardFolder) => void
  onPermanentDeleteBoard?: (board: Board) => void
  onPermanentDeleteFolder?: (folder: BoardFolder) => void
  onRestoreGame?: (game: Game) => void
  onRestoreGameFolder?: (folder: GameFolder) => void
  onPermanentDeleteGame?: (game: Game) => void
  onPermanentDeleteGameFolder?: (folder: GameFolder) => void
  /** When set, start inline rename for this folder id (e.g. after create). */
  renameFolderId?: string | null
  onRenameFolderIdChange?: (id: string | null) => void
  /** When set, start inline rename for this board id (e.g. after create). */
  renameBoardId?: string | null
  onRenameBoardIdChange?: (id: string | null) => void
  /** Notifies HostPage of the active drag for nav-tab drop targets. */
  onPickerDragChange?: (payload: PickerNavDragPayload | null) => void
}

function parseDragPayload(e: DragEvent): DragPayload | null {
  try {
    const raw = e.dataTransfer.getData(BOARDS_DND_MIME) || e.dataTransfer.getData('text/plain')
    if (!raw) return null
    const data = JSON.parse(raw) as DragPayload
    if (data?.type === 'board' || data?.type === 'folder') return data
  } catch {
    /* ignore */
  }
  return null
}

export default function BoardPickerExplorer({
  boards,
  folders,
  games = [],
  gameFolders = [],
  mode = 'library',
  onSelectBoard,
  onEditBoard,
  onDeleteBoard,
  onDuplicateBoard,
  onDuplicateFolder,
  onRequestDeleteFolder,
  onCreateBoard,
  onCreateFinal,
  onRequestAddToGame,
  onRestoreBoard,
  onRestoreFolder,
  onPermanentDeleteBoard,
  onPermanentDeleteFolder,
  onRestoreGame,
  onRestoreGameFolder,
  onPermanentDeleteGame,
  onPermanentDeleteGameFolder,
  renameFolderId: controlledRenameFolderId,
  onRenameFolderIdChange,
  renameBoardId: controlledRenameBoardId,
  onRenameBoardIdChange,
  onPickerDragChange,
}: Props) {
  const isTrash = mode === 'trash'
  const moveBoardToFolder = useBoardStore((s) => s.moveBoardToFolder)
  const moveFolder = useBoardStore((s) => s.moveFolder)
  const renameFolder = useBoardStore((s) => s.renameFolder)
  const createFolder = useBoardStore((s) => s.createFolder)
  const renameBoard = useBoardStore((s) => s.renameBoard)

  const [userFolderId, setUserFolderId] = useState<string | null>(null)
  const [newItemOpen, setNewItemOpen] = useState(false)
  const [pathEditing, setPathEditing] = useState(false)
  const [pathDraft, setPathDraft] = useState('/')
  const [dragOverTarget, setDragOverTarget] = useState<string | null>(null)
  const [activeDrag, setActiveDrag] = useState<DragPayload | null>(null)
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null)
  const [internalRenameFolderId, setInternalRenameFolderId] = useState<string | null>(null)
  const [internalRenameBoardId, setInternalRenameBoardId] = useState<string | null>(null)
  const [folderRenameDraft, setFolderRenameDraft] = useState<RenameDraft | null>(null)
  const [boardRenameDraft, setBoardRenameDraft] = useState<RenameDraft | null>(null)
  const [menu, setMenu] = useState<{
    x: number
    y: number
    items: ContextMenuItem[]
    anchorId?: string
  } | null>(null)
  const [prevRenameNavKey, setPrevRenameNavKey] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('type')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const dragGhostRef = useRef<HTMLElement | null>(null)

  const scopedFolders = useMemo(
    () => folders.filter((f) => (isTrash ? isFolderTrashed(f) : !isFolderTrashed(f))),
    [folders, isTrash],
  )
  const scopedBoards = useMemo(
    () => boards.filter((b) => (isTrash ? isBoardTrashed(b) : !isBoardTrashed(b))),
    [boards, isTrash],
  )
  const scopedGameFolders = useMemo(
    () =>
      isTrash
        ? gameFolders.filter((f) => isGameFolderTrashed(f))
        : [],
    [gameFolders, isTrash],
  )
  const scopedGames = useMemo(
    () => (isTrash ? games.filter((g) => isGameTrashed(g)) : []),
    [games, isTrash],
  )

  const editingFolderId =
    controlledRenameFolderId !== undefined ? controlledRenameFolderId : internalRenameFolderId
  const editingBoardId =
    controlledRenameBoardId !== undefined ? controlledRenameBoardId : internalRenameBoardId

  const folderRenameValue =
    folderRenameDraft?.id === editingFolderId
      ? folderRenameDraft.value
      : (scopedFolders.find((f) => f.id === editingFolderId)?.name ?? '')

  const boardRenameValue =
    boardRenameDraft?.id === editingBoardId
      ? boardRenameDraft.value
      : (scopedBoards.find((b) => b.id === editingBoardId)?.name ?? '')

  const folderRenameConflict = useMemo(() => {
    if (!editingFolderId || isTrash) return false
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
  }, [editingFolderId, folderRenameValue, scopedFolders, isTrash])

  const boardRenameConflict = useMemo(() => {
    if (!editingBoardId || isTrash) return false
    const name = boardRenameValue.trim()
    if (!name) return false
    const board = scopedBoards.find((b) => b.id === editingBoardId)
    if (!board) return false
    if (board.name.trim().toLowerCase() === name.toLowerCase()) return false
    const kind = isFinalBoard(board) ? 'final' : 'board'
    return scopedBoards.some(
      (b) =>
        b.id !== editingBoardId &&
        (b.folderId ?? null) === (board.folderId ?? null) &&
        (isFinalBoard(b) ? 'final' : 'board') === kind &&
        b.name.trim().toLowerCase() === name.toLowerCase(),
    )
  }, [editingBoardId, boardRenameValue, scopedBoards, isTrash])

  // Adjust navigation while rendering when the current folder disappears or a rename starts.
  const folderExistsInBoardTree =
    userFolderId !== null && scopedFolders.some((f) => f.id === userFolderId)
  const folderExistsInGameTree =
    userFolderId !== null && scopedGameFolders.some((f) => f.id === userFolderId)
  if (
    userFolderId !== null &&
    !folderExistsInBoardTree &&
    !(isTrash && folderExistsInGameTree)
  ) {
    setUserFolderId(null)
  }

  const renameNavKey = editingBoardId ?? editingFolderId ?? null
  if (!isTrash && renameNavKey !== prevRenameNavKey) {
    setPrevRenameNavKey(renameNavKey)
    if (editingBoardId) {
      const board = scopedBoards.find((b) => b.id === editingBoardId)
      if (board) setUserFolderId(board.folderId ?? null)
    } else if (editingFolderId) {
      const folder = scopedFolders.find((f) => f.id === editingFolderId)
      if (folder) setUserFolderId(folder.parentId)
    }
  }

  const inGameFolderTree = isTrash && folderExistsInGameTree
  const pathFolders = inGameFolderTree ? scopedGameFolders : scopedFolders

  const currentFolderId =
    userFolderId !== null &&
    !pathFolders.some((f) => f.id === userFolderId)
      ? null
      : userFolderId

  const currentPath = useMemo(
    () => buildPathString(pathFolders, currentFolderId),
    [pathFolders, currentFolderId],
  )
  const pathValue = pathEditing ? pathDraft : currentPath

  const setEditingFolderId = useCallback(
    (id: string | null, name?: string) => {
      if (onRenameBoardIdChange) onRenameBoardIdChange(null)
      else setInternalRenameBoardId(null)
      setBoardRenameDraft(null)
      if (onRenameFolderIdChange) {
        onRenameFolderIdChange(id)
      } else {
        setInternalRenameFolderId(id)
      }
      if (id && name !== undefined) setFolderRenameDraft({ id, value: name })
      else setFolderRenameDraft(null)
    },
    [onRenameFolderIdChange, onRenameBoardIdChange],
  )

  const setEditingBoardId = useCallback(
    (id: string | null, name?: string) => {
      if (onRenameFolderIdChange) onRenameFolderIdChange(null)
      else setInternalRenameFolderId(null)
      setFolderRenameDraft(null)
      if (onRenameBoardIdChange) {
        onRenameBoardIdChange(id)
      } else {
        setInternalRenameBoardId(id)
      }
      if (id && name !== undefined) setBoardRenameDraft({ id, value: name })
      else setBoardRenameDraft(null)
    },
    [onRenameBoardIdChange, onRenameFolderIdChange],
  )

  const visibleEntries = useMemo(() => {
    const typeContext = isTrash ? 'trash' : 'boards'
    const bySort = (a: PickerEntry, b: PickerEntry) =>
      comparePickerRows(pickerEntrySortRow(a), pickerEntrySortRow(b), sortKey, sortDir, typeContext)

    if (isTrash && inGameFolderTree) {
      const gFolders: PickerEntry[] = scopedGameFolders
        .filter((f) => f.parentId === currentFolderId)
        .map((item) => ({ kind: 'gameFolder', item }))
      const gameItems: PickerEntry[] = scopedGames
        .filter((g) => (g.folderId ?? null) === currentFolderId)
        .map((item) => ({ kind: 'game', item }))
      return [...gFolders, ...gameItems].sort(bySort)
    }

    const folderEntries: PickerEntry[] = scopedFolders
      .filter((f) => f.parentId === currentFolderId)
      .map((item) => ({ kind: 'folder', item }))
    const boardEntries: PickerEntry[] = scopedBoards
      .filter((b) => (b.folderId ?? null) === currentFolderId)
      .map((item) => ({ kind: 'board', item }))

    if (isTrash && currentFolderId === null) {
      const gFolders: PickerEntry[] = scopedGameFolders
        .filter((f) => f.parentId === null)
        .map((item) => ({ kind: 'gameFolder', item }))
      const gameItems: PickerEntry[] = scopedGames
        .filter((g) => (g.folderId ?? null) === null)
        .map((item) => ({ kind: 'game', item }))
      return [...folderEntries, ...gFolders, ...boardEntries, ...gameItems].sort(bySort)
    }

    return [...folderEntries, ...boardEntries].sort(bySort)
  }, [
    scopedFolders,
    scopedBoards,
    scopedGameFolders,
    scopedGames,
    currentFolderId,
    sortKey,
    sortDir,
    isTrash,
    inGameFolderTree,
  ])

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
    return pathFolders.find((f) => f.id === currentFolderId)?.parentId ?? null
  }, [pathFolders, currentFolderId])

  function navigateTo(folderId: string | null) {
    setUserFolderId(folderId)
    setPathEditing(false)
  }

  function goBack() {
    if (currentFolderId === null) return
    navigateTo(parentFolderId)
  }

  function commitPath() {
    const resolved = resolvePath(pathFolders, pathValue.trim())
    if (resolved === undefined) {
      setPathDraft(currentPath)
      return
    }
    setPathEditing(false)
    setUserFolderId(resolved)
  }

  function closeMenu() {
    setMenu(null)
  }

  function showMenu(x: number, y: number, items: ContextMenuItem[], anchorId?: string) {
    setMenu({ x, y, items, anchorId })
  }

  function openMenuFromEvent(e: MouseEvent, items: ContextMenuItem[]) {
    e.preventDefault()
    e.stopPropagation()
    showMenu(e.clientX, e.clientY, items)
  }

  function openMenuFromButton(e: MouseEvent, items: ContextMenuItem[], anchorId: string) {
    e.preventDefault()
    e.stopPropagation()
    if (menu?.anchorId === anchorId) {
      closeMenu()
      return
    }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    // Prefer anchoring under the button; ContextMenu clamps to the viewport.
    showMenu(rect.left, rect.bottom + 4, items, anchorId)
  }

  function createNewFolder() {
    const id = createFolder('New Folder', currentFolderId)
    const createdName =
      useBoardStore.getState().folders.find((f) => f.id === id)?.name ?? 'New Folder'
    setEditingFolderId(id, createdName)
  }

  function handleNewItemConfirm(type: PickerItemType) {
    setNewItemOpen(false)
    if (type === 'board') onCreateBoard(currentFolderId)
    else if (type === 'final') onCreateFinal?.(currentFolderId)
    else if (type === 'folder') createNewFolder()
  }

  function emptyMenuItems(): ContextMenuItem[] {
    return [
      {
        id: 'new-board',
        label: 'New Board',
        onSelect: () => onCreateBoard(currentFolderId),
      },
      ...(onCreateFinal
        ? [
            {
              id: 'new-final',
              label: 'New Final Jeopardy',
              onSelect: () => onCreateFinal(currentFolderId),
            },
          ]
        : []),
      {
        id: 'new-folder',
        label: 'New Folder',
        onSelect: () => createNewFolder(),
      },
    ]
  }

  function folderMenuItems(folder: BoardFolder): ContextMenuItem[] {
    if (isTrash) {
      return [
        {
          id: 'restore',
          label: 'Restore',
          onSelect: () => onRestoreFolder?.(folder),
        },
        {
          id: 'delete-permanent',
          label: 'Delete permanently',
          danger: true,
          onSelect: () => onPermanentDeleteFolder?.(folder),
        },
      ]
    }
    return [
      {
        id: 'new-board',
        label: 'New Board',
        onSelect: () => {
          navigateTo(folder.id)
          onCreateBoard(folder.id)
        },
      },
      ...(onCreateFinal
        ? [
            {
              id: 'new-final',
              label: 'New Final Jeopardy',
              onSelect: () => {
                navigateTo(folder.id)
                onCreateFinal(folder.id)
              },
            },
          ]
        : []),
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
      ...(currentFolderId !== null
        ? [
            {
              id: 'move-to-parent',
              label: 'Move to parent directory',
              onSelect: () => requestMove({ type: 'folder', id: folder.id }, parentFolderId),
            },
          ]
        : []),
      {
        id: 'add-to-game',
        label: 'Add to game',
        onSelect: () => {
          const folderIds = collectFolderSubtree(folders, folder.id)
          const boardIds = boards
            .filter((b) => b.folderId != null && folderIds.has(b.folderId) && !isBoardTrashed(b))
            .map((b) => b.id)
          const count = boardIds.length
          const label =
            count === 1
              ? `1 board from ${folder.name}`
              : `${count} boards from ${folder.name}`
          onRequestAddToGame(boardIds, label)
        },
      },
      {
        id: 'delete',
        label: 'Delete',
        danger: true,
        onSelect: () => onRequestDeleteFolder(folder),
      },
    ]
  }

  function boardMenuItems(board: Board): ContextMenuItem[] {
    if (isTrash) {
      return [
        {
          id: 'restore',
          label: 'Restore',
          onSelect: () => onRestoreBoard?.(board),
        },
        {
          id: 'delete-permanent',
          label: 'Delete permanently',
          danger: true,
          onSelect: () => onPermanentDeleteBoard?.(board),
        },
      ]
    }
    return [
      {
        id: 'edit',
        label: 'Edit',
        onSelect: () => onEditBoard(board),
      },
      {
        id: 'rename',
        label: 'Rename',
        onSelect: () => setEditingBoardId(board.id, board.name),
      },
      {
        id: 'duplicate',
        label: 'Duplicate',
        onSelect: () => onDuplicateBoard(board),
      },
      ...(currentFolderId !== null
        ? [
            {
              id: 'move-to-parent',
              label: 'Move to parent directory',
              onSelect: () => requestMove({ type: 'board', id: board.id }, parentFolderId),
            },
          ]
        : []),
      {
        id: 'add-to-game',
        label: 'Add to game',
        onSelect: () => onRequestAddToGame([board.id], board.name),
      },
      {
        id: 'delete',
        label: 'Delete',
        danger: true,
        onSelect: () => onDeleteBoard(board),
      },
    ]
  }

  function gameFolderMenuItems(folder: GameFolder): ContextMenuItem[] {
    return [
      {
        id: 'restore',
        label: 'Restore',
        onSelect: () => onRestoreGameFolder?.(folder),
      },
      {
        id: 'delete-permanent',
        label: 'Delete permanently',
        danger: true,
        onSelect: () => onPermanentDeleteGameFolder?.(folder),
      },
    ]
  }

  function gameMenuItems(game: Game): ContextMenuItem[] {
    return [
      {
        id: 'restore',
        label: 'Restore',
        onSelect: () => onRestoreGame?.(game),
      },
      {
        id: 'delete-permanent',
        label: 'Delete permanently',
        danger: true,
        onSelect: () => onPermanentDeleteGame?.(game),
      },
    ]
  }

  function openEmptyMenu(e: MouseEvent) {
    if (isTrash) return
    const target = e.target as HTMLElement
    if (target.closest('.board-picker-board-row, .board-picker-folder-row')) return
    openMenuFromEvent(e, emptyMenuItems())
  }

  function renderRowMenuButton(items: ContextMenuItem[], label: string, anchorId: string) {
    return (
      <div className="board-picker-explorer-row__menu">
        <button
          type="button"
          className="board-picker-row-menu-btn"
          aria-label={label}
          title={label}
          aria-expanded={menu?.anchorId === anchorId}
          onClick={(e) => openMenuFromButton(e, items, anchorId)}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <EllipsisVertical size={14} aria-hidden />
        </button>
      </div>
    )
  }

  function commitRename(folderId: string) {
    const name = folderRenameValue.trim()
    if (!name) {
      setEditingFolderId(null)
      return
    }
    if (renameFolder(folderId, name)) {
      setEditingFolderId(null)
    }
  }

  function commitBoardRename(boardId: string) {
    const name = boardRenameValue.trim()
    if (!name) {
      setEditingBoardId(null)
      return
    }
    if (renameBoard(boardId, name)) {
      setEditingBoardId(null)
    }
  }

  function renderTypeColumn(type: PickerItemType) {
    return <span className="board-picker-explorer-row__type">{pickerItemTypeLabel(type)}</span>
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

  function applyDragImage(e: DragEvent, dragImageEl?: HTMLElement | null) {
    clearDragGhost()
    if (!dragImageEl) return
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

  function setDragData(e: DragEvent, payload: DragPayload, dragImageEl?: HTMLElement | null) {
    const json = JSON.stringify(payload)
    e.dataTransfer.setData(BOARDS_DND_MIME, json)
    e.dataTransfer.setData('text/plain', json)
    e.dataTransfer.effectAllowed = 'move'
    applyDragImage(e, dragImageEl)
    setActiveDrag(payload)
    onPickerDragChange?.({ domain: 'boards', type: payload.type, id: payload.id })
  }

  function setGamesDragData(e: DragEvent, payload: GamesDragPayload, dragImageEl?: HTMLElement | null) {
    const json = JSON.stringify(payload)
    e.dataTransfer.setData(GAMES_DND_MIME, json)
    e.dataTransfer.setData('text/plain', json)
    e.dataTransfer.effectAllowed = 'move'
    applyDragImage(e, dragImageEl)
    setActiveDrag(null)
    onPickerDragChange?.({ domain: 'games', type: payload.type, id: payload.id })
  }

  function clearDrag() {
    clearDragGhost()
    setActiveDrag(null)
    setDragOverTarget(null)
    onPickerDragChange?.(null)
  }

  function canDropOnFolder(payload: DragPayload | null, targetFolderId: string): boolean {
    if (isTrash || !payload) return false
    if (payload.type === 'board') return true
    if (payload.id === targetFolderId) return false
    if (isFolderInside(scopedFolders, targetFolderId, payload.id)) return false
    return true
  }

  function canDropOnParent(payload: DragPayload | null): boolean {
    if (isTrash || !payload || currentFolderId === null) return false
    if (parentFolderId === null) return true
    return canDropOnFolder(payload, parentFolderId)
  }

  function requestMove(payload: DragPayload, targetFolderId: string | null) {
    if (payload.type === 'board') {
      const board = boards.find((b) => b.id === payload.id)
      if (!board || isBoardTrashed(board)) return
      if ((board.folderId ?? null) === targetFolderId) return
      const uniqueName = uniqueBoardName(
        boards,
        targetFolderId,
        board.name,
        isFinalBoard(board) ? 'final' : 'board',
        board.id,
      )
      if (uniqueName === board.name) {
        moveBoardToFolder(board.id, targetFolderId)
        return
      }
      setPendingMove({
        kind: 'board',
        id: board.id,
        targetFolderId,
        currentName: board.name,
        uniqueName,
      })
      return
    }

    const folder = folders.find((f) => f.id === payload.id)
    if (!folder || isFolderTrashed(folder)) return
    if (folder.parentId === targetFolderId) return
    if (
      targetFolderId !== null &&
      (targetFolderId === folder.id || isFolderInside(scopedFolders, targetFolderId, folder.id))
    ) {
      return
    }
    const uniqueName = uniqueFolderName(
      folders,
      targetFolderId,
      folder.name,
      isFolderTrashed,
      folder.id,
    )
    if (uniqueName === folder.name) {
      moveFolder(folder.id, targetFolderId)
      return
    }
    setPendingMove({
      kind: 'folder',
      id: folder.id,
      targetFolderId,
      currentName: folder.name,
      uniqueName,
    })
  }

  function confirmPendingMove() {
    if (!pendingMove) return
    const { kind, id, targetFolderId } = pendingMove
    setPendingMove(null)
    if (kind === 'board') {
      moveBoardToFolder(id, targetFolderId)
    } else {
      moveFolder(id, targetFolderId)
    }
  }

  function handleDropOnFolder(e: DragEvent, targetFolderId: string) {
    e.preventDefault()
    e.stopPropagation()
    if (isTrash) {
      clearDrag()
      return
    }
    const payload = activeDrag ?? parseDragPayload(e)
    clearDrag()
    if (!payload || !canDropOnFolder(payload, targetFolderId)) return
    requestMove(payload, targetFolderId)
  }

  function handleDropOnParent(e: DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (isTrash) {
      clearDrag()
      return
    }
    const payload = activeDrag ?? parseDragPayload(e)
    clearDrag()
    if (!payload || !canDropOnParent(payload)) return
    requestMove(payload, parentFolderId)
  }

  function handleDropOnCurrent(e: DragEvent) {
    e.preventDefault()
    if (isTrash) {
      clearDrag()
      return
    }
    const payload = activeDrag ?? parseDragPayload(e)
    clearDrag()
    if (!payload) return
    if (payload.type === 'folder') {
      if (currentFolderId && payload.id === currentFolderId) return
      if (currentFolderId && isFolderInside(scopedFolders, currentFolderId, payload.id)) return
    }
    requestMove(payload, currentFolderId)
  }

  function renderBoardRow(board: Board) {
    const isEditing = !isTrash && editingBoardId === board.id

    return (
      <div
        key={board.id}
        className="board-picker-board-row board-picker-explorer-row"
        draggable={!isEditing}
        onDragStart={(e) => {
          if (isEditing) return
          const nameEl = e.currentTarget.querySelector('.board-picker-explorer-row__name')
          setDragData(
            e,
            { type: 'board', id: board.id },
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
          openMenuFromEvent(e, boardMenuItems(board))
        }}
      >
        <div className="board-picker-explorer-row__name">
          {isEditing ? (
            <div className="board-picker-rename flex-1 min-w-0">
              <div className="flex items-center gap-1 min-w-0">
                {isFinalBoard(board) ? (
                  <Trophy size={14} className="board-picker-object-icon board-picker-object-icon--final" />
                ) : (
                  <LayoutGrid size={14} className="board-picker-object-icon board-picker-object-icon--board" />
                )}
                <input
                  className={`board-picker-input${boardRenameConflict ? ' board-picker-input--error' : ''}`}
                  value={boardRenameValue}
                  onChange={(e) => {
                    if (editingBoardId) {
                      setBoardRenameDraft({ id: editingBoardId, value: e.target.value })
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitBoardRename(board.id)
                    if (e.key === 'Escape') setEditingBoardId(null)
                  }}
                  onBlur={() => commitBoardRename(board.id)}
                  autoFocus
                  onFocus={(e) => e.target.select()}
                  onClick={(e) => e.stopPropagation()}
                  aria-invalid={boardRenameConflict}
                  aria-describedby={boardRenameConflict ? `board-rename-error-${board.id}` : undefined}
                />
                <button
                  type="button"
                  className="board-picker-save-btn"
                  onClick={() => commitBoardRename(board.id)}
                  title="Save"
                  disabled={boardRenameConflict}
                >
                  <Check size={14} />
                </button>
              </div>
              {boardRenameConflict && (
                <div
                  id={`board-rename-error-${board.id}`}
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
              className="board-picker-board-btn"
              onClick={() => {
                if (!isTrash) onSelectBoard(board)
              }}
            >
              {isFinalBoard(board) ? (
                <Trophy size={14} className="board-picker-object-icon board-picker-object-icon--final" />
              ) : (
                <LayoutGrid size={14} className="board-picker-object-icon board-picker-object-icon--board" />
              )}
              <span className="font-condensed font-bold truncate">{board.name}</span>
            </button>
          )}
        </div>
        {renderTypeColumn(pickerItemTypeFromKind('board', board))}
        {renderDateColumns(board.createdAt, board.updatedAt)}
        {!isEditing && renderRowMenuButton(boardMenuItems(board), 'Board actions', `board-${board.id}`)}
      </div>
    )
  }

  function renderFolderRow(folder: BoardFolder) {
    const isEditing = !isTrash && editingFolderId === folder.id
    const dropKey = `folder:${folder.id}`
    const isDragOver = !isTrash && dragOverTarget === dropKey

    return (
      <div
        key={folder.id}
        className={`board-picker-folder-row board-picker-explorer-row${isDragOver ? ' board-picker-folder-row--drag-over' : ''}`}
        draggable={!isEditing}
        onDragStart={(e) => {
          if (isEditing) return
          const nameEl = e.currentTarget.querySelector('.board-picker-explorer-row__name')
          setDragData(
            e,
            { type: 'folder', id: folder.id },
            nameEl instanceof HTMLElement ? nameEl : null,
          )
        }}
        onDragEnd={clearDrag}
        onDragOver={(e) => {
          if (isTrash) return
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
        onContextMenu={(e) => {
          if (isEditing) return
          openMenuFromEvent(e, folderMenuItems(folder))
        }}
      >
        <div className="board-picker-explorer-row__name">
          {isEditing ? (
            <div className="board-picker-rename flex-1 min-w-0">
              <div className="flex items-center gap-1 min-w-0">
                <Folder size={14} className="board-picker-object-icon board-picker-object-icon--folder" />
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
                  aria-describedby={folderRenameConflict ? `folder-rename-error-${folder.id}` : undefined}
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
                  id={`folder-rename-error-${folder.id}`}
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
              <Folder size={14} className="board-picker-object-icon board-picker-object-icon--folder" />
              <span className="truncate">{folder.name}</span>
            </button>
          )}
        </div>
        {renderTypeColumn('folder')}
        {renderDateColumns(folder.createdAt, folder.updatedAt)}
        {!isEditing && renderRowMenuButton(folderMenuItems(folder), 'Folder actions', `folder-${folder.id}`)}
      </div>
    )
  }

  function renderGameRow(game: Game) {
    return (
      <div
        key={`game-${game.id}`}
        className="board-picker-board-row board-picker-explorer-row"
        draggable
        onDragStart={(e) => {
          const nameEl = e.currentTarget.querySelector('.board-picker-explorer-row__name')
          setGamesDragData(
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
        onContextMenu={(e) => openMenuFromEvent(e, gameMenuItems(game))}
      >
        <div className="board-picker-explorer-row__name">
          <button type="button" className="board-picker-board-btn">
            <Layers size={14} className="board-picker-object-icon board-picker-object-icon--game" />
            <span className="font-condensed font-bold truncate">{game.name}</span>
          </button>
        </div>
        {renderTypeColumn('game')}
        {renderDateColumns(game.createdAt, game.updatedAt)}
        {renderRowMenuButton(gameMenuItems(game), 'Game actions', `trash-game-${game.id}`)}
      </div>
    )
  }

  function renderGameFolderRow(folder: GameFolder) {
    return (
      <div
        key={`game-folder-${folder.id}`}
        className="board-picker-folder-row board-picker-explorer-row"
        draggable
        onDragStart={(e) => {
          const nameEl = e.currentTarget.querySelector('.board-picker-explorer-row__name')
          setGamesDragData(
            e,
            { type: 'folder', id: folder.id },
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
        onContextMenu={(e) => openMenuFromEvent(e, gameFolderMenuItems(folder))}
      >
        <div className="board-picker-explorer-row__name">
          <button
            type="button"
            className="board-picker-folder-row__btn"
            onClick={() => navigateTo(folder.id)}
          >
            <Folder size={14} className="board-picker-object-icon board-picker-object-icon--folder" />
            <span className="truncate">{folder.name}</span>
          </button>
        </div>
        {renderTypeColumn('folder')}
        {renderDateColumns(folder.createdAt, folder.updatedAt)}
        {renderRowMenuButton(gameFolderMenuItems(folder), 'Folder actions', `trash-game-folder-${folder.id}`)}
      </div>
    )
  }

  const isEmpty = visibleEntries.length === 0
  const currentDragOver = !isTrash && dragOverTarget === 'current'
  const parentDragOver = !isTrash && dragOverTarget === 'parent'
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
            !isTrash && !atRoot && activeDrag
              ? 'This item will be placed in the parent folder'
              : undefined
          }
          onDragEnter={(e) => {
            if (isTrash || atRoot || !canDropOnParent(activeDrag)) return
            e.preventDefault()
            e.stopPropagation()
            setDragOverTarget('parent')
          }}
          onDragOver={(e) => {
            if (isTrash || atRoot) return
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
        {!isTrash && (
          <button
            type="button"
            className="board-picker-new-item-btn"
            onClick={() => setNewItemOpen(true)}
          >
            New Item
          </button>
        )}
      </div>
      <div
        className={`board-picker-boards__scroll board-picker-explorer${currentDragOver ? ' board-picker-explorer--drag-over' : ''}`}
        onContextMenu={openEmptyMenu}
        onDragOver={(e) => {
          if (isTrash) return
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
            {renderSortHeader('type', 'Type', 'board-picker-explorer-header__type')}
            {renderSortHeader('createdAt', 'Created at', 'board-picker-explorer-header__date')}
            {renderSortHeader('updatedAt', 'Last modified at', 'board-picker-explorer-header__date')}
            <span className="board-picker-explorer-header__menu" aria-hidden />
          </div>
        )}
        {visibleEntries.map((entry) => {
          if (entry.kind === 'folder') return renderFolderRow(entry.item)
          if (entry.kind === 'board') return renderBoardRow(entry.item)
          if (entry.kind === 'gameFolder') return renderGameFolderRow(entry.item)
          return renderGameRow(entry.item)
        })}
        {isEmpty && (
          <div className="board-picker-empty">
            {isTrash ? 'Trash is empty' : 'No saved boards'}
          </div>
        )}
      </div>
      {menu && (
        <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={closeMenu} />
      )}
      {newItemOpen && !isTrash && (
        <NewItemModal
          allowedTypes={pickerCreatableTypes('boards')}
          onConfirm={handleNewItemConfirm}
          onCancel={() => setNewItemOpen(false)}
        />
      )}
      {pendingMove && (
        <ConfirmModal
          title="Duplicate name"
          message={`"${pendingMove.currentName}" already exists here. It will be renamed to "${pendingMove.uniqueName}".`}
          confirmLabel="Move"
          onConfirm={confirmPendingMove}
          onCancel={() => setPendingMove(null)}
        />
      )}
    </>
  )
}
