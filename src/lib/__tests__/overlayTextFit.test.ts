import {
  computeOverlayTextMaxPx,
  findLargestFittingFontSize,
  heightsFitBudget,
  OVERLAY_TEXT_MIN_PX,
} from '../overlayTextFit'

describe('computeOverlayTextMaxPx', () => {
  it('returns min when budget or width is zero', () => {
    expect(computeOverlayTextMaxPx(0, 400)).toBe(OVERLAY_TEXT_MIN_PX)
    expect(computeOverlayTextMaxPx(400, 0)).toBe(OVERLAY_TEXT_MIN_PX)
  })

  it('caps by height, width, and absolute max', () => {
    expect(computeOverlayTextMaxPx(2000, 2000)).toBe(56)
    expect(computeOverlayTextMaxPx(2000, 2000, true)).toBe(36)
    expect(computeOverlayTextMaxPx(100, 100)).toBeLessThanOrEqual(56)
  })
})

describe('findLargestFittingFontSize', () => {
  const base = {
    clue: 'Short clue',
    answer: 'Short answer',
    width: 400,
    heightBudget: 200,
    textGap: 8,
    minPx: 14,
    maxPx: 48,
  }

  it('returns a larger size for short strings within budget', () => {
    const size = findLargestFittingFontSize({
      ...base,
      measureHeights: (fontSizePx) => ({
        clueHeight: fontSizePx * 1.2,
        answerHeight: fontSizePx * 1.2 + 24,
      }),
    })
    expect(size).toBeGreaterThan(30)
  })

  it('returns a smaller size for long strings', () => {
    const shortSize = findLargestFittingFontSize({
      ...base,
      measureHeights: (fontSizePx) => ({
        clueHeight: fontSizePx,
        answerHeight: fontSizePx + 16,
      }),
    })
    const longSize = findLargestFittingFontSize({
      ...base,
      measureHeights: (fontSizePx) => ({
        clueHeight: fontSizePx * 4,
        answerHeight: fontSizePx * 3 + 16,
      }),
    })
    expect(longSize).toBeLessThan(shortSize)
  })

  it('returns minPx when nothing fits', () => {
    const size = findLargestFittingFontSize({
      ...base,
      heightBudget: 20,
      maxPx: 48,
      measureHeights: () => ({
        clueHeight: 100,
        answerHeight: 100,
      }),
    })
    expect(size).toBe(OVERLAY_TEXT_MIN_PX)
  })

  it('requires combined clue and answer height to fit', () => {
    const fits = heightsFitBudget({ clueHeight: 60, answerHeight: 50 }, 120, 8)
    expect(fits).toBe(true)
    const noFit = heightsFitBudget({ clueHeight: 80, answerHeight: 50 }, 120, 8)
    expect(noFit).toBe(false)
  })
})
