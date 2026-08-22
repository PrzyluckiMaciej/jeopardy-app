import { useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, LayoutGrid, Search, Trophy } from 'lucide-react'
import type { Board, BoardFolder } from '../types'
import { buildPathString } from '../lib/folderPath'
import {
  comparePickerRows,
  pickerItemTypeFromBoard,
  pickerItemTypeLabel,
  type PickerSortDir,
  type PickerSortKey,
} from '../lib/pickerItemType'
import { formatBoardTimestamp, isFinalBoard } from '../lib/utils'

interface Props {
  boards: Board[]
  folders: BoardFolder[]
  onAdd: (boardId: string) => void
}

export default function AddBoardToGameList({ boards, folders, onAdd }: Props) {
  const [searchQuery, setSearchQuery] = useState('')
  const [sortKey, setSortKey] = useState<PickerSortKey>('type')
  const [sortDir, setSortDir] = useState<PickerSortDir>('asc')

  const boardPaths = useMemo(() => {
    const map = new Map<string, string>()
    for (const board of boards) {
      map.set(board.id, buildPathString(folders, board.folderId ?? null))
    }
    return map
  }, [boards, folders])

  const visibleBoards = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    const filtered = query
      ? boards.filter((b) => b.name.toLowerCase().includes(query))
      : boards
    return [...filtered].sort((a, b) =>
      comparePickerRows(
        {
          name: a.name,
          type: pickerItemTypeFromBoard(a),
          createdAt: a.createdAt,
          updatedAt: a.updatedAt,
        },
        {
          name: b.name,
          type: pickerItemTypeFromBoard(b),
          createdAt: b.createdAt,
          updatedAt: b.updatedAt,
        },
        sortKey,
        sortDir,
        'boards',
      ),
    )
  }, [boards, searchQuery, sortKey, sortDir])

  if (boards.length === 0) return null

  function toggleSort(key: PickerSortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  function renderSortHeader(key: PickerSortKey, label: string, className: string) {
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

  return (
    <div className="mt-2">
      <div className="board-picker-section-label text-muted">Add to game</div>
      <div className="board-picker-add-board-search">
        <Search size={14} className="board-picker-add-board-search__icon" aria-hidden />
        <input
          type="search"
          className="board-picker-add-board-search__input"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search boards by name"
          aria-label="Search boards by name"
          spellCheck={false}
        />
      </div>
      <div className="board-picker-add-board-list">
        <div className="board-picker-add-board-header board-picker-explorer-header">
          {renderSortHeader('name', 'Name', 'board-picker-explorer-header__name')}
          {renderSortHeader('type', 'Type', 'board-picker-explorer-header__type')}
          {renderSortHeader('createdAt', 'Created at', 'board-picker-explorer-header__date')}
          {renderSortHeader('updatedAt', 'Last modified at', 'board-picker-explorer-header__date')}
          <span className="board-picker-add-board-header__action" aria-hidden />
        </div>
        {visibleBoards.length === 0 ? (
          <div className="board-picker-empty">No boards match your search</div>
        ) : (
          visibleBoards.map((board) => {
            const path = boardPaths.get(board.id) ?? '/'
            const type = pickerItemTypeFromBoard(board)
            return (
              <div key={board.id} className="board-picker-add-board-row">
                <div className="board-picker-add-board-row__name">
                  {isFinalBoard(board) ? (
                    <Trophy size={14} className="board-picker-object-icon board-picker-object-icon--final flex-shrink-0" />
                  ) : (
                    <LayoutGrid size={14} className="board-picker-object-icon board-picker-object-icon--board flex-shrink-0" />
                  )}
                  <span className="board-picker-add-board-row__text">
                    <span className="font-condensed font-bold">{board.name}</span>
                    <span className="board-picker-add-board-row__path" title={path}>
                      {path}
                    </span>
                  </span>
                </div>
                <span className="board-picker-explorer-row__type">{pickerItemTypeLabel(type)}</span>
                <span className="board-picker-explorer-row__date">{formatBoardTimestamp(board.createdAt)}</span>
                <span className="board-picker-explorer-row__date">{formatBoardTimestamp(board.updatedAt)}</span>
                <div className="board-picker-add-board-row__action">
                  <button
                    type="button"
                    className="board-picker-add-btn"
                    onClick={() => onAdd(board.id)}
                  >
                    + Add
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
