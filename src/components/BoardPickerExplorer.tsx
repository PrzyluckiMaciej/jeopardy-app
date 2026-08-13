import { useCallback, useMemo, useRef, useState, type DragEvent, type MouseEvent } from 'react'
import { ArrowLeft, Check, ChevronDown, ChevronUp, Folder, Layers, LayoutGrid, Trophy } from 'lucide-react'
import type { Board, BoardFolder, Game, GameFolder } from '../types'
import { buildPathString, isFolderInside, resolvePath } from '../lib/folderPath'
import { collectFolderSubtree } from '../lib/folderSubtree'
import { formatBoardTimestamp, isFinalBoard } from '../lib/utils'
import {
  isBoardTrashed,
  isFolderTrashed,
  isGameFolderTrashed,
  isGameTrashed,
  useBoardStore,
} from '../store/gameStore'
import ContextMenu, { type ContextMenuItem } from './ContextMenu'

const DND_MIME = 'application/x-jeopardy-picker'

type DragPayload =
  | { type: 'board'; id: string }
  | { type: 'folder'; id: string }

type SortKey = 'name' | 'createdAt' | 'updatedAt'
type SortDir = 'asc' | 'desc'

interface RenameDraft {
  id: string
  value: string
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
}

function parseDragPayload(e: DragEvent): DragPayload | null {
  try {
    const raw = e.dataTransfer.getData(DND_MIME) || e.dataTransfer.getData('text/plain')
    if (!raw) return null
    const data = JSON.parse(raw) as DragPayload
    if (data?.type === 'board' || data?.type === 'folder') return data
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

function stampBoardUpdatedAt(board: Board): Board {
  return { ...board, updatedAt: Date.now() }
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
}: Props) {
  const isTrash = mode === 'trash'
  const moveBoardToFolder = useBoardStore((s) => s.moveBoardToFolder)
  const moveFolder = useBoardStore((s) => s.moveFolder)
  const renameFolder = useBoardStore((s) => s.renameFolder)
  const createFolder = useBoardStore((s) => s.createFolder)
  const saveBoard = useBoardStore((s) => s.saveBoard)

  const [userFolderId, setUserFolderId] = useState<string | null>(null)
  const [pathEditing, setPathEditing] = useState(false)
  const [pathDraft, setPathDraft] = useState('/')
  const [dragOverTarget, setDragOverTarget] = useState<string | null>(null)
  const [activeDrag, setActiveDrag] = useState<DragPayload | null>(null)
  const [internalRenameFolderId, setInternalRenameFolderId] = useState<string | null>(null)
  const [internalRenameBoardId, setInternalRenameBoardId] = useState<string | null>(null)
  const [folderRenameDraft, setFolderRenameDraft] = useState<RenameDraft | null>(null)
  const [boardRenameDraft, setBoardRenameDraft] = useState<RenameDraft | null>(null)
  const [menu, setMenu] = useState<{
    x: number
    y: number
    items: ContextMenuItem[]
  } | null>(null)
  const [prevRenameNavKey, setPrevRenameNavKey] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('createdAt')
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
    type Entry =
      | { kind: 'folder'; item: BoardFolder }
      | { kind: 'board'; item: Board }
      | { kind: 'gameFolder'; item: GameFolder }
      | { kind: 'game'; item: Game }

    if (isTrash && inGameFolderTree) {
      const gFolders: Entry[] = scopedGameFolders
        .filter((f) => f.parentId === currentFolderId)
        .map((item) => ({ kind: 'gameFolder', item }))
      const gameItems: Entry[] = scopedGames
        .filter((g) => (g.folderId ?? null) === currentFolderId)
        .map((item) => ({ kind: 'game', item }))
      return [...gFolders, ...gameItems].sort((a, b) =>
        compareBySortKey(a.item, b.item, sortKey, sortDir),
      )
    }

    const folderEntries: Entry[] = scopedFolders
      .filter((f) => f.parentId === currentFolderId)
      .map((item) => ({ kind: 'folder', item }))
    const boardEntries: Entry[] = scopedBoards
      .filter((b) => (b.folderId ?? null) === currentFolderId)
      .map((item) => ({ kind: 'board', item }))

    if (isTrash && currentFolderId === null) {
      const gFolders: Entry[] = scopedGameFolders
        .filter((f) => f.parentId === null)
        .map((item) => ({ kind: 'gameFolder', item }))
      const gameItems: Entry[] = scopedGames
        .filter((g) => (g.folderId ?? null) === null)
        .map((item) => ({ kind: 'game', item }))
      return [...folderEntries, ...gFolders, ...boardEntries, ...gameItems].sort((a, b) =>
        compareBySortKey(a.item, b.item, sortKey, sortDir),
      )
    }

    return [...folderEntries, ...boardEntries].sort((a, b) =>
      compareBySortKey(a.item, b.item, sortKey, sortDir),
    )
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

  function openEmptyMenu(e: MouseEvent) {
    if (isTrash) return
    const target = e.target as HTMLElement
    if (target.closest('.board-picker-board-row, .board-picker-folder-row')) return
    e.preventDefault()
    e.stopPropagation()
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
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
          onSelect: () => {
            const id = createFolder('New Folder', currentFolderId)
            const createdName =
              useBoardStore.getState().folders.find((f) => f.id === id)?.name ?? 'New Folder'
            setEditingFolderId(id, createdName)
          },
        },
      ],
    })
  }

  function openFolderMenu(e: MouseEvent, folder: BoardFolder) {
    e.preventDefault()
    e.stopPropagation()
    if (isTrash) {
      setMenu({
        x: e.clientX,
        y: e.clientY,
        items: [
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
        ],
      })
      return
    }
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
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
      ],
    })
  }

  function openBoardMenu(e: MouseEvent, board: Board) {
    e.preventDefault()
    e.stopPropagation()
    if (isTrash) {
      setMenu({
        x: e.clientX,
        y: e.clientY,
        items: [
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
        ],
      })
      return
    }
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        {
          id: 'edit',
          label: 'Edit',
          onSelect: () => onEditBoard(board),
        },
        {
          id: 'duplicate',
          label: 'Duplicate',
          onSelect: () => onDuplicateBoard(board),
        },
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
      ],
    })
  }

  function openGameFolderMenu(e: MouseEvent, folder: GameFolder) {
    e.preventDefault()
    e.stopPropagation()
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
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
      ],
    })
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
    const board = scopedBoards.find((b) => b.id === boardId)
    if (board && name && name !== board.name) {
      saveBoard(stampBoardUpdatedAt({ ...board, name }))
    }
    setEditingBoardId(null)
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
    if (payload.type === 'board') {
      moveBoardToFolder(payload.id, targetFolderId)
    } else {
      moveFolder(payload.id, targetFolderId)
    }
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
    if (payload.type === 'board') {
      moveBoardToFolder(payload.id, parentFolderId)
    } else {
      moveFolder(payload.id, parentFolderId)
    }
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
    if (payload.type === 'board') {
      moveBoardToFolder(payload.id, currentFolderId)
    } else {
      if (currentFolderId && payload.id === currentFolderId) return
      if (currentFolderId && isFolderInside(scopedFolders, currentFolderId, payload.id)) return
      moveFolder(payload.id, currentFolderId)
    }
  }

  function renderBoardRow(board: Board) {
    const isEditing = !isTrash && editingBoardId === board.id

    return (
      <div
        key={board.id}
        className="board-picker-board-row board-picker-explorer-row"
        draggable={!isTrash && !isEditing}
        onDragStart={(e) => {
          if (isTrash) return
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
          openBoardMenu(e, board)
        }}
      >
        <div className="board-picker-explorer-row__name">
          {isEditing ? (
            <div className="flex items-center gap-1 flex-1 min-w-0">
              {isFinalBoard(board) ? (
                <Trophy size={14} className="board-picker-object-icon board-picker-object-icon--final" />
              ) : (
                <LayoutGrid size={14} className="board-picker-object-icon board-picker-object-icon--board" />
              )}
              <input
                className="board-picker-input"
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
              />
              <button
                type="button"
                className="board-picker-save-btn"
                onClick={() => commitBoardRename(board.id)}
                title="Save"
              >
                <Check size={14} />
              </button>
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
        {renderDateColumns(board.createdAt, board.updatedAt)}
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
        draggable={!isTrash && !isEditing}
        onDragStart={(e) => {
          if (isTrash) return
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
        onContextMenu={(e) => openFolderMenu(e, folder)}
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
        {renderDateColumns(folder.createdAt, folder.updatedAt)}
      </div>
    )
  }

  function renderGameRow(game: Game) {
    return (
      <div
        key={`game-${game.id}`}
        className="board-picker-board-row board-picker-explorer-row"
        onContextMenu={(e) => openGameMenu(e, game)}
      >
        <div className="board-picker-explorer-row__name">
          <button type="button" className="board-picker-board-btn" disabled>
            <Layers size={14} className="board-picker-object-icon board-picker-object-icon--game" />
            <span className="font-condensed font-bold truncate">{game.name}</span>
          </button>
        </div>
        {renderDateColumns(game.createdAt, game.updatedAt)}
      </div>
    )
  }

  function renderGameFolderRow(folder: GameFolder) {
    return (
      <div
        key={`game-folder-${folder.id}`}
        className="board-picker-folder-row board-picker-explorer-row"
        onContextMenu={(e) => openGameFolderMenu(e, folder)}
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
        {renderDateColumns(folder.createdAt, folder.updatedAt)}
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
            {renderSortHeader('createdAt', 'Created at', 'board-picker-explorer-header__date')}
            {renderSortHeader('updatedAt', 'Last modified at', 'board-picker-explorer-header__date')}
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
    </>
  )
}
