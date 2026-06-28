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

export function computeOverlayTextMaxPx(
  width: number,
  heightBudget: number,
  hasMedia = false,
): number {
  if (width <= 0 || heightBudget <= 0) return OVERLAY_TEXT_MIN_PX
  const heightFactor = hasMedia ? 0.16 : 0.28
  const widthFactor = hasMedia ? 0.055 : 0.09
  const cap = hasMedia ? 36 : 56
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
