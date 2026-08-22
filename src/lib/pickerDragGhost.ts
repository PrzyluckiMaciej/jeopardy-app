import type { DragEvent as ReactDragEvent } from 'react'

/** Create the off-screen element used as HTML5 drag preview. */
export function createPickerDragGhost(options: {
  count: number
  /** Name-row content for single-item drags. */
  sourceEl?: HTMLElement | null
}): HTMLElement {
  const ghost = document.createElement('div')

  if (options.count > 1) {
    ghost.className = 'board-picker-drag-ghost board-picker-drag-ghost--multi'
    ghost.setAttribute('aria-hidden', 'true')

    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    icon.setAttribute('viewBox', '0 0 24 24')
    icon.setAttribute('width', '16')
    icon.setAttribute('height', '16')
    icon.setAttribute('fill', 'none')
    icon.setAttribute('stroke', 'currentColor')
    icon.setAttribute('stroke-width', '2')
    icon.setAttribute('stroke-linecap', 'round')
    icon.setAttribute('stroke-linejoin', 'round')
    icon.setAttribute('aria-hidden', 'true')
    icon.classList.add('board-picker-drag-ghost__icon')
    // SquareStack — multiple selected items
    const path1 = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    path1.setAttribute('d', 'M4 10c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h4c1.1 0 2 .9 2 2')
    const path2 = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    path2.setAttribute('d', 'M10 16c-1.1 0-2-.9-2-2v-4c0-1.1.9-2 2-2h4c1.1 0 2 .9 2 2')
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    rect.setAttribute('width', '8')
    rect.setAttribute('height', '8')
    rect.setAttribute('x', '14')
    rect.setAttribute('y', '14')
    rect.setAttribute('rx', '2')
    icon.append(path1, path2, rect)

    const count = document.createElement('span')
    count.className = 'board-picker-drag-ghost__count'
    count.textContent = String(options.count)

    ghost.append(icon, count)
    return ghost
  }

  ghost.className = 'board-picker-drag-ghost'
  const dragImageEl = options.sourceEl
  if (dragImageEl) {
    const contentEl =
      dragImageEl.querySelector('.board-picker-board-btn, .board-picker-folder-row__btn') ??
      dragImageEl
    const source = contentEl instanceof HTMLElement ? contentEl : dragImageEl
    ghost.appendChild(source.cloneNode(true))
  }
  return ghost
}

export function setPickerDragImage(
  e: ReactDragEvent,
  ghost: HTMLElement,
  sourceEl?: HTMLElement | null,
): void {
  const dt = e.dataTransfer
  if (!dt) return
  document.body.appendChild(ghost)
  if (ghost.classList.contains('board-picker-drag-ghost--multi')) {
    const w = ghost.offsetWidth
    const h = ghost.offsetHeight
    dt.setDragImage(ghost, Math.round(w / 2), Math.round(h / 2))
    return
  }
  const contentEl =
    sourceEl?.querySelector('.board-picker-board-btn, .board-picker-folder-row__btn') ?? sourceEl
  const source = contentEl instanceof HTMLElement ? contentEl : sourceEl
  if (source) {
    const rect = source.getBoundingClientRect()
    dt.setDragImage(
      ghost,
      Math.min(Math.max(e.clientX - rect.left, 0), rect.width),
      Math.min(Math.max(e.clientY - rect.top, 0), rect.height),
    )
    return
  }
  dt.setDragImage(ghost, 16, 16)
}
