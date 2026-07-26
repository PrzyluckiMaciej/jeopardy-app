import { useCallback, useEffect, useMemo, useState, type DragEvent, type MouseEvent } from 'react'
import { Check, ChevronDown, ChevronRight, CopyPlus, Folder, FolderOpen, Trash2 } from 'lucide-react'
import type { Board, BoardFolder } from '../types'
import { useBoardStore } from '../store/gameStore'
import ContextMenu, { type ContextMenuItem } from './ContextMenu'

const DND_MIME = 'application/x-jeopardy-picker'

type DragPayload =
  | { type: 'board'; id: string }
  | { type: 'folder'; id: string }

interface Props {
  boards: Board[]
  folders: BoardFolder[]
  onSelectBoard: (board: Board) => void
  onEditBoard: (board: Board) => void
  onDeleteBoard: (board: Board) => void
  onDuplicateBoard: (board: Board) => void
  onRequestDeleteFolder: (folder: BoardFolder) => void
  /** When set, start inline rename for this folder id (e.g. after create). */
  renameFolderId?: string | null
  onRenameFolderIdChange?: (id: string | null) => void
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

export default function BoardPickerTree({
  boards,
  folders,
  onSelectBoard,
  onEditBoard,
  onDeleteBoard,
  onDuplicateBoard,
  onRequestDeleteFolder,
  renameFolderId: controlledRenameId,
  onRenameFolderIdChange,
}: Props) {
  const moveBoardToFolder = useBoardStore((s) => s.moveBoardToFolder)
  const moveFolder = useBoardStore((s) => s.moveFolder)
  const renameFolder = useBoardStore((s) => s.renameFolder)
  const createFolder = useBoardStore((s) => s.createFolder)

  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  const [dragOverTarget, setDragOverTarget] = useState<string | null>(null)
  const [activeDrag, setActiveDrag] = useState<DragPayload | null>(null)
  const [internalRenameId, setInternalRenameId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [menu, setMenu] = useState<{
    x: number
    y: number
    items: ContextMenuItem[]
  } | null>(null)

  const editingFolderId = controlledRenameId !== undefined ? controlledRenameId : internalRenameId

  useEffect(() => {
    if (editingFolderId) {
      const folder = folders.find((f) => f.id === editingFolderId)
      if (folder) setRenameValue(folder.name)
    }
  }, [editingFolderId, folders])

  const setEditingFolderId = useCallback(
    (id: string | null, name?: string) => {
      if (onRenameFolderIdChange) {
        onRenameFolderIdChange(id)
      } else {
        setInternalRenameId(id)
      }
      if (id && name !== undefined) setRenameValue(name)
      else if (!id) setRenameValue('')
    },
    [onRenameFolderIdChange]
  )

  const childFolders = useMemo(() => {
    const map = new Map<string | null, BoardFolder[]>()
    for (const f of folders) {
      const key = f.parentId
      const list = map.get(key) ?? []
      list.push(f)
      map.set(key, list)
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.name.localeCompare(b.name))
    }
    return map
  }, [folders])

  const childBoards = useMemo(() => {
    const map = new Map<string | null, Board[]>()
    for (const b of boards) {
      const key = b.folderId ?? null
      const list = map.get(key) ?? []
      list.push(b)
      map.set(key, list)
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.name.localeCompare(b.name))
    }
    return map
  }, [boards])

