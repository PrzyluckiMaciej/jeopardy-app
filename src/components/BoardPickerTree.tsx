import { useCallback, useEffect, useMemo, useState, type DragEvent, type MouseEvent } from 'react'
import { ArrowLeft, Check, Folder, LayoutGrid } from 'lucide-react'
import type { Board, BoardFolder } from '../types'
import { useBoardStore } from '../store/gameStore'
import ContextMenu, { type ContextMenuItem } from './ContextMenu'

const DND_MIME = 'application/x-jeopardy-picker'

type DragPayload =
  | { type: 'board'; id: string }
  | { type: 'folder'; id: string }

interface RenameDraft {
  id: string
  value: string
}

interface Props {
  boards: Board[]
  folders: BoardFolder[]
  onSelectBoard: (board: Board) => void
  onEditBoard: (board: Board) => void
  onDeleteBoard: (board: Board) => void
  onDuplicateBoard: (board: Board) => void
  onDuplicateFolder: (folder: BoardFolder) => void
  onRequestDeleteFolder: (folder: BoardFolder) => void
  onCreateBoard: (folderId: string | null) => void
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

export default function BoardPickerTree({
  boards,
  folders,
  onSelectBoard,
  onEditBoard,
  onDeleteBoard,
  onDuplicateBoard,
  onDuplicateFolder,
  onRequestDeleteFolder,
  onCreateBoard,
  renameFolderId: controlledRenameFolderId,
  onRenameFolderIdChange,
  renameBoardId: controlledRenameBoardId,
  onRenameBoardIdChange,
}: Props) {
  const moveBoardToFolder = useBoardStore((s) => s.moveBoardToFolder)
  const moveFolder = useBoardStore((s) => s.moveFolder)
  const renameFolder = useBoardStore((s) => s.renameFolder)
  const createFolder = useBoardStore((s) => s.createFolder)
  const saveBoard = useBoardStore((s) => s.saveBoard)

  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)
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

  const editingFolderId =
    controlledRenameFolderId !== undefined ? controlledRenameFolderId : internalRenameFolderId
  const editingBoardId =
    controlledRenameBoardId !== undefined ? controlledRenameBoardId : internalRenameBoardId

  const folderRenameValue =
    folderRenameDraft?.id === editingFolderId
      ? folderRenameDraft.value
      : (folders.find((f) => f.id === editingFolderId)?.name ?? '')

  const boardRenameValue =
    boardRenameDraft?.id === editingBoardId
      ? boardRenameDraft.value
      : (boards.find((b) => b.id === editingBoardId)?.name ?? '')

  const currentPath = useMemo(
    () => buildPathString(folders, currentFolderId),
    [folders, currentFolderId],
  )

  // Keep path input in sync when navigating (unless user is mid-edit — we sync on navigate only)
  useEffect(() => {
    setPathDraft(currentPath)
  }, [currentPath])

  // If current folder was deleted, go to root
  useEffect(() => {
    if (currentFolderId && !folders.some((f) => f.id === currentFolderId)) {
      setCurrentFolderId(null)
    }
  }, [folders, currentFolderId])

  // Navigate to a board/folder being renamed so the inline editor is visible
  useEffect(() => {
    if (editingBoardId) {
      const board = boards.find((b) => b.id === editingBoardId)
      if (board) {
        const fid = board.folderId ?? null
        setCurrentFolderId((cur) => (cur === fid ? cur : fid))
      }
    }
  }, [editingBoardId, boards])

