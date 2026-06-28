export const OVERLAY_TEXT_MIN_PX = 14
export const OVERLAY_TEXT_MAX_CAP_PX = 72

export interface OverlayTextHeights {
  clueHeight: number
  answerHeight: number
}

export interface FindLargestFittingFontSizeParams {
  clue: string
  answer: string
  width: number
  heightBudget: number
  textGap: number
  minPx?: number
  maxPx: number
  measureHeights: (fontSizePx: number) => OverlayTextHeights
}

function isMobileViewport(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(max-width: 767px)').matches
  )
}

/** Vertical space reserved for the media row when fitting overlay text. */
export function computeMediaReservedHeight(
  containerHeight: number,
  isMobile = isMobileViewport(),
): number {
  if (containerHeight <= 0) return 0
  if (!isMobile) {
    const minH = Math.max(144, containerHeight * 0.28)
    const targetH = containerHeight * 0.38
    const maxH = containerHeight * 0.52
    return Math.min(maxH, Math.max(minH, targetH))
  }
  const vh = typeof window !== 'undefined' ? window.innerHeight : containerHeight
  const gridMin = Math.min(containerHeight * 0.34, Math.max(112, vh * 0.24))
  const mediaTarget = Math.min(containerHeight * 0.36, Math.max(128, vh * 0.26))
  return Math.max(gridMin, mediaTarget)
}

export interface OverlayTextBudgetParams {
  containerHeight: number
  hasMedia: boolean
  reservedHeight?: number
  flexGap?: number
  isMobile?: boolean
}

/** Height available for clue + answer after reserving media and other overhead. */
export function computeOverlayTextBudget({
  containerHeight,
  hasMedia,
  reservedHeight = 0,
  flexGap = 0,
  isMobile = isMobileViewport(),
}: OverlayTextBudgetParams): number {
  if (containerHeight <= 0) return 40

  let overhead = reservedHeight
  if (reservedHeight > 0) overhead += flexGap
  if (hasMedia) {
    overhead += computeMediaReservedHeight(containerHeight, isMobile) + flexGap * 2
  }

  let budget = Math.max(40, containerHeight - overhead)
  if (isMobile && hasMedia) {
    budget = Math.min(budget, Math.floor(containerHeight * 0.38))
  }
  return budget
}

export function computeOverlayTextMaxPx(
  width: number,
  heightBudget: number,
  hasMedia = false,
): number {
  if (width <= 0 || heightBudget <= 0) return OVERLAY_TEXT_MIN_PX
  const isMobile = isMobileViewport()
  const heightFactor = hasMedia ? (isMobile ? 0.2 : 0.16) : isMobile ? 0.36 : 0.28
  const widthFactor = hasMedia ? (isMobile ? 0.088 : 0.055) : isMobile ? 0.14 : 0.09
  const cap = hasMedia ? (isMobile ? 42 : 36) : isMobile ? 72 : 56
  return Math.max(
    OVERLAY_TEXT_MIN_PX,
    Math.min(heightBudget * heightFactor, width * widthFactor, cap),
  )
}

export function heightsFitBudget(
  heights: OverlayTextHeights,
  heightBudget: number,
  textGap: number,
): boolean {
  return heights.clueHeight + heights.answerHeight + textGap <= heightBudget
}

export function findLargestFittingFontSize({
  heightBudget,
  textGap,
  minPx = OVERLAY_TEXT_MIN_PX,
  maxPx,
  measureHeights,
}: FindLargestFittingFontSizeParams): number {
  if (heightBudget <= 0 || maxPx < minPx) return minPx

  let low = minPx
  let high = maxPx
  let best = minPx

  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    const heights = measureHeights(mid)
    if (heightsFitBudget(heights, heightBudget, textGap)) {
      best = mid
      low = mid + 1
    } else {
      high = mid - 1
    }
  }

  return best
}
