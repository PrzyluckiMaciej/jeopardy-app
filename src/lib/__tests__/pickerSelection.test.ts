import { describe, expect, it } from 'vitest'
import { pickerRenameConflictMessage, pickerSelectionKey } from '../pickerSelection'

describe('pickerSelectionKey', () => {
  it('joins kind and id', () => {
    expect(pickerSelectionKey('board', 'abc')).toBe('board:abc')
    expect(pickerSelectionKey('gameFolder', 'x')).toBe('gameFolder:x')
  })
})

describe('pickerRenameConflictMessage', () => {
  it('describes a single rename', () => {
    expect(
      pickerRenameConflictMessage([{ currentName: 'Quiz', uniqueName: 'Quiz (2)' }]),
    ).toBe('"Quiz" already exists here. It will be renamed to "Quiz (2)".')
  })

  it('lists multiple renames', () => {
    expect(
      pickerRenameConflictMessage([
        { currentName: 'A', uniqueName: 'A (2)' },
        { currentName: 'B', uniqueName: 'B (2)' },
      ]),
    ).toBe('Some items already exist in the destination. They will be renamed: "A" to "A (2)", "B" to "B (2)".')
  })
})