  useEffect(() => {
    if (editingFolderId) {
      const folder = folders.find((f) => f.id === editingFolderId)
      if (folder) {
        const parent = folder.parentId
        setCurrentFolderId((cur) => (cur === parent ? cur : parent))
      }
    }
  }, [editingFolderId, folders])

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
    return folders
      .filter((f) => f.parentId === currentFolderId)
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [folders, currentFolderId])

  const visibleBoards = useMemo(() => {
    return boards
      .filter((b) => (b.folderId ?? null) === currentFolderId)
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [boards, currentFolderId])

  const parentFolderId = useMemo(() => {
    if (!currentFolderId) return null
    return folders.find((f) => f.id === currentFolderId)?.parentId ?? null
  }, [folders, currentFolderId])

  function navigateTo(folderId: string | null) {
    setCurrentFolderId(folderId)
  }

  function goBack() {
    if (currentFolderId === null) return
    navigateTo(parentFolderId)
  }

  function commitPath() {
    const resolved = resolvePath(folders, pathDraft.trim())
    if (resolved === undefined) {
      setPathDraft(currentPath)
      return
    }
    navigateTo(resolved)
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
          id: 'new-board',
          label: 'New Board',
          onSelect: () => onCreateBoard(currentFolderId),
        },
        {
          id: 'new-folder',
          label: 'New Folder',
          onSelect: () => {
            const id = createFolder('New Folder', currentFolderId)
            setEditingFolderId(id, 'New Folder')
          },
        },
      ],
    })
  }

  function openFolderMenu(e: MouseEvent, folder: BoardFolder) {
    e.preventDefault()
    e.stopPropagation()
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
    if (name) renameFolder(folderId, name)
    setEditingFolderId(null)
  }

  function commitBoardRename(boardId: string) {
    const name = boardRenameValue.trim()
    const board = boards.find((b) => b.id === boardId)
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
    if (!payload) return false
    if (payload.type === 'board') return true
    if (payload.id === targetFolderId) return false
    if (isFolderInside(folders, targetFolderId, payload.id)) return false
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
    if (payload.type === 'board') {
      moveBoardToFolder(payload.id, targetFolderId)
    } else {
      moveFolder(payload.id, targetFolderId)
    }
  }

  function handleDropOnParent(e: DragEvent) {
    e.preventDefault()
    e.stopPropagation()
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
    const payload = activeDrag ?? parseDragPayload(e)
    clearDrag()
    if (!payload) return
    if (payload.type === 'board') {
      moveBoardToFolder(payload.id, currentFolderId)
    } else {
      if (currentFolderId && payload.id === currentFolderId) return
      if (currentFolderId && isFolderInside(folders, currentFolderId, payload.id)) return
      moveFolder(payload.id, currentFolderId)
    }
  }

  function renderBoardRow(board: Board) {
    const isEditing = editingBoardId === board.id

    return (
      <div
        key={board.id}
        className="board-picker-board-row board-picker-explorer-row"
        draggable={!isEditing}
        onDragStart={(e) => {
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
            onClick={() => onSelectBoard(board)}
          >
            <LayoutGrid size={14} className="flex-shrink-0 opacity-70" />
            <span className="font-condensed font-bold truncate">{board.name}</span>
          </button>
        )}
      </div>
    )
  }

  function renderFolderRow(folder: BoardFolder) {
    const isEditing = editingFolderId === folder.id
    const dropKey = `folder:${folder.id}`
    const isDragOver = dragOverTarget === dropKey

    return (
      <div
        key={folder.id}
        className={`board-picker-folder-row board-picker-explorer-row${isDragOver ? ' board-picker-folder-row--drag-over' : ''}`}
        draggable={!isEditing}
        onDragStart={(e) => {
          setDragData(e, { type: 'folder', id: folder.id })
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
        {isEditing ? (
          <div className="flex items-center gap-1 flex-1 min-w-0">
            <Folder size={14} className="flex-shrink-0 opacity-70" />
            <input
              className="board-picker-input"
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
            />
            <button
              type="button"
              className="board-picker-save-btn"
              onClick={() => commitRename(folder.id)}
              title="Save"
            >
              <Check size={14} />
            </button>
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
          value={pathDraft}
          onChange={(e) => setPathDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commitPath()
            }
            if (e.key === 'Escape') {
              e.preventDefault()
              setPathDraft(currentPath)
              ;(e.target as HTMLInputElement).blur()
            }
          }}
          onBlur={() => setPathDraft(currentPath)}
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
        {visibleFolders.map((f) => renderFolderRow(f))}
        {visibleBoards.map((b) => renderBoardRow(b))}
        {isEmpty && <div className="board-picker-empty">No saved boards</div>}
      </div>
      {menu && (
        <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={closeMenu} />
      )}
    </>
  )
}
