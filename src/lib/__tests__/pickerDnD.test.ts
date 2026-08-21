import { describe, expect, it } from 'vitest'
import { canDropPickerOnNav, type PickerNavDragPayload } from '../pickerDnD'

const live = { isTrashed: () => false }
const trashed = { isTrashed: () => true }

const boardPayload: PickerNavDragPayload = { domain: 'boards', type: 'board', id: 'b1' }
const boardFolderPayload: PickerNavDragPayload = { domain: 'boards', type: 'folder', id: 'bf1' }
const gamePayload: PickerNavDragPayload = { domain: 'games', type: 'game', id: 'g1' }
const gameFolderPayload: PickerNavDragPayload = { domain: 'games', type: 'folder', id: 'gf1' }

describe('canDropPickerOnNav', () => {
  it('rejects null payload', () => {
    expect(canDropPickerOnNav('trash', null, live)).toBe(false)
  })

  it('allows live items on trash only', () => {
    expect(canDropPickerOnNav('trash', boardPayload, live)).toBe(true)
    expect(canDropPickerOnNav('trash', gamePayload, live)).toBe(true)
    expect(canDropPickerOnNav('boards', boardPayload, live)).toBe(false)
    expect(canDropPickerOnNav('games', gamePayload, live)).toBe(false)
  })

  it('rejects already-trashed items on trash', () => {
    expect(canDropPickerOnNav('trash', boardPayload, trashed)).toBe(false)
  })

  it('restores boards domain only onto Boards', () => {
    expect(canDropPickerOnNav('boards', boardPayload, trashed)).toBe(true)
    expect(canDropPickerOnNav('boards', boardFolderPayload, trashed)).toBe(true)
    expect(canDropPickerOnNav('boards', gamePayload, trashed)).toBe(false)
    expect(canDropPickerOnNav('boards', gameFolderPayload, trashed)).toBe(false)
  })

  it('restores games domain only onto Games', () => {
    expect(canDropPickerOnNav('games', gamePayload, trashed)).toBe(true)
    expect(canDropPickerOnNav('games', gameFolderPayload, trashed)).toBe(true)
    expect(canDropPickerOnNav('games', boardPayload, trashed)).toBe(false)
    expect(canDropPickerOnNav('games', boardFolderPayload, trashed)).toBe(false)
  })
})
