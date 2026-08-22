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
import {
  checkTransferAbort,
  downloadJson,
  exportBoardFolderItem,
  exportBoardItem,
  importEnvelope,
  parseAndValidateExport,
  pickJsonFile,
  sanitizeExportFilename,
  useTransferJob,
} from '../lib/transfer'
import {
  pickerRenameConflictMessage,
  pickerSelectionKey,
  type PickerRestoreItem,
} from '../lib/pickerSelection'
import { showToast, toastItemLabel } from '../store/toastStore'
import AddItemButton from './AddItemButton'
import ConfirmModal from './ConfirmModal'
import ContextMenu, { type ContextMenuItem } from './ContextMenu'
import NewItemModal from './NewItemModal'
import PickerCheckbox from './PickerCheckbox'
import PickerMassActionBar, { type PickerMassAction } from './PickerMassActionBar'
import TransferProgressModal from './TransferProgressModal'

type DragPayload =
  | { type: 'board'; id: string }
  | { type: 'folder'; id: string }

type GamesDragPayload =
  | { type: 'game'; id: string }
  | { type: 'folder'; id: string }

type ActiveBoardDrag = {
  primary: DragPayload
  items: DragPayload[]
}

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

function pickerEntryKey(entry: PickerEntry): string {
  return pickerSelectionKey(entry.kind, entry.item.id)
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
  onRestoreMany?: (items: PickerRestoreItem[]) => void
  /** When set, start inline rename for this folder id (e.g. after create). */
  renameFolderId?: string | null
  onRenameFolderIdChange?: (id: string | null) => void
  /** When set, start inline rename for this board id (e.g. after create). */
  renameBoardId?: string | null
  onRenameBoardIdChange?: (id: string | null) => void
  /** Notifies HostPage of the active drag for nav-tab drop targets. */
  onPickerDragChange?: (payload: PickerNavDragPayload | null) => void
}

