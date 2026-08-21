import type { Board } from '../types'
import { isFinalBoard } from './utils'

export type PickerItemType = 'folder' | 'game' | 'board' | 'final'
export type PickerTypeSortContext = 'boards' | 'games' | 'trash'
export type PickerSortKey = 'name' | 'type' | 'createdAt' | 'updatedAt'
export type PickerSortDir = 'asc' | 'desc'
export type PickerEntryKind = 'folder' | 'gameFolder' | 'game' | 'board'

export const PICKER_ITEM_TYPE_LABELS: Record<PickerItemType, string> = {
  folder: 'Folder',
  game: 'Game',
  board: 'Board',
  final: 'Final Jeopardy',
}

const RANK: Record<PickerTypeSortContext, readonly PickerItemType[]> = {
  boards: ['folder', 'board', 'final'],
  games: ['folder', 'game'],
  trash: ['folder', 'game', 'board', 'final'],
}

export type PickerCreateContext = 'boards' | 'games'

export function pickerCreatableTypes(context: PickerCreateContext): readonly PickerItemType[] {
  return RANK[context]
}

export interface PickerSortRow {
  name: string
  type: PickerItemType
  createdAt?: number
  updatedAt?: number
}

export function pickerItemTypeLabel(type: PickerItemType): string {
  return PICKER_ITEM_TYPE_LABELS[type]
}

export function pickerItemTypeRank(type: PickerItemType, context: PickerTypeSortContext): number {
  const idx = RANK[context].indexOf(type)
  return idx === -1 ? RANK[context].length : idx
}

export function pickerItemTypeFromBoard(board: Pick<Board, 'kind'> | null | undefined): PickerItemType {
  return isFinalBoard(board) ? 'final' : 'board'
}

export function pickerItemTypeFromKind(
  kind: PickerEntryKind,
  board?: Pick<Board, 'kind'> | null,
): PickerItemType {
  if (kind === 'folder' || kind === 'gameFolder') return 'folder'
  if (kind === 'game') return 'game'
  return pickerItemTypeFromBoard(board)
}

function compareOptionalTime(
  a: number | null | undefined,
  b: number | null | undefined,
  dir: PickerSortDir,
): number {
  const aMissing = a == null || !Number.isFinite(a)
  const bMissing = b == null || !Number.isFinite(b)
  if (aMissing && bMissing) return 0
  if (aMissing) return 1
  if (bMissing) return -1
  const cmp = a - b
  return dir === 'asc' ? cmp : -cmp
}

export function comparePickerRows(
  a: PickerSortRow,
  b: PickerSortRow,
  key: PickerSortKey,
  dir: PickerSortDir,
  context: PickerTypeSortContext,
): number {
  if (key === 'name') {
    const cmp = a.name.localeCompare(b.name)
    return dir === 'asc' ? cmp : -cmp
  }
  if (key === 'type') {
    const cmp = pickerItemTypeRank(a.type, context) - pickerItemTypeRank(b.type, context)
    const ordered = dir === 'asc' ? cmp : -cmp
    if (ordered !== 0) return ordered
    return a.name.localeCompare(b.name)
  }
  const cmp = compareOptionalTime(a[key], b[key], dir)
  if (cmp !== 0) return cmp
  return a.name.localeCompare(b.name)
}
