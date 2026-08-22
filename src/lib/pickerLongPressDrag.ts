import type { PickerNavDropTarget } from './pickerDnD'

export const PICKER_LONG_PRESS_MS = 450
export const PICKER_LONG_PRESS_MOVE_CANCEL_PX = 12

export type PickerPointerDropHit =
  | { kind: 'nav'; target: PickerNavDropTarget }
  | { kind: 'folder'; id: string }
  | { kind: 'parent' }
  | { kind: 'list' }

/** Resolve drop target under the pointer, ignoring the floating drag ghost. */
export function hitTestPickerPointerDrop(
  clientX: number,
  clientY: number,
  ghostEl?: HTMLElement | null,
): PickerPointerDropHit | null {
  const prevVisibility = ghostEl?.style.visibility
  if (ghostEl) ghostEl.style.visibility = 'hidden'
  const el = document.elementFromPoint(clientX, clientY)
  if (ghostEl) ghostEl.style.visibility = prevVisibility ?? ''

  if (!(el instanceof Element)) return null

  const nav = el.closest('[data-picker-nav-drop]')
  if (nav) {
    const target = nav.getAttribute('data-picker-nav-drop')
    if (target === 'boards' || target === 'games' || target === 'trash') {
      return { kind: 'nav', target }
    }
  }

  const folder = el.closest('[data-picker-drop-folder]')
  if (folder) {
    const id = folder.getAttribute('data-picker-drop-folder')
    if (id) return { kind: 'folder', id }
  }

  if (el.closest('[data-picker-drop-parent]')) return { kind: 'parent' }
  if (el.closest('[data-picker-drop-list]')) return { kind: 'list' }
  return null
}

export function isPickerLongPressIgnoredTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return true
  // Name / open controls fill the row — allow long-press there.
  if (target.closest('.board-picker-board-btn, .board-picker-folder-row__btn')) {
    return false
  }
  return !!target.closest(
    'button, input, a, label, textarea, select, [role="checkbox"], .picker-checkbox, .board-picker-drag-handle',
  )
}