function parseDragPayload(e: DragEvent): ActiveBoardDrag | null {
  try {
    const raw = e.dataTransfer.getData(BOARDS_DND_MIME) || e.dataTransfer.getData('text/plain')
    if (!raw) return null
    const data = JSON.parse(raw) as DragPayload | { items: DragPayload[] }
    if (data && 'items' in data && Array.isArray(data.items) && data.items.length > 0) {
      const items = data.items.filter(
        (item): item is DragPayload => item?.type === 'board' || item?.type === 'folder',
      )
      if (items.length === 0) return null
      return { primary: items[0], items }
    }
    if (
      data &&
      'type' in data &&
      (data.type === 'board' || data.type === 'folder') &&
      typeof data.id === 'string'
    ) {
      return { primary: data, items: [data] }
    }
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
  onRestoreMany,
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
  const { job: transferJob, errorMessage: transferError, cancel: cancelTransfer, dismissError: dismissTransferError, showError: showTransferError, runTransfer } =
    useTransferJob()
  const [pathEditing, setPathEditing] = useState(false)
  const [pathDraft, setPathDraft] = useState('/')
  const [dragOverTarget, setDragOverTarget] = useState<string | null>(null)
  const [activeDrag, setActiveDrag] = useState<ActiveBoardDrag | null>(null)
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null)
  const [pendingBulkMove, setPendingBulkMove] = useState<{
    items: Array<{ kind: 'board' | 'folder'; id: string }>
    targetFolderId: string | null
    conflicts: Array<{ currentName: string; uniqueName: string }>
    notify: boolean
  } | null>(null)
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
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

  const selectedEntries = useMemo(
    () => visibleEntries.filter((entry) => selectedKeys.has(pickerEntryKey(entry))),
    [visibleEntries, selectedKeys],
  )
  const allVisibleSelected =
    visibleEntries.length > 0 && selectedEntries.length === visibleEntries.length
  const someVisibleSelected = selectedEntries.length > 0 && !allVisibleSelected

  function toggleSelected(key: string, checked: boolean) {
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      if (checked) next.add(key)
      else next.delete(key)
      return next
    })
  }

  function toggleSelectAll(checked: boolean) {
    if (checked) {
      setSelectedKeys(new Set(visibleEntries.map(pickerEntryKey)))
      return
    }
    setSelectedKeys(new Set())
  }

  function clearSelection() {
    setSelectedKeys(new Set())
  }

  function renderRowCheckbox(kind: PickerEntry['kind'], item: PickerEntry['item'], label: string) {
    const key = pickerSelectionKey(kind, item.id)
    return (
      <div className="board-picker-explorer-row__check">
        <PickerCheckbox
          checked={selectedKeys.has(key)}
          onChange={(checked) => toggleSelected(key, checked)}
          ariaLabel={label}
        />
      </div>
    )
  }

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
    clearSelection()
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
    if (resolved !== currentFolderId) clearSelection()
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

  function handleExportBoard(board: Board) {
    void runTransfer('Exporting…', async (signal, onProgress) => {
      const envelope = await exportBoardItem(board, { folders }, { signal, onProgress })
      downloadJson(sanitizeExportFilename(board.name), envelope)
    })
  }

  function handleExportFolder(folder: BoardFolder) {
    void runTransfer('Exporting…', async (signal, onProgress) => {
      const envelope = await exportBoardFolderItem(
        folder,
        { boards, folders },
        { signal, onProgress },
      )
      downloadJson(sanitizeExportFilename(folder.name), envelope)
    })
  }

  function handleMassExport() {
    const items = selectedEntries.filter(
      (entry): entry is { kind: 'board'; item: Board } | { kind: 'folder'; item: BoardFolder } =>
        entry.kind === 'board' || entry.kind === 'folder',
    )
    if (items.length === 0) {
      showToast('error', 'Nothing to export.')
      return
    }
    void runTransfer('Exporting…', async (signal, onProgress) => {
      const total = items.length
      for (let i = 0; i < items.length; i += 1) {
        checkTransferAbort(signal)
        const entry = items[i]
        onProgress({ done: i, total, label: `Exporting ${entry.item.name}` })
        if (entry.kind === 'board') {
          const envelope = await exportBoardItem(entry.item, { folders }, { signal })
          downloadJson(sanitizeExportFilename(entry.item.name), envelope)
        } else {
          const envelope = await exportBoardFolderItem(
            entry.item,
            { boards, folders },
            { signal },
          )
          downloadJson(sanitizeExportFilename(entry.item.name), envelope)
        }
      }
      onProgress({ done: total, total, label: 'Done' })
    }).then((result) => {
      if (result === 'ok') {
        showToast('success', `Exported ${toastItemLabel(items.length)}.`)
      } else if (result === 'error') {
        showToast('error', 'Export failed.')
      }
    })
  }

  function collectSelectedBoardIds(): string[] {
    const ids = new Set<string>()
    for (const entry of selectedEntries) {
      if (entry.kind === 'board') {
        ids.add(entry.item.id)
        continue
      }
      if (entry.kind !== 'folder') continue
      const folderIds = collectFolderSubtree(folders, entry.item.id)
      for (const board of boards) {
        if (board.folderId != null && folderIds.has(board.folderId) && !isBoardTrashed(board)) {
          ids.add(board.id)
        }
      }
    }
    return [...ids]
  }

  function handleMassAddToGame() {
    const boardIds = collectSelectedBoardIds()
    if (boardIds.length === 0) {
      showToast('error', 'No boards to add to a game.')
      return
    }
    const label = boardIds.length === 1 ? '1 board' : `${boardIds.length} boards`
    onRequestAddToGame(boardIds, label)
  }

  function handleMassDelete() {
    const count = selectedEntries.filter(
      (entry) => entry.kind === 'board' || entry.kind === 'folder',
    ).length
    if (count === 0) {
      showToast('error', 'Nothing to delete.')
      return
    }
    for (const entry of selectedEntries) {
      if (entry.kind === 'board') onDeleteBoard(entry.item)
      else if (entry.kind === 'folder') onRequestDeleteFolder(entry.item)
    }
    clearSelection()
    showToast('success', `Moved ${toastItemLabel(count)} to trash.`)
  }

  function handleMassRestore() {
    if (selectedEntries.length === 0) {
      showToast('error', 'Nothing to restore.')
      return
    }
    onRestoreMany?.(
      selectedEntries.map((entry) => ({ kind: entry.kind, id: entry.item.id })),
    )
    clearSelection()
  }

  function handleMassPermanentDelete() {
    const count = selectedEntries.length
    if (count === 0) {
      showToast('error', 'Nothing to delete.')
      return
    }
    for (const entry of selectedEntries) {
      if (entry.kind === 'board') onPermanentDeleteBoard?.(entry.item)
      else if (entry.kind === 'folder') onPermanentDeleteFolder?.(entry.item)
      else if (entry.kind === 'game') onPermanentDeleteGame?.(entry.item)
      else onPermanentDeleteGameFolder?.(entry.item)
    }
    clearSelection()
    showToast('success', `Permanently deleted ${toastItemLabel(count)}.`)
  }

  function applyBoardMoves(items: Array<{ kind: 'board' | 'folder'; id: string }>, targetFolderId: string | null) {
    for (const item of items) {
      if (item.kind === 'board') moveBoardToFolder(item.id, targetFolderId)
      else moveFolder(item.id, targetFolderId)
    }
  }

  function planBoardMoves(
    payloads: DragPayload[],
    targetFolderId: string | null,
  ): {
    items: Array<{ kind: 'board' | 'folder'; id: string }>
    conflicts: Array<{ currentName: string; uniqueName: string }>
  } {
    const items: Array<{ kind: 'board' | 'folder'; id: string }> = []
    const conflicts: Array<{ currentName: string; uniqueName: string }> = []
    for (const payload of payloads) {
      if (payload.type === 'board') {
        const board = boards.find((b) => b.id === payload.id)
        if (!board || isBoardTrashed(board)) continue
        if ((board.folderId ?? null) === targetFolderId) continue
        items.push({ kind: 'board', id: board.id })
        const uniqueName = uniqueBoardName(
          boards,
          targetFolderId,
          board.name,
          isFinalBoard(board) ? 'final' : 'board',
          board.id,
        )
        if (uniqueName !== board.name) {
          conflicts.push({ currentName: board.name, uniqueName })
        }
        continue
      }
      const folder = folders.find((f) => f.id === payload.id)
      if (!folder || isFolderTrashed(folder)) continue
      if (folder.parentId === targetFolderId) continue
      if (
        targetFolderId !== null &&
        (targetFolderId === folder.id || isFolderInside(scopedFolders, targetFolderId, folder.id))
      ) {
        continue
      }
      items.push({ kind: 'folder', id: folder.id })
      const uniqueName = uniqueFolderName(
        folders,
        targetFolderId,
        folder.name,
        isFolderTrashed,
        folder.id,
      )
      if (uniqueName !== folder.name) {
        conflicts.push({ currentName: folder.name, uniqueName })
      }
    }
    return { items, conflicts }
  }

  function requestMoveMany(
    payloads: DragPayload[],
    targetFolderId: string | null,
    options?: { notify?: boolean },
  ) {
    const notify = options?.notify ?? payloads.length > 1
    const { items, conflicts } = planBoardMoves(payloads, targetFolderId)
    if (items.length === 0) {
      if (notify) showToast('error', "Couldn't move the selected items.")
      return
    }
    if (conflicts.length === 0) {
      applyBoardMoves(items, targetFolderId)
      clearSelection()
      if (notify) showToast('success', `Moved ${toastItemLabel(items.length)}.`)
      return
    }
    setPendingBulkMove({ items, targetFolderId, conflicts, notify })
  }

  function handleMassMoveToParent() {
    if (currentFolderId === null) return
    const payloads: DragPayload[] = []
    for (const entry of selectedEntries) {
      if (entry.kind === 'board') payloads.push({ type: 'board', id: entry.item.id })
      else if (entry.kind === 'folder') payloads.push({ type: 'folder', id: entry.item.id })
    }
    requestMoveMany(payloads, parentFolderId, { notify: true })
  }

  function confirmPendingBulkMove() {
    if (!pendingBulkMove) return
    const { items, targetFolderId, notify } = pendingBulkMove
    setPendingBulkMove(null)
    applyBoardMoves(items, targetFolderId)
    clearSelection()
    if (notify) showToast('success', `Moved ${toastItemLabel(items.length)}.`)
  }

  function resolveBoardDragItems(primary: DragPayload): DragPayload[] {
    const kind = primary.type === 'board' ? 'board' : 'folder'
    const key = pickerSelectionKey(kind, primary.id)
    if (!selectedKeys.has(key) || selectedEntries.length <= 1) return [primary]
    const items: DragPayload[] = []
    for (const entry of selectedEntries) {
      if (entry.kind === 'board') items.push({ type: 'board', id: entry.item.id })
      else if (entry.kind === 'folder') items.push({ type: 'folder', id: entry.item.id })
    }
    return items.length > 0 ? items : [primary]
  }

  function resolveGamesDragItems(primary: GamesDragPayload): GamesDragPayload[] {
    const kind = primary.type === 'game' ? 'game' : 'gameFolder'
    const key = pickerSelectionKey(kind, primary.id)
    if (!selectedKeys.has(key) || selectedEntries.length <= 1) return [primary]
    const items: GamesDragPayload[] = []
    for (const entry of selectedEntries) {
      if (entry.kind === 'game') items.push({ type: 'game', id: entry.item.id })
      else if (entry.kind === 'gameFolder') items.push({ type: 'folder', id: entry.item.id })
    }
    return items.length > 0 ? items : [primary]
  }

  function bulkMenuItems(): ContextMenuItem[] {
    return getMassActions().map((action) => ({
      id: action.id,
      label: action.label,
      danger: action.danger,
      onSelect: () => {
        if (action.disabled) return
        action.onSelect()
      },
    }))
  }

  function openItemContextMenu(
    e: MouseEvent,
    key: string,
    singleItems: ContextMenuItem[],
  ) {
    if (selectedKeys.has(key) && selectedEntries.length > 1) {
      openMenuFromEvent(e, bulkMenuItems())
      return
    }
    openMenuFromEvent(e, singleItems)
  }

  function getMassActions(): PickerMassAction[] {
    if (isTrash) {
      return [
        { id: 'restore', label: 'Restore', onSelect: handleMassRestore },
        {
          id: 'delete-permanent',
          label: 'Delete permanently',
          danger: true,
          onSelect: handleMassPermanentDelete,
        },
      ]
    }
    const addToGameBoardCount = collectSelectedBoardIds().length
    return [
      ...(currentFolderId !== null
        ? [
            {
              id: 'move-to-parent',
              label: 'Move to parent directory',
              onSelect: handleMassMoveToParent,
            },
          ]
        : []),
      {
        id: 'add-to-game',
        label: 'Add to game',
        onSelect: handleMassAddToGame,
        disabled: addToGameBoardCount === 0,
      },
      { id: 'export', label: 'Export', onSelect: handleMassExport },
      { id: 'delete', label: 'Delete', danger: true, onSelect: handleMassDelete },
    ]
  }

  async function handleImport() {
    try {
      const raw = await pickJsonFile()
      if (raw == null) return
      const envelope = parseAndValidateExport(raw, 'boards')
      await runTransfer('Importing…', async (signal, onProgress) => {
        await importEnvelope(envelope, currentFolderId, { signal, onProgress })
      })
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      showTransferError(err instanceof Error ? err.message : 'Import failed.')
    }
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
      {
        id: 'import',
        label: 'Import',
        onSelect: () => void handleImport(),
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
        id: 'export',
        label: 'Export',
        onSelect: () => handleExportFolder(folder),
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
        id: 'export',
        label: 'Export',
        onSelect: () => handleExportBoard(board),
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

  function setDragData(e: DragEvent, primary: DragPayload, dragImageEl?: HTMLElement | null) {
    const items = resolveBoardDragItems(primary)
    const json = JSON.stringify({ items })
    e.dataTransfer.setData(BOARDS_DND_MIME, json)
    e.dataTransfer.setData('text/plain', json)
    e.dataTransfer.effectAllowed = 'move'
    applyDragImage(e, dragImageEl)
    setActiveDrag({ primary, items })
    onPickerDragChange?.({
      domain: 'boards',
      type: primary.type,
      id: primary.id,
      items,
    })
  }

  function setGamesDragData(e: DragEvent, primary: GamesDragPayload, dragImageEl?: HTMLElement | null) {
    const items = resolveGamesDragItems(primary)
    const json = JSON.stringify({ items })
    e.dataTransfer.setData(GAMES_DND_MIME, json)
    e.dataTransfer.setData('text/plain', json)
    e.dataTransfer.effectAllowed = 'move'
    applyDragImage(e, dragImageEl)
    setActiveDrag(null)
    onPickerDragChange?.({
      domain: 'games',
      type: primary.type,
      id: primary.id,
      items,
    })
  }

  function clearDrag() {
    clearDragGhost()
    setActiveDrag(null)
    setDragOverTarget(null)
    onPickerDragChange?.(null)
  }

  function canDropItemsOnFolder(items: DragPayload[], targetFolderId: string): boolean {
    if (isTrash || items.length === 0) return false
    for (const payload of items) {
      if (payload.type === 'board') continue
      if (payload.id === targetFolderId) return false
      if (isFolderInside(scopedFolders, targetFolderId, payload.id)) return false
    }
    return true
  }

  function canDropOnFolder(drag: ActiveBoardDrag | null, targetFolderId: string): boolean {
    if (!drag) return false
    return canDropItemsOnFolder(drag.items, targetFolderId)
  }

  function canDropOnParent(drag: ActiveBoardDrag | null): boolean {
    if (isTrash || !drag || currentFolderId === null) return false
    if (parentFolderId === null) return true
    return canDropItemsOnFolder(drag.items, parentFolderId)
  }

  function requestMove(payload: DragPayload, targetFolderId: string | null) {
    requestMoveMany([payload], targetFolderId)
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
    const drag = activeDrag ?? parseDragPayload(e)
    clearDrag()
    if (!drag || !canDropItemsOnFolder(drag.items, targetFolderId)) return
    requestMoveMany(drag.items, targetFolderId, { notify: drag.items.length > 1 })
  }

  function handleDropOnParent(e: DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (isTrash) {
      clearDrag()
      return
    }
    const drag = activeDrag ?? parseDragPayload(e)
    clearDrag()
    if (!drag || !canDropOnParent(drag)) return
    requestMoveMany(drag.items, parentFolderId, { notify: drag.items.length > 1 })
  }

  function handleDropOnCurrent(e: DragEvent) {
    e.preventDefault()
    if (isTrash) {
      clearDrag()
      return
    }
    const drag = activeDrag ?? parseDragPayload(e)
    clearDrag()
    if (!drag) return
    if (currentFolderId) {
      if (!canDropItemsOnFolder(drag.items, currentFolderId)) return
    }
    requestMoveMany(drag.items, currentFolderId, { notify: drag.items.length > 1 })
  }

  function renderBoardRow(board: Board) {
    const isEditing = !isTrash && editingBoardId === board.id
    const selected = selectedKeys.has(pickerSelectionKey('board', board.id))

    return (
      <div
        key={board.id}
        className={`board-picker-board-row board-picker-explorer-row${selected ? ' board-picker-explorer-row--selected' : ''}`}
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
          openItemContextMenu(
            e,
            pickerSelectionKey('board', board.id),
            boardMenuItems(board),
          )
        }}
      >
        {renderRowCheckbox('board', board, `Select ${board.name}`)}
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
        {!isEditing &&
          renderRowMenuButton(
            selected && selectedEntries.length > 1 ? bulkMenuItems() : boardMenuItems(board),
            'Board actions',
            `board-${board.id}`,
          )}
      </div>
    )
  }

  function renderFolderRow(folder: BoardFolder) {
    const isEditing = !isTrash && editingFolderId === folder.id
    const dropKey = `folder:${folder.id}`
    const isDragOver = !isTrash && dragOverTarget === dropKey
    const folderIds = collectFolderSubtree(scopedFolders, folder.id)
    const itemCount = scopedBoards.filter(
      (b) => b.folderId != null && folderIds.has(b.folderId),
    ).length

    const selected = selectedKeys.has(pickerSelectionKey('folder', folder.id))

    return (
      <div
        key={folder.id}
        className={`board-picker-folder-row board-picker-explorer-row${isDragOver ? ' board-picker-folder-row--drag-over' : ''}${selected ? ' board-picker-explorer-row--selected' : ''}`}
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
          openItemContextMenu(
            e,
            pickerSelectionKey('folder', folder.id),
            folderMenuItems(folder),
          )
        }}
      >
        {renderRowCheckbox('folder', folder, `Select ${folder.name}`)}
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
              <span className="board-picker-folder-row__count">({itemCount})</span>
            </button>
          )}
        </div>
        {renderTypeColumn('folder')}
        {renderDateColumns(folder.createdAt, folder.updatedAt)}
        {!isEditing &&
          renderRowMenuButton(
            selected && selectedEntries.length > 1 ? bulkMenuItems() : folderMenuItems(folder),
            'Folder actions',
            `folder-${folder.id}`,
          )}
      </div>
    )
  }

  function renderGameRow(game: Game) {
    const selected = selectedKeys.has(pickerSelectionKey('game', game.id))
    return (
      <div
        key={`game-${game.id}`}
        className={`board-picker-board-row board-picker-explorer-row${selected ? ' board-picker-explorer-row--selected' : ''}`}
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
        onContextMenu={(e) =>
          openItemContextMenu(
            e,
            pickerSelectionKey('game', game.id),
            gameMenuItems(game),
          )
        }
      >
        {renderRowCheckbox('game', game, `Select ${game.name}`)}
        <div className="board-picker-explorer-row__name">
          <button type="button" className="board-picker-board-btn">
            <Layers size={14} className="board-picker-object-icon board-picker-object-icon--game" />
            <span className="font-condensed font-bold truncate">{game.name}</span>
          </button>
        </div>
        {renderTypeColumn('game')}
        {renderDateColumns(game.createdAt, game.updatedAt)}
        {renderRowMenuButton(
          selected && selectedEntries.length > 1 ? bulkMenuItems() : gameMenuItems(game),
          'Game actions',
          `trash-game-${game.id}`,
        )}
      </div>
    )
  }

  function renderGameFolderRow(folder: GameFolder) {
    const folderIds = collectFolderSubtree(scopedGameFolders, folder.id)
    const itemCount = scopedGames.filter(
      (g) => g.folderId != null && folderIds.has(g.folderId),
    ).length

    const selected = selectedKeys.has(pickerSelectionKey('gameFolder', folder.id))

    return (
      <div
        key={`game-folder-${folder.id}`}
        className={`board-picker-folder-row board-picker-explorer-row${selected ? ' board-picker-explorer-row--selected' : ''}`}
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
        onContextMenu={(e) =>
          openItemContextMenu(
            e,
            pickerSelectionKey('gameFolder', folder.id),
            gameFolderMenuItems(folder),
          )
        }
      >
        {renderRowCheckbox('gameFolder', folder, `Select ${folder.name}`)}
        <div className="board-picker-explorer-row__name">
          <button
            type="button"
            className="board-picker-folder-row__btn"
            onClick={() => navigateTo(folder.id)}
          >
            <Folder size={14} className="board-picker-object-icon board-picker-object-icon--folder" />
            <span className="truncate">{folder.name}</span>
            <span className="board-picker-folder-row__count">({itemCount})</span>
          </button>
        </div>
        {renderTypeColumn('folder')}
        {renderDateColumns(folder.createdAt, folder.updatedAt)}
        {renderRowMenuButton(
          selected && selectedEntries.length > 1 ? bulkMenuItems() : gameFolderMenuItems(folder),
          'Folder actions',
          `trash-game-folder-${folder.id}`,
        )}
      </div>
    )
  }

  const isEmpty = visibleEntries.length === 0
  const currentDragOver = !isTrash && dragOverTarget === 'current'
  const parentDragOver = !isTrash && dragOverTarget === 'parent'
  const atRoot = currentFolderId === null
  const massActions = getMassActions()

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
          <AddItemButton onCreate={() => setNewItemOpen(true)} onImport={() => void handleImport()} />
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
            <div className="board-picker-explorer-header__check">
              <PickerCheckbox
                checked={allVisibleSelected}
                indeterminate={someVisibleSelected}
                onChange={toggleSelectAll}
                ariaLabel="Select all items in this folder"
              />
            </div>
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
      {selectedEntries.length > 0 && (
        <PickerMassActionBar count={selectedEntries.length} actions={massActions} />
      )}
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
      {transferJob && (
        <TransferProgressModal
          title={transferJob.title}
          percent={transferJob.percent}
          label={transferJob.label}
          onCancel={cancelTransfer}
        />
      )}
      {transferError && (
        <ConfirmModal
          title="Transfer failed"
          message={transferError}
          confirmLabel="OK"
          cancelLabel="Close"
          onConfirm={dismissTransferError}
          onCancel={dismissTransferError}
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
      {pendingBulkMove && (
        <ConfirmModal
          title="Duplicate name"
          message={pickerRenameConflictMessage(pendingBulkMove.conflicts)}
          confirmLabel="Move"
          onConfirm={confirmPendingBulkMove}
          onCancel={() => setPendingBulkMove(null)}
        />
      )}
    </>
  )
}
