/** MIME for board / final / board-folder drags (internal folder moves + nav drops). */
export const BOARDS_DND_MIME = 'application/x-jeopardy-picker'

/** MIME for game / game-folder drags. */
export const GAMES_DND_MIME = 'application/x-jeopardy-games-picker'

export type PickerNavDragItem =
  | { type: 'board'; id: string }
  | { type: 'folder'; id: string }
  | { type: 'game'; id: string }

/** Payload notified to HostPage while a picker item is being dragged. */
export type PickerNavDragPayload =
  | {
      domain: 'boards'
      type: 'board' | 'folder'
      id: string
      /** All items in the drag; defaults to `[{ type, id }]` when omitted. */
      items?: Array<{ type: 'board' | 'folder'; id: string }>
    }
  | {
      domain: 'games'
      type: 'game' | 'folder'
      id: string
      items?: Array<{ type: 'game' | 'folder'; id: string }>
    }

export type PickerNavDropTarget = 'boards' | 'games' | 'trash'

export interface PickerNavTrashedLookup {
  isTrashed: (payload: PickerNavDragPayload) => boolean
}

/** Resolve the full item list for a nav drag (supports multi-select). */
export function pickerNavDragItems(
  payload: PickerNavDragPayload,
): Array<{ type: 'board' | 'folder' | 'game'; id: string }> {
  if (payload.items && payload.items.length > 0) {
    return payload.items
  }
  return [{ type: payload.type, id: payload.id }]
}

/**
 * Whether dropping `payload` on a system nav tab is allowed.
 * Trash accepts live (non-trashed) items; Boards/Games accept only trashed items of that domain.
 */
export function canDropPickerOnNav(
  target: PickerNavDropTarget,
  payload: PickerNavDragPayload | null,
  lookup: PickerNavTrashedLookup,
): boolean {
  if (!payload) return false
  const trashed = lookup.isTrashed(payload)
  if (target === 'trash') return !trashed
  if (target === 'boards') return payload.domain === 'boards' && trashed
  if (target === 'games') return payload.domain === 'games' && trashed
  return false
}