  function toggleCollapsed(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
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
          id: 'new-folder',
          label: 'New Folder',
          onSelect: () => {
            const id = createFolder('New Folder', null)
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
          id: 'rename',
          label: 'Rename',
          onSelect: () => setEditingFolderId(folder.id, folder.name),
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
          id: 'delete',
          label: 'Delete',
          danger: true,
          onSelect: () => onDeleteBoard(board),
        },
      ],
    })
  }

  function commitRename(folderId: string) {
    const name = renameValue.trim()
    if (name) renameFolder(folderId, name)
    setEditingFolderId(null)
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

  function handleDropOnRoot(e: DragEvent) {
    e.preventDefault()
    const payload = activeDrag ?? parseDragPayload(e)
    clearDrag()
    if (!payload) return
    if (payload.type === 'board') {
      moveBoardToFolder(payload.id, null)
    } else {
      moveFolder(payload.id, null)
    }
  }

  function renderBoardRow(board: Board, depth: number) {
    return (
      <div
        key={board.id}
        className="board-picker-board-row board-picker-tree-row"
        style={{ paddingLeft: depth * 16 }}
        draggable
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
        onContextMenu={(e) => openBoardMenu(e, board)}
      >
        <button
          type="button"
          className="board-picker-board-btn"
          onClick={() => onSelectBoard(board)}
        >
          <span className="font-condensed font-bold">{board.name}</span>
        </button>
        <div className="board-picker-board-row__actions">
          <button
            type="button"
            className="board-picker-icon-btn"
            title="Duplicate board"
            onClick={(e) => {
              e.stopPropagation()
              void onDuplicateBoard(board)
            }}
          >
            <CopyPlus size={11} />
          </button>
          <button
            type="button"
            className="board-picker-delete-btn"
            title="Delete board"
            onClick={(e) => {
              e.stopPropagation()
              onDeleteBoard(board)
            }}
          >
            <Trash2 size={11} />
          </button>
        </div>
      </div>
    )
  }

  function renderFolder(folder: BoardFolder, depth: number) {
    const isCollapsed = collapsed.has(folder.id)
    const isEditing = editingFolderId === folder.id
    const dropKey = `folder:${folder.id}`
    const isDragOver = dragOverTarget === dropKey
    const nestedFolders = childFolders.get(folder.id) ?? []
    const nestedBoards = childBoards.get(folder.id) ?? []

    return (
      <div key={folder.id} className="board-picker-tree-folder">
        <div
          className={`board-picker-folder-row${isDragOver ? ' board-picker-folder-row--drag-over' : ''}`}
          style={{ paddingLeft: depth * 16 }}
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
          <button
            type="button"
            className="board-picker-tree-chevron"
            onClick={() => toggleCollapsed(folder.id)}
            aria-label={isCollapsed ? 'Expand folder' : 'Collapse folder'}
          >
            {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
          </button>
          {isEditing ? (
            <div className="flex items-center gap-1 flex-1 min-w-0">
              <FolderOpen size={14} className="flex-shrink-0 opacity-70" />
              <input
                className="board-picker-input"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
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
              onClick={() => toggleCollapsed(folder.id)}
            >
              {isCollapsed ? (
                <Folder size={14} className="flex-shrink-0 opacity-70" />
              ) : (
                <FolderOpen size={14} className="flex-shrink-0 opacity-70" />
              )}
              <span className="truncate">{folder.name}</span>
            </button>
          )}
        </div>
        {!isCollapsed && (
          <div className="board-picker-tree-children">
            {nestedFolders.map((f) => renderFolder(f, depth + 1))}
            {nestedBoards.map((b) => renderBoardRow(b, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  const rootFolders = childFolders.get(null) ?? []
  const rootBoards = childBoards.get(null) ?? []
  const isEmpty = rootFolders.length === 0 && rootBoards.length === 0
  const rootDragOver = dragOverTarget === 'root'

  return (
    <>
      <div
        className={`board-picker-boards__scroll board-picker-tree${rootDragOver ? ' board-picker-tree--drag-over' : ''}`}
        onContextMenu={openEmptyMenu}
        onDragOver={(e) => {
          e.preventDefault()
          e.dataTransfer.dropEffect = 'move'
          setDragOverTarget('root')
        }}
        onDragLeave={(e) => {
          if (e.currentTarget === e.target) {
            setDragOverTarget((cur) => (cur === 'root' ? null : cur))
          }
        }}
        onDrop={handleDropOnRoot}
      >
        {rootFolders.map((f) => renderFolder(f, 0))}
        {rootBoards.map((b) => renderBoardRow(b, 0))}
        {isEmpty && <div className="board-picker-empty">No saved boards</div>}
      </div>
      {menu && (
        <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={closeMenu} />
      )}
    </>
  )
}
