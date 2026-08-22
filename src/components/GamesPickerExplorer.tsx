import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent } from 'react'
import { ArrowLeft, Check, ChevronDown, ChevronUp, EllipsisVertical, Folder, Layers } from 'lucide-react'
import type { Game, GameFolder } from '../types'
import { buildPathString, isFolderInside, resolveFolderOrItemPath } from '../lib/folderPath'
import { collectFolderSubtree } from '../lib/folderSubtree'
import { formatBoardTimestamp } from '../lib/utils'
import {
  comparePickerRows,
  pickerCreatableTypes,
  pickerItemTypeFromKind,
  pickerItemTypeLabel,
  type PickerItemType,
  type PickerSortDir,
  type PickerSortKey,
} from '../lib/pickerItemType'
import { GAMES_DND_MIME, type PickerNavDragPayload } from '../lib/pickerDnD'
import { createPickerDragGhost, setPickerDragImage } from '../lib/pickerDragGhost'
import {
  isGameFolderTrashed,
  isGameTrashed,
  uniqueFolderName,
  uniqueItemName,
  useBoardStore,
} from '../store/gameStore'
import {
  checkTransferAbort,
  downloadJson,
  exportGameFolderItem,
  exportGameItem,
  importEnvelope,
  parseAndValidateExport,
  pickJsonFile,
  sanitizeExportFilename,
  useTransferJob,
} from '../lib/transfer'
import { pickerRenameConflictMessage, pickerSelectionKey } from '../lib/pickerSelection'
import { showToast, toastItemLabel } from '../store/toastStore'
import AddItemButton from './AddItemButton'
import ConfirmModal from './ConfirmModal'
import ContextMenu, { type ContextMenuItem } from './ContextMenu'
import NewItemModal from './NewItemModal'
import PickerCheckbox from './PickerCheckbox'
import PickerMassActionBar, { type PickerMassAction } from './PickerMassActionBar'
import TransferProgressModal from './TransferProgressModal'

type DragPayload =
  | { type: 'game'; id: string }
  | { type: 'folder'; id: string }

type ActiveGameDrag = {
  primary: DragPayload
  items: DragPayload[]
}

type SortKey = PickerSortKey
type SortDir = PickerSortDir

type PickerEntry =
  | { kind: 'folder'; item: GameFolder }
  | { kind: 'game'; item: Game }

