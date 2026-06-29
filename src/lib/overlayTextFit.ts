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

/** Estimated intrinsic media height before content has rendered (flex layout). */
export function estimateMediaContentHeight(
  containerWidth: number,
  containerHeight: number,
  isMobile = isMobileViewport(),
): number {
  if (containerHeight <= 0) return 0
  const byAspect = containerWidth > 0 ? containerWidth * (9 / 16) : 0
  const cap = containerHeight * (isMobile ? 0.5 : 0.55)
  const floor = isMobile ? 80 : 100
  return Math.min(cap, Math.max(floor, byAspect))
}

export interface OverlayTextBudgetParams {
  containerHeight: number
  containerWidth?: number
  hasMedia: boolean
  reservedHeight?: number
  flexGap?: number
  isMobile?: boolean
  mediaHeight?: number
}

/** Height available for clue + answer after reserving media and other overhead. */
export function computeOverlayTextBudget({
  containerHeight,
  containerWidth = 0,
  hasMedia,
  reservedHeight = 0,
  flexGap = 0,
  isMobile = isMobileViewport(),
  mediaHeight = 0,
}: OverlayTextBudgetParams): number {
  if (containerHeight <= 0) return 40

  let overhead = reservedHeight
  if (reservedHeight > 0) overhead += flexGap
  if (hasMedia) {
    const estimate = estimateMediaContentHeight(containerWidth, containerHeight, isMobile)
    const raw = mediaHeight > 0 ? mediaHeight : estimate
    const cap = containerHeight * (isMobile ? 0.44 : 0.5)
    const reserved = Math.min(raw, cap)
    overhead += reserved + flexGap * 2
  }

  return Math.max(40, containerHeight - overhead)
}

function shortTextBoost(longestTextChars: number): number {
  if (longestTextChars <= 0) return 1
  if (longestTextChars <= 12) return 1.45
  if (longestTextChars <= 24) return 1.25
  if (longestTextChars <= 48) return 1.1
  return 1
}

export function computeOverlayTextMaxPx(
  width: number,
  heightBudget: number,
  hasMedia = false,
  longestTextChars = 0,
): number {
  if (width <= 0 || heightBudget <= 0) return OVERLAY_TEXT_MIN_PX
  const isMobile = isMobileViewport()
  const boost = shortTextBoost(longestTextChars)
  const heightFactor = hasMedia ? (isMobile ? 0.38 : 0.26) : isMobile ? 0.42 : 0.32
  const widthFactor = hasMedia ? (isMobile ? 0.14 : 0.08) : isMobile ? 0.16 : 0.11
  const cap = (hasMedia ? (isMobile ? 60 : 46) : isMobile ? 80 : 64) * boost
  return Math.max(
    OVERLAY_TEXT_MIN_PX,
    Math.min(heightBudget * heightFactor * boost, width * widthFactor * boost, cap),
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
