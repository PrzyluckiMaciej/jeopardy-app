import { useCallback, useMemo, useState, type DragEvent, type MouseEvent } from 'react'
import { ArrowLeft, Check, Folder, LayoutGrid } from 'lucide-react'
import type { Board, BoardFolder } from '../types'
import { collectFolderSubtree } from '../lib/folderSubtree'
import { isBoardTrashed, isFolderTrashed, useBoardStore } from '../store/gameStore'
import ContextMenu, { type ContextMenuItem } from './ContextMenu'

const DND_MIME = 'application/x-jeopardy-picker'

type DragPayload =
  | { type: 'board'; id: string }
  | { type: 'folder'; id: string }

interface RenameDraft {
  id: string
  value: string
}

export type BoardPickerExplorerMode = 'library' | 'trash'

interface Props {
  boards: Board[]
  folders: BoardFolder[]
  mode?: BoardPickerExplorerMode
  onSelectBoard: (board: Board) => void
  onEditBoard: (board: Board) => void
  onDeleteBoard: (board: Board) => void
  onDuplicateBoard: (board: Board) => void
  onDuplicateFolder: (folder: BoardFolder) => void
  onRequestDeleteFolder: (folder: BoardFolder) => void
  onCreateBoard: (folderId: string | null) => void
  onRequestAddToGame: (boardIds: string[], label: string) => void
  onRestoreBoard?: (board: Board) => void
  onRestoreFolder?: (folder: BoardFolder) => void
  onPermanentDeleteBoard?: (board: Board) => void
  onPermanentDeleteFolder?: (folder: BoardFolder) => void
  /** When set, start inline rename for this folder id (e.g. after create). */
  renameFolderId?: string | null
  onRenameFolderIdChange?: (id: string | null) => void
  /** When set, start inline rename for this board id (e.g. after create). */
  renameBoardId?: string | null
  onRenameBoardIdChange?: (id: string | null) => void
}

function isFolderInside(folders: BoardFolder[], folderId: string, ancestorId: string): boolean {
  let current = folders.find((f) => f.id === folderId)
  while (current?.parentId) {
    if (current.parentId === ancestorId) return true
    current = folders.find((f) => f.id === current!.parentId)
  }
  return false
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

function buildPathString(folders: BoardFolder[], folderId: string | null): string {
  if (!folderId) return '/'
  const parts: string[] = []
  let id: string | null = folderId
  while (id) {
    const f = folders.find((x) => x.id === id)
    if (!f) break
    parts.unshift(f.name)
    id = f.parentId
  }
  return `/${parts.join('/')}`
}

/** Resolves a slash path to a folder id. `null` = root. `undefined` = invalid. */
function resolvePath(folders: BoardFolder[], path: string): string | null | undefined {
  const segments = path.split('/').filter((s) => s.length > 0)
  if (segments.length === 0) return null
  let parentId: string | null = null
  for (const seg of segments) {
    const match = folders.find(
      (f) => f.parentId === parentId && f.name.toLowerCase() === seg.toLowerCase(),
    )
    if (!match) return undefined
    parentId = match.id
  }
  return parentId
}

export default function BoardPickerExplorer({
  boards,
  folders,
  mode = 'library',
  onSelectBoard,
  onEditBoard,
  onDeleteBoard,
  onDuplicateBoard,
  onDuplicateFolder,
  onRequestDeleteFolder,
  onCreateBoard,
  onRequestAddToGame,
  onRestoreBoard,
  onRestoreFolder,
  onPermanentDeleteBoard,
  onPermanentDeleteFolder,
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

  const scopedFolders = useMemo(
    () => folders.filter((f) => (isTrash ? isFolderTrashed(f) : !isFolderTrashed(f))),
    [folders, isTrash],
  )
  const scopedBoards = useMemo(
    () => boards.filter((b) => (isTrash ? isBoardTrashed(b) : !isBoardTrashed(b))),
    [boards, isTrash],
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
  if (userFolderId !== null && !scopedFolders.some((f) => f.id === userFolderId)) {
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

  const visibleFolders = useMemo(() => {
    return scopedFolders
      .filter((f) => f.parentId === currentFolderId)
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [scopedFolders, currentFolderId])

  const visibleBoards = useMemo(() => {
    return scopedBoards
      .filter((b) => (b.folderId ?? null) === currentFolderId)
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [scopedBoards, currentFolderId])

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
    const resolved = resolvePath(scopedFolders, pathValue.trim())
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
      saveBoard({ ...board, name })
    }
    setEditingBoardId(null)
  }

  function setDragData(e: DragEvent, payload: DragPayload) {
    const json = JSON.stringify(payload)
    e.dataTransfer.setData(DND_MIME, json)
    e.dataTransfer.setData('text/plain', json)
    e.dataTransfer.effectAllowed = 'move'
    setActiveDrag(payload)
  }

  function clearDrag() {
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
          setDragData(e, { type: 'board', id: board.id })
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
        {isEditing ? (
          <div className="flex items-center gap-1 flex-1 min-w-0">
            <LayoutGrid size={14} className="flex-shrink-0 opacity-70" />
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
            <LayoutGrid size={14} className="flex-shrink-0 opacity-70" />
            <span className="font-condensed font-bold truncate">{board.name}</span>
          </button>
        )}
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
          setDragData(e, { type: 'folder', id: folder.id })
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
            <Folder size={14} className="flex-shrink-0 opacity-70" />
            <span className="truncate">{folder.name}</span>
          </button>
        )}
      </div>
    )
  }

  const isEmpty = visibleFolders.length === 0 && visibleBoards.length === 0
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
        {visibleFolders.map((f) => renderFolderRow(f))}
        {visibleBoards.map((b) => renderBoardRow(b))}
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
