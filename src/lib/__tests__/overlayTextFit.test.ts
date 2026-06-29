import {
  computeMediaReservedHeight,
  computeOverlayTextBudget,
  computeOverlayTextMaxPx,
  findLargestFittingFontSize,
  heightsFitBudget,
  OVERLAY_TEXT_MIN_PX,
} from '../overlayTextFit'

describe('computeMediaReservedHeight', () => {
  it('reserves a substantial share on mobile', () => {
    const reserved = computeMediaReservedHeight(500, true)
    expect(reserved).toBeGreaterThanOrEqual(128)
    expect(reserved).toBeLessThanOrEqual(200)
  })

  it('reserves more on desktop', () => {
    const reserved = computeMediaReservedHeight(800, false)
    expect(reserved).toBeGreaterThanOrEqual(190)
  })
})

describe('computeOverlayTextBudget', () => {
  it('subtracts measured media content height when provided', () => {
    const estimated = computeOverlayTextBudget({
      containerHeight: 500,
      containerWidth: 360,
      hasMedia: true,
      flexGap: 8,
      isMobile: true,
    })
    const withSmallMedia = computeOverlayTextBudget({
      containerHeight: 500,
      containerWidth: 360,
      hasMedia: true,
      flexGap: 8,
      isMobile: true,
      mediaHeight: 72,
    })
    expect(withSmallMedia).toBeGreaterThan(estimated)
    expect(withSmallMedia).toBeGreaterThan(40)
  })

  it('allows more text budget without media on mobile', () => {
    const withMedia = computeOverlayTextBudget({
      containerHeight: 500,
      containerWidth: 360,
      hasMedia: true,
      isMobile: true,
    })
    const withoutMedia = computeOverlayTextBudget({
      containerHeight: 500,
      hasMedia: false,
      isMobile: true,
    })
    expect(withoutMedia).toBeGreaterThan(withMedia)
  })
})

describe('computeOverlayTextMaxPx', () => {
  it('returns min when budget or width is zero', () => {
    expect(computeOverlayTextMaxPx(0, 400)).toBe(OVERLAY_TEXT_MIN_PX)
    expect(computeOverlayTextMaxPx(400, 0)).toBe(OVERLAY_TEXT_MIN_PX)
  })

  it('caps by height, width, and absolute max', () => {
    expect(computeOverlayTextMaxPx(2000, 2000)).toBe(64)
    expect(computeOverlayTextMaxPx(2000, 2000, true)).toBe(46)
    expect(computeOverlayTextMaxPx(100, 100)).toBeLessThanOrEqual(64)
  })

  it('allows larger type for short strings', () => {
    const short = computeOverlayTextMaxPx(400, 300, false, 4)
    const long = computeOverlayTextMaxPx(400, 300, false, 80)
    expect(short).toBeGreaterThan(long)
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