function pickerEntrySortRow(entry: PickerEntry) {
  return {
    name: entry.item.name,
    type: pickerItemTypeFromKind(entry.kind),
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
  kind: 'game' | 'folder'
  id: string
  targetFolderId: string | null
  currentName: string
  uniqueName: string
}

interface Props {
  games: Game[]
  folders: GameFolder[]
  onSelectGame: (game: Game) => void
  onDeleteGame: (game: Game) => void
  onDuplicateGame: (game: Game) => void
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
  /** Notifies HostPage of the active drag for nav-tab drop targets. */
  onPickerDragChange?: (payload: PickerNavDragPayload | null) => void
}

function parseDragPayload(e: DragEvent): ActiveGameDrag | null {
  try {
    const raw = e.dataTransfer.getData(GAMES_DND_MIME) || e.dataTransfer.getData('text/plain')
    if (!raw) return null
    const data = JSON.parse(raw) as DragPayload | { items: DragPayload[] }
    if (data && 'items' in data && Array.isArray(data.items) && data.items.length > 0) {
      const items = data.items.filter(
        (item): item is DragPayload => item?.type === 'game' || item?.type === 'folder',
      )
      if (items.length === 0) return null
      return { primary: items[0], items }
    }
    if (
      data &&
      'type' in data &&
      (data.type === 'game' || data.type === 'folder') &&
      typeof data.id === 'string'
    ) {
      return { primary: data, items: [data] }
    }
  } catch {
    /* ignore */
  }
  return null
}

export default function GamesPickerExplorer({
  games,
  folders,
  onSelectGame,
  onDeleteGame,
  onDuplicateGame,
  onDuplicateFolder,
  onRequestDeleteFolder,
  renameFolderId: controlledRenameFolderId,
  onRenameFolderIdChange,
  renameGameId: controlledRenameGameId,
  onRenameGameIdChange,
  initialFolderId = null,
  onPickerDragChange,
}: Props) {
  const moveGameToFolder = useBoardStore((s) => s.moveGameToFolder)
  const moveGameFolder = useBoardStore((s) => s.moveGameFolder)
  const renameGameFolder = useBoardStore((s) => s.renameGameFolder)
  const createGameFolder = useBoardStore((s) => s.createGameFolder)
  const createGame = useBoardStore((s) => s.createGame)
  const renameGame = useBoardStore((s) => s.renameGame)
  const boards = useBoardStore((s) => s.boards)
  const boardFolders = useBoardStore((s) => s.folders)

  const [userFolderId, setUserFolderId] = useState<string | null>(initialFolderId)
  const [newItemOpen, setNewItemOpen] = useState(false)
  const {
    job: transferJob,
    errorMessage: transferError,
    cancel: cancelTransfer,
    dismissError: dismissTransferError,
    showError: showTransferError,
    runTransfer,
  } = useTransferJob()
  const [pathEditing, setPathEditing] = useState(false)
  const [pathDraft, setPathDraft] = useState('/')
  const [dragOverTarget, setDragOverTarget] = useState<string | null>(null)
  const [activeDrag, setActiveDrag] = useState<ActiveGameDrag | null>(null)
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null)
  const [pendingBulkMove, setPendingBulkMove] = useState<{
    items: Array<{ kind: 'game' | 'folder'; id: string }>
    targetFolderId: string | null
    conflicts: Array<{ currentName: string; uniqueName: string }>
    notify: boolean
  } | null>(null)
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
  const [internalRenameFolderId, setInternalRenameFolderId] = useState<string | null>(null)
  const [internalRenameGameId, setInternalRenameGameId] = useState<string | null>(null)
  const [folderRenameDraft, setFolderRenameDraft] = useState<RenameDraft | null>(null)
  const [gameRenameDraft, setGameRenameDraft] = useState<RenameDraft | null>(null)
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
  const prevInitialFolderId = useRef(initialFolderId)

  useEffect(() => {
    if (prevInitialFolderId.current !== initialFolderId) {
      prevInitialFolderId.current = initialFolderId
      setUserFolderId(initialFolderId)
      setSelectedKeys(new Set())
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

  const gameRenameConflict = useMemo(() => {
    if (!editingGameId) return false
    const name = gameRenameValue.trim()
    if (!name) return false
    const game = scopedGames.find((g) => g.id === editingGameId)
    if (!game) return false
    if (game.name.trim().toLowerCase() === name.toLowerCase()) return false
    return scopedGames.some(
      (g) =>
        g.id !== editingGameId &&
        (g.folderId ?? null) === (game.folderId ?? null) &&
        g.name.trim().toLowerCase() === name.toLowerCase(),
    )
  }, [editingGameId, gameRenameValue, scopedGames])

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
    const folderEntries: PickerEntry[] = scopedFolders
      .filter((f) => f.parentId === currentFolderId)
      .map((item) => ({ kind: 'folder', item }))
    const gameEntries: PickerEntry[] = scopedGames
      .filter((g) => (g.folderId ?? null) === currentFolderId)
      .map((item) => ({ kind: 'game', item }))
    return [...folderEntries, ...gameEntries].sort((a, b) =>
      comparePickerRows(pickerEntrySortRow(a), pickerEntrySortRow(b), sortKey, sortDir, 'games'),
    )
  }, [scopedFolders, scopedGames, currentFolderId, sortKey, sortDir])

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
    return scopedFolders.find((f) => f.id === currentFolderId)?.parentId ?? null
  }, [scopedFolders, currentFolderId])

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
    const resolved = resolveFolderOrItemPath(scopedFolders, scopedGames, pathValue.trim())
    if (resolved === undefined) {
      setPathDraft(currentPath)
      return
    }
    setPathEditing(false)
    if (resolved.kind === 'folder') {
      if (resolved.id !== currentFolderId) clearSelection()
      setUserFolderId(resolved.id)
      return
    }
    const game = scopedGames.find((g) => g.id === resolved.id)
    if (game) onSelectGame(game)
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
    showMenu(rect.left, rect.bottom + 4, items, anchorId)
  }

  function createNewGame() {
    const id = createGame('New Game', currentFolderId)
    const createdName =
      useBoardStore.getState().games.find((g) => g.id === id)?.name ?? 'New Game'
    setEditingGameId(id, createdName)
  }

  function createNewFolder() {
    const id = createGameFolder('New Folder', currentFolderId)
    const createdName =
      useBoardStore.getState().gameFolders.find((f) => f.id === id)?.name ?? 'New Folder'
    setEditingFolderId(id, createdName)
  }

  function handleNewItemConfirm(type: PickerItemType) {
    setNewItemOpen(false)
    if (type === 'game') createNewGame()
    else if (type === 'folder') createNewFolder()
  }

  function handleExportGame(game: Game) {
    void runTransfer('Exporting…', async (signal, onProgress) => {
      const envelope = await exportGameItem(
        game,
        { boards, folders: boardFolders },
        { signal, onProgress },
      )
      downloadJson(sanitizeExportFilename(game.name), envelope)
    })
  }

  function handleExportFolder(folder: GameFolder) {
    void runTransfer('Exporting…', async (signal, onProgress) => {
      const envelope = await exportGameFolderItem(
        folder,
        { boards, folders: boardFolders, games, gameFolders: folders },
        { signal, onProgress },
      )
      downloadJson(sanitizeExportFilename(folder.name), envelope)
    })
  }

  function handleMassExport() {
    if (selectedEntries.length === 0) {
      showToast('error', 'Nothing to export.')
      return
    }
    const items = [...selectedEntries]
    void runTransfer('Exporting…', async (signal, onProgress) => {
      const total = items.length
      for (let i = 0; i < items.length; i += 1) {
        checkTransferAbort(signal)
        const entry = items[i]
        onProgress({ done: i, total, label: `Exporting ${entry.item.name}` })
        if (entry.kind === 'game') {
          const envelope = await exportGameItem(
            entry.item,
            { boards, folders: boardFolders },
            { signal },
          )
          downloadJson(sanitizeExportFilename(entry.item.name), envelope)
        } else {
          const envelope = await exportGameFolderItem(
            entry.item,
            { boards, folders: boardFolders, games, gameFolders: folders },
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

  function handleMassDelete() {
    const count = selectedEntries.length
    if (count === 0) {
      showToast('error', 'Nothing to delete.')
      return
    }
    for (const entry of selectedEntries) {
      if (entry.kind === 'game') onDeleteGame(entry.item)
      else onRequestDeleteFolder(entry.item)
    }
    clearSelection()
    showToast('success', `Moved ${toastItemLabel(count)} to trash.`)
  }

  function applyGameMoves(
    items: Array<{ kind: 'game' | 'folder'; id: string }>,
    targetFolderId: string | null,
  ) {
    for (const item of items) {
      if (item.kind === 'game') moveGameToFolder(item.id, targetFolderId)
      else moveGameFolder(item.id, targetFolderId)
    }
  }

  function planGameMoves(
    payloads: DragPayload[],
    targetFolderId: string | null,
  ): {
    items: Array<{ kind: 'game' | 'folder'; id: string }>
    conflicts: Array<{ currentName: string; uniqueName: string }>
  } {
    const items: Array<{ kind: 'game' | 'folder'; id: string }> = []
    const conflicts: Array<{ currentName: string; uniqueName: string }> = []
    for (const payload of payloads) {
      if (payload.type === 'game') {
        const game = games.find((g) => g.id === payload.id)
        if (!game || isGameTrashed(game)) continue
        if ((game.folderId ?? null) === targetFolderId) continue
        items.push({ kind: 'game', id: game.id })
        const uniqueName = uniqueItemName(
          games,
          targetFolderId,
          game.name,
          isGameTrashed,
          game.id,
          'New Game',
        )
        if (uniqueName !== game.name) {
          conflicts.push({ currentName: game.name, uniqueName })
        }
        continue
      }
      const folder = folders.find((f) => f.id === payload.id)
      if (!folder || isGameFolderTrashed(folder)) continue
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
        isGameFolderTrashed,
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
    const { items, conflicts } = planGameMoves(payloads, targetFolderId)
    if (items.length === 0) {
      if (notify) showToast('error', "Couldn't move the selected items.")
      return
    }
    if (conflicts.length === 0) {
      applyGameMoves(items, targetFolderId)
      clearSelection()
      if (notify) showToast('success', `Moved ${toastItemLabel(items.length)}.`)
      return
    }
    setPendingBulkMove({ items, targetFolderId, conflicts, notify })
  }

  function handleMassMoveToParent() {
    if (currentFolderId === null) return
    const payloads: DragPayload[] = selectedEntries.map((entry) =>
      entry.kind === 'game'
        ? { type: 'game' as const, id: entry.item.id }
        : { type: 'folder' as const, id: entry.item.id },
    )
    requestMoveMany(payloads, parentFolderId, { notify: true })
  }

  function confirmPendingBulkMove() {
    if (!pendingBulkMove) return
    const { items, targetFolderId, notify } = pendingBulkMove
    setPendingBulkMove(null)
    applyGameMoves(items, targetFolderId)
    clearSelection()
    if (notify) showToast('success', `Moved ${toastItemLabel(items.length)}.`)
  }

  function resolveGameDragItems(primary: DragPayload): DragPayload[] {
    const kind = primary.type === 'game' ? 'game' : 'folder'
    const key = pickerSelectionKey(kind, primary.id)
    if (!selectedKeys.has(key) || selectedEntries.length <= 1) return [primary]
    return selectedEntries.map((entry) =>
      entry.kind === 'game'
        ? { type: 'game' as const, id: entry.item.id }
        : { type: 'folder' as const, id: entry.item.id },
    )
  }

  function getMassActions(): PickerMassAction[] {
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
      { id: 'export', label: 'Export', onSelect: handleMassExport },
      { id: 'delete', label: 'Delete', danger: true, onSelect: handleMassDelete },
    ]
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

  async function handleImport() {
    try {
      const raw = await pickJsonFile()
      if (raw == null) return
      const envelope = parseAndValidateExport(raw, 'games')
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
        id: 'new-game',
        label: 'New Game',
        onSelect: () => createNewGame(),
      },
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

  function folderMenuItems(folder: GameFolder): ContextMenuItem[] {
    return [
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

  function gameMenuItems(game: Game): ContextMenuItem[] {
    return [
      {
        id: 'rename',
        label: 'Rename',
        onSelect: () => setEditingGameId(game.id, game.name),
      },
      {
        id: 'duplicate',
        label: 'Duplicate',
        onSelect: () => onDuplicateGame(game),
      },
      ...(currentFolderId !== null
        ? [
            {
              id: 'move-to-parent',
              label: 'Move to parent directory',
              onSelect: () => requestMove({ type: 'game', id: game.id }, parentFolderId),
            },
          ]
        : []),
      {
        id: 'export',
        label: 'Export',
        onSelect: () => handleExportGame(game),
      },
      {
        id: 'delete',
        label: 'Delete',
        danger: true,
        onSelect: () => onDeleteGame(game),
      },
    ]
  }

  function openEmptyMenu(e: MouseEvent) {
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
    if (renameGameFolder(folderId, name)) {
      setEditingFolderId(null)
    }
  }

  function commitGameRename(gameId: string) {
    const name = gameRenameValue.trim()
    if (!name) {
      setEditingGameId(null)
      return
    }
    if (renameGame(gameId, name)) {
      setEditingGameId(null)
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

  function setDragData(e: DragEvent, primary: DragPayload, dragImageEl?: HTMLElement | null) {
    const items = resolveGameDragItems(primary)
    const json = JSON.stringify({ items })
    e.dataTransfer.setData(GAMES_DND_MIME, json)
    e.dataTransfer.setData('text/plain', json)
    e.dataTransfer.effectAllowed = 'move'
    clearDragGhost()
    const ghost = createPickerDragGhost({ count: items.length, sourceEl: dragImageEl })
    dragGhostRef.current = ghost
    setPickerDragImage(e, ghost, dragImageEl)
    setActiveDrag({ primary, items })
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
    if (items.length === 0) return false
    for (const payload of items) {
      if (payload.type === 'game') continue
      if (payload.id === targetFolderId) return false
      if (isFolderInside(scopedFolders, targetFolderId, payload.id)) return false
    }
    return true
  }

  function canDropOnFolder(drag: ActiveGameDrag | null, targetFolderId: string): boolean {
    if (!drag) return false
    return canDropItemsOnFolder(drag.items, targetFolderId)
  }

  function canDropOnParent(drag: ActiveGameDrag | null): boolean {
    if (!drag || currentFolderId === null) return false
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
    if (kind === 'game') {
      moveGameToFolder(id, targetFolderId)
    } else {
      moveGameFolder(id, targetFolderId)
    }
  }

  function handleDropOnFolder(e: DragEvent, targetFolderId: string) {
    e.preventDefault()
    e.stopPropagation()
    const drag = activeDrag ?? parseDragPayload(e)
    clearDrag()
    if (!drag || !canDropItemsOnFolder(drag.items, targetFolderId)) return
    requestMoveMany(drag.items, targetFolderId, { notify: drag.items.length > 1 })
  }

  function handleDropOnParent(e: DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    const drag = activeDrag ?? parseDragPayload(e)
    clearDrag()
    if (!drag || !canDropOnParent(drag)) return
    requestMoveMany(drag.items, parentFolderId, { notify: drag.items.length > 1 })
  }

  function handleDropOnCurrent(e: DragEvent) {
    e.preventDefault()
    const drag = activeDrag ?? parseDragPayload(e)
    clearDrag()
    if (!drag) return
    if (currentFolderId && !canDropItemsOnFolder(drag.items, currentFolderId)) return
    requestMoveMany(drag.items, currentFolderId, { notify: drag.items.length > 1 })
  }

  function renderGameRow(game: Game) {
    const isEditing = editingGameId === game.id
    const selected = selectedKeys.has(pickerSelectionKey('game', game.id))

    return (
      <div
        key={game.id}
        className={`board-picker-board-row board-picker-explorer-row${selected ? ' board-picker-explorer-row--selected' : ''}`}
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
          openItemContextMenu(
            e,
            pickerSelectionKey('game', game.id),
            gameMenuItems(game),
          )
        }}
      >
        {renderRowCheckbox('game', game, `Select ${game.name}`)}
        <div className="board-picker-explorer-row__name">
          {isEditing ? (
            <div className="board-picker-rename flex-1 min-w-0">
              <div className="flex items-center gap-1 min-w-0">
                <Layers size={14} className="board-picker-object-icon board-picker-object-icon--game" />
                <input
                  className={`board-picker-input${gameRenameConflict ? ' board-picker-input--error' : ''}`}
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
                  aria-invalid={gameRenameConflict}
                  aria-describedby={gameRenameConflict ? `game-rename-error-${game.id}` : undefined}
                />
                <button
                  type="button"
                  className="board-picker-save-btn"
                  onClick={() => commitGameRename(game.id)}
                  title="Save"
                  disabled={gameRenameConflict}
                >
                  <Check size={14} />
                </button>
              </div>
              {gameRenameConflict && (
                <div
                  id={`game-rename-error-${game.id}`}
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
              onClick={() => onSelectGame(game)}
            >
              <Layers size={14} className="board-picker-object-icon board-picker-object-icon--game" />
              <span className="font-condensed font-bold truncate">{game.name}</span>
            </button>
          )}
        </div>
        {renderTypeColumn('game')}
        {renderDateColumns(game.createdAt, game.updatedAt)}
        {!isEditing &&
          renderRowMenuButton(
            selected && selectedEntries.length > 1 ? bulkMenuItems() : gameMenuItems(game),
            'Game actions',
            `game-${game.id}`,
          )}
      </div>
    )
  }

  function renderFolderRow(folder: GameFolder) {
    const isEditing = editingFolderId === folder.id
    const dropKey = `folder:${folder.id}`
    const isDragOver = dragOverTarget === dropKey
    const folderIds = collectFolderSubtree(scopedFolders, folder.id)
    const itemCount = scopedGames.filter(
      (g) => g.folderId != null && folderIds.has(g.folderId),
    ).length

    const selected = selectedKeys.has(pickerSelectionKey('folder', folder.id))

    return (
      <div
        key={folder.id}
        className={`board-picker-folder-row board-picker-explorer-row${isDragOver ? ' board-picker-folder-row--drag-over' : ''}${selected ? ' board-picker-explorer-row--selected' : ''}`}
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

  const isEmpty = visibleEntries.length === 0
  const currentDragOver = dragOverTarget === 'current'
  const parentDragOver = dragOverTarget === 'parent'
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
        <AddItemButton onCreate={() => setNewItemOpen(true)} onImport={() => void handleImport()} />
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
        {visibleEntries.map((entry) =>
          entry.kind === 'folder' ? renderFolderRow(entry.item) : renderGameRow(entry.item),
        )}
        {isEmpty && (
          <div className="board-picker-empty">
            No saved games
          </div>
        )}
      </div>
      {selectedEntries.length > 0 && (
        <PickerMassActionBar count={selectedEntries.length} actions={massActions} />
      )}
      {menu && (
        <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={closeMenu} />
      )}
      {newItemOpen && (
        <NewItemModal
          allowedTypes={pickerCreatableTypes('games')}
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
