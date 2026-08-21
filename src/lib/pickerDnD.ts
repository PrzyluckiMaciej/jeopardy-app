/** MIME for board / final / board-folder drags (internal folder moves + nav drops). */
export const BOARDS_DND_MIME = 'application/x-jeopardy-picker'

/** MIME for game / game-folder drags. */
export const GAMES_DND_MIME = 'application/x-jeopardy-games-picker'

/** Payload notified to HostPage while a picker item is being dragged. */
export type PickerNavDragPayload =
  | { domain: 'boards'; type: 'board' | 'folder'; id: string }
  | { domain: 'games'; type: 'game' | 'folder'; id: string }

export type PickerNavDropTarget = 'boards' | 'games' | 'trash'

export interface PickerNavTrashedLookup {
  isTrashed: (payload: PickerNavDragPayload) => boolean
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
