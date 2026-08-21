import { describe, expect, it } from 'vitest'
import {
  comparePickerRows,
  pickerItemTypeFromBoard,
  pickerItemTypeFromKind,
  pickerItemTypeLabel,
  pickerItemTypeRank,
  type PickerSortRow,
} from '../pickerItemType'

function row(partial: Partial<PickerSortRow> & Pick<PickerSortRow, 'name' | 'type'>): PickerSortRow {
  return partial
}

describe('pickerItemTypeLabel', () => {
  it('returns display labels for each type', () => {
    expect(pickerItemTypeLabel('folder')).toBe('Folder')
    expect(pickerItemTypeLabel('game')).toBe('Game')
    expect(pickerItemTypeLabel('board')).toBe('Board')
    expect(pickerItemTypeLabel('final')).toBe('Final Jeopardy')
  })
})

describe('pickerItemTypeFromKind / pickerItemTypeFromBoard', () => {
  it('maps folder kinds and games', () => {
    expect(pickerItemTypeFromKind('folder')).toBe('folder')
    expect(pickerItemTypeFromKind('gameFolder')).toBe('folder')
    expect(pickerItemTypeFromKind('game')).toBe('game')
  })

  it('maps boards vs final jeopardy', () => {
    expect(pickerItemTypeFromBoard({ kind: 'board' })).toBe('board')
    expect(pickerItemTypeFromBoard({ kind: 'final' })).toBe('final')
    expect(pickerItemTypeFromBoard({})).toBe('board')
    expect(pickerItemTypeFromKind('board', { kind: 'final' })).toBe('final')
    expect(pickerItemTypeFromKind('board', { kind: 'board' })).toBe('board')
  })
})

describe('pickerItemTypeRank', () => {
  it('orders boards tab as folder -> board -> final', () => {
    expect(pickerItemTypeRank('folder', 'boards')).toBeLessThan(pickerItemTypeRank('board', 'boards'))
    expect(pickerItemTypeRank('board', 'boards')).toBeLessThan(pickerItemTypeRank('final', 'boards'))
  })

  it('orders games tab as folder -> game', () => {
    expect(pickerItemTypeRank('folder', 'games')).toBeLessThan(pickerItemTypeRank('game', 'games'))
  })

  it('orders trash tab as folder -> game -> board -> final', () => {
    expect(pickerItemTypeRank('folder', 'trash')).toBeLessThan(pickerItemTypeRank('game', 'trash'))
    expect(pickerItemTypeRank('game', 'trash')).toBeLessThan(pickerItemTypeRank('board', 'trash'))
    expect(pickerItemTypeRank('board', 'trash')).toBeLessThan(pickerItemTypeRank('final', 'trash'))
  })
})

describe('comparePickerRows', () => {
  const folderA = row({ name: 'Alpha', type: 'folder' })
  const folderZ = row({ name: 'Zulu', type: 'folder' })
  const board = row({ name: 'Board', type: 'board' })
  const final = row({ name: 'Final', type: 'final' })
  const game = row({ name: 'Game', type: 'game' })

  it('sorts boards context by type then name', () => {
    const items = [final, board, folderZ, folderA]
    items.sort((a, b) => comparePickerRows(a, b, 'type', 'asc', 'boards'))
    expect(items.map((i) => i.name)).toEqual(['Alpha', 'Zulu', 'Board', 'Final'])
  })

  it('reverses type order when descending', () => {
    const items = [folderA, board, final]
    items.sort((a, b) => comparePickerRows(a, b, 'type', 'desc', 'boards'))
    expect(items.map((i) => i.name)).toEqual(['Final', 'Board', 'Alpha'])
  })

  it('sorts games context as folder then game', () => {
    const items = [game, folderA]
    items.sort((a, b) => comparePickerRows(a, b, 'type', 'asc', 'games'))
    expect(items.map((i) => i.name)).toEqual(['Alpha', 'Game'])
  })

  it('sorts trash context as folder -> game -> board -> final', () => {
    const items = [final, board, game, folderA]
    items.sort((a, b) => comparePickerRows(a, b, 'type', 'asc', 'trash'))
    expect(items.map((i) => i.name)).toEqual(['Alpha', 'Game', 'Board', 'Final'])
  })

  it('uses name as a type-sort tiebreaker', () => {
    const items = [folderZ, folderA]
    items.sort((a, b) => comparePickerRows(a, b, 'type', 'asc', 'boards'))
    expect(items.map((i) => i.name)).toEqual(['Alpha', 'Zulu'])
  })
})
