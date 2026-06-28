import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import {
  computeOverlayTextMaxPx,
  findLargestFittingFontSize,
  OVERLAY_TEXT_MIN_PX,
} from '../lib/overlayTextFit'

type MeasureKind = 'clue' | 'answer'

interface MeasurerElements {
  clue: HTMLDivElement
  answer: HTMLDivElement
}

function parsePx(value: string): number {
  const n = parseFloat(value)
  return Number.isFinite(n) ? n : 0
}

function getOverlayLineHeight(): number {
  if (typeof window === 'undefined') return 1.2
  return window.matchMedia('(min-width: 768px)').matches ? 1.2 : 1.375
}

function createMeasurer(kind: MeasureKind): HTMLDivElement {
  const el = document.createElement('div')
  el.style.position = 'absolute'
  el.style.visibility = 'hidden'
  el.style.pointerEvents = 'none'
  el.style.left = '-9999px'
  el.style.top = '0'
  el.style.boxSizing = 'border-box'
  el.style.fontFamily = "'Barlow Condensed', sans-serif"
  el.style.fontWeight = '700'
  el.style.textAlign = 'center'
  el.style.whiteSpace = 'normal'
  el.style.wordBreak = 'break-word'
  el.style.overflowWrap = 'break-word'

  if (kind === 'answer') {
    el.style.border = '2px solid transparent'
  }

  document.body.appendChild(el)
  return el
}

function getMeasurers(): MeasurerElements {
  const cache = (getMeasurers as typeof getMeasurers & { _cache?: MeasurerElements })._cache
  if (cache) return cache
  const next = {
    clue: createMeasurer('clue'),
    answer: createMeasurer('answer'),
  }
  ;(getMeasurers as typeof getMeasurers & { _cache?: MeasurerElements })._cache = next
  return next
}

function measureBlockHeight(
  kind: MeasureKind,
  text: string,
  width: number,
  fontSizePx: number,
): number {
  const { clue, answer } = getMeasurers()
  const el = kind === 'clue' ? clue : answer
  const lineHeight = getOverlayLineHeight()

  if (kind === 'answer') {
    el.style.display = 'inline-block'
    el.style.width = 'auto'
    el.style.maxWidth = `${width}px`
    el.style.padding = '4px 10px'
    el.style.lineHeight = '1.1'
  } else {
    el.style.display = 'block'
    el.style.width = `${width}px`
    el.style.maxWidth = ''
    el.style.padding = ''
  }
  el.style.fontSize = `${fontSizePx}px`
  if (kind !== 'answer') {
    el.style.lineHeight = String(lineHeight)
  }
  el.textContent = text

  return el.getBoundingClientRect().height
}

function getMediaReservedHeight(containerHeight: number): number {
  if (containerHeight <= 0) return 0
  const isDesktop = typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches
  const minH = isDesktop
    ? Math.max(144, containerHeight * 0.28)
    : Math.max(112, containerHeight * 0.24)
  const targetH = containerHeight * (isDesktop ? 0.38 : 0.3)
  const maxH = containerHeight * 0.52
  return Math.min(maxH, Math.max(minH, targetH))
}

function getMediaElement(container: HTMLElement): HTMLElement | null {
  return container.querySelector('.question-overlay-media')
}

interface Options {
  clue: string
  answer: string
  containerRef: RefObject<HTMLElement | null>
  clueRef: RefObject<HTMLElement | null>
  reservedHeight?: number
  enabled?: boolean
}

export function useOverlayTextFontSize({
  clue,
  answer,
  containerRef,
  clueRef,
  reservedHeight = 0,
  enabled = true,
}: Options): number | null {
  const [fontSizePx, setFontSizePx] = useState<number | null>(null)
  const frameRef = useRef<number | null>(null)
  const observedMediaRef = useRef<HTMLElement | null>(null)

  const recalculate = useCallback(() => {
    const container = containerRef.current
    if (!container || !enabled) return

    const width = container.clientWidth
    const containerHeight = container.clientHeight
    if (width <= 0 || containerHeight <= 0) return

    const styles = getComputedStyle(container)
    const flexGap = parsePx(styles.rowGap || styles.gap)
    const mediaEl = getMediaElement(container)
    const hasMedia = mediaEl != null

    let overhead = reservedHeight
    if (reservedHeight > 0) overhead += flexGap
    if (hasMedia) {
      overhead += getMediaReservedHeight(containerHeight) + flexGap * 2
    }

    const textBudget = Math.max(40, containerHeight - overhead)

    const textGap = hasMedia ? 0 : flexGap
    const clueText = clue.trim() || ' '
    const answerText = answer.trim() || '—'

    const measureAt = (size: number) => ({
      clueHeight: measureBlockHeight('clue', clueText, width, size),
      answerHeight: measureBlockHeight('answer', answerText, width, size),
    })

    const maxPx = computeOverlayTextMaxPx(width, textBudget, hasMedia)
    let nextSize = findLargestFittingFontSize({
      clue: clueText,
      answer: answerText,
      width,
      heightBudget: textBudget,
      textGap,
      minPx: OVERLAY_TEXT_MIN_PX,
      maxPx,
      measureHeights: measureAt,
    })

    // Safety pass: shrink if rendered clue still overflows its box
    const clueEl = clueRef.current
    if (clueEl && clueEl.clientHeight > 0) {
      const prevFont = clueEl.style.fontSize
      clueEl.style.fontSize = `${nextSize}px`
      while (nextSize > OVERLAY_TEXT_MIN_PX && clueEl.scrollHeight > clueEl.clientHeight + 1) {
        nextSize -= 1
        clueEl.style.fontSize = `${nextSize}px`
      }
      clueEl.style.fontSize = prevFont
    }

    setFontSizePx(nextSize)
  }, [answer, clue, clueRef, containerRef, enabled, reservedHeight])

  const scheduleRecalculate = useCallback(() => {
    if (frameRef.current != null) cancelAnimationFrame(frameRef.current)
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null
      recalculate()
    })
  }, [recalculate])

  useLayoutEffect(() => {
    if (!enabled) {
      setFontSizePx(null)
      return
    }
    scheduleRecalculate()
  }, [clue, answer, enabled, scheduleRecalculate])

  useLayoutEffect(() => {
    if (!enabled) return

    const container = containerRef.current
    if (!container) return

    const ro = new ResizeObserver(() => scheduleRecalculate())
    ro.observe(container)

    const clue = clueRef.current
    if (clue) ro.observe(clue)

    const observeMedia = () => {
      const media = getMediaElement(container)
      if (media && media !== observedMediaRef.current) {
        if (observedMediaRef.current) ro.unobserve(observedMediaRef.current)
        observedMediaRef.current = media
        ro.observe(media)
      }
    }

    observeMedia()
    const mo = new MutationObserver(() => {
      observeMedia()
      scheduleRecalculate()
    })
    mo.observe(container, { childList: true, subtree: true })

    return () => {
      ro.disconnect()
      mo.disconnect()
      observedMediaRef.current = null
    }
  }, [clueRef, containerRef, enabled, scheduleRecalculate])

  return fontSizePx
}
