import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import {
  computeOverlayTextBudget,
  computeOverlayTextMaxPx,
  estimateMediaContentHeight,
  findLargestFittingFontSize,
  OVERLAY_TEXT_MIN_PX,
} from '../lib/overlayTextFit'

type MeasureKind = 'clue' | 'answer'

interface MeasurerElements {
  clue: HTMLDivElement
  answer: HTMLDivElement
}

export interface OverlayTextLayout {
  fontSizePx: number | null
  clueMinHeight: number
  answerMinHeight: number
}

const EMPTY_LAYOUT: OverlayTextLayout = {
  fontSizePx: null,
  clueMinHeight: 0,
  answerMinHeight: 0,
}

function parsePx(value: string): number {
  const n = parseFloat(value)
  return Number.isFinite(n) ? n : 0
}

function getOverlayLineHeight(): number {
  if (typeof window === 'undefined') return 1.2
  if (typeof window.matchMedia !== 'function') return 1.2
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

function getMobileOverlayViewportHeight(main: HTMLElement): number {
  if (typeof window === 'undefined') return 0
  const viewportH = window.visualViewport?.height ?? window.innerHeight
  const root = main.closest('.question-overlay-backdrop, .player-question-overlay')
  const header = root?.querySelector('.question-overlay-header')
  const headerH = header instanceof HTMLElement ? header.getBoundingClientRect().height : 52
  const dock = document.querySelector('.player-action-zone[data-mobile-dock]')
  const dockH = dock instanceof HTMLElement ? dock.getBoundingClientRect().height : 0
  const layout = main.closest('.question-overlay-layout')
  const layoutStyles = layout instanceof HTMLElement ? getComputedStyle(layout) : null
  const layoutPad = layoutStyles
    ? parsePx(layoutStyles.paddingTop) + parsePx(layoutStyles.paddingBottom)
    : 24
  const mainStyles = getComputedStyle(main)
  const mainPad = parsePx(mainStyles.paddingTop) + parsePx(mainStyles.paddingBottom)
  return Math.max(0, viewportH - headerH - dockH - layoutPad - mainPad - 12)
}

function getContainerHeight(container: HTMLElement): number {
  const main = container.closest('.question-overlay-main')
  if (!(main instanceof HTMLElement)) {
    return container.clientHeight
  }

  const mainStyles = getComputedStyle(main)
  const mainPad = parsePx(mainStyles.paddingTop) + parsePx(mainStyles.paddingBottom)
  const mainInner = Math.max(0, main.clientHeight - mainPad)

  const isMobile =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(max-width: 767px)').matches

  if (isMobile) {
    const viewportFloor = getMobileOverlayViewportHeight(main)
    if (mainInner < Math.min(200, viewportFloor * 0.55)) {
      return Math.max(mainInner, viewportFloor)
    }
    return mainInner > 0 ? mainInner : viewportFloor
  }

  return mainInner > 0 ? mainInner : container.clientHeight
}

function getMediaElement(container: HTMLElement): HTMLElement | null {
  return container.querySelector('.question-overlay-media')
}

function getMediaNaturalSize(mediaEl: HTMLElement): { width: number; height: number } | null {
  const video = mediaEl.querySelector('video')
  if (video instanceof HTMLVideoElement && video.videoWidth > 0 && video.videoHeight > 0) {
    return { width: video.videoWidth, height: video.videoHeight }
  }
  const img = mediaEl.querySelector('img')
  if (img instanceof HTMLImageElement && img.naturalWidth > 0 && img.naturalHeight > 0) {
    return { width: img.naturalWidth, height: img.naturalHeight }
  }
  return null
}

/**
 * Height media will occupy after scaling to fill the overlay slot (object-fit: contain).
 * Falls back to the laid-out box when natural dimensions are not yet available.
 */
function getIntrinsicMediaContentHeight(
  mediaEl: HTMLElement,
  containerWidth: number,
  containerHeight: number,
): number {
  const natural = getMediaNaturalSize(mediaEl)
  if (natural) {
    const maxWidth = mediaEl.clientWidth > 0 ? mediaEl.clientWidth : containerWidth
    const maxHeight = estimateMediaContentHeight(containerWidth, containerHeight)
    if (maxWidth > 0 && maxHeight > 0) {
      const scale = Math.min(maxWidth / natural.width, maxHeight / natural.height)
      const scaled = natural.height * scale
      if (scaled > 0) return scaled
    }
  }

  const candidates = [
    mediaEl.querySelector('.question-media-player__stage'),
    mediaEl.querySelector('video'),
    mediaEl.querySelector('img'),
    mediaEl.querySelector('.question-media-controls'),
  ]

  for (const node of candidates) {
    if (node instanceof HTMLElement) {
      const height = node.getBoundingClientRect().height
      if (height > 0) return height
    }
  }

  return 0
}

interface Options {
  clue: string
  answer: string
  containerRef: RefObject<HTMLElement | null>
  clueRef: RefObject<HTMLElement | null>
  reservedHeight?: number
  hasMediaSlot?: boolean
  enabled?: boolean
}

export function useOverlayTextFontSize({
  clue,
  answer,
  containerRef,
  clueRef,
  reservedHeight = 0,
  hasMediaSlot = false,
  enabled = true,
}: Options): OverlayTextLayout {
  const [layout, setLayout] = useState<OverlayTextLayout>(EMPTY_LAYOUT)
  const frameRef = useRef<number | null>(null)
  const observedMediaRef = useRef<HTMLElement | null>(null)

  const recalculate = useCallback(() => {
    if (!enabled) return

    const container = containerRef.current
    if (!container) return

    const width = container.clientWidth
    const containerHeight = getContainerHeight(container)
    if (width <= 0 || containerHeight <= 0) return

    const styles = getComputedStyle(container)
    const flexGap = parsePx(styles.rowGap || styles.gap)
    const mediaEl = getMediaElement(container)
    const hasMedia = hasMediaSlot || mediaEl != null
    const isReservedMedia = mediaEl?.classList.contains('question-overlay-media--reserved') ?? false
    const measuredMediaContentHeight =
      mediaEl && !isReservedMedia
        ? getIntrinsicMediaContentHeight(mediaEl, width, containerHeight)
        : 0

    const textBudget = computeOverlayTextBudget({
      containerHeight,
      containerWidth: width,
      hasMedia,
      reservedHeight,
      flexGap,
      mediaHeight: measuredMediaContentHeight,
    })

    const textGap = hasMedia ? 0 : flexGap
    const clueText = clue.trim() || ' '
    const answerText = answer.trim() || '—'
    const longestTextChars = Math.max(clueText.length, answerText.length)

    const measureAt = (size: number) => ({
      clueHeight: measureBlockHeight('clue', clueText, width, size),
      answerHeight: measureBlockHeight('answer', answerText, width, size),
    })

    const maxPx = computeOverlayTextMaxPx(width, textBudget, hasMedia, longestTextChars)
    const nextSize = findLargestFittingFontSize({
      clue: clueText,
      answer: answerText,
      width,
      heightBudget: textBudget,
      textGap,
      minPx: OVERLAY_TEXT_MIN_PX,
      maxPx,
      measureHeights: measureAt,
    })

    const measured = measureAt(nextSize)
    setLayout({
      fontSizePx: nextSize,
      clueMinHeight: measured.clueHeight,
      answerMinHeight: measured.answerHeight,
    })
  }, [answer, clue, containerRef, enabled, hasMediaSlot, reservedHeight])

  const scheduleRecalculate = useCallback(() => {
    if (frameRef.current != null) cancelAnimationFrame(frameRef.current)
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null
      recalculate()
    })
  }, [recalculate])

  useLayoutEffect(() => {
    if (!enabled) return
    scheduleRecalculate()
  }, [clue, answer, enabled, hasMediaSlot, scheduleRecalculate])

  useLayoutEffect(() => {
    if (!enabled) return

    const container = containerRef.current
    if (!container) return

    const ro = new ResizeObserver(() => scheduleRecalculate())
    ro.observe(container)

    const main = container.closest('.question-overlay-main')
    if (main instanceof HTMLElement) ro.observe(main)

    const clue = clueRef.current
    if (clue) ro.observe(clue)

    const observeMedia = () => {
      const media = getMediaElement(container)
      if (media && media !== observedMediaRef.current) {
        if (observedMediaRef.current) ro.unobserve(observedMediaRef.current)
        observedMediaRef.current = media
        ro.observe(media)
        for (const inner of media.querySelectorAll(
          'video, img, .question-media-player__stage, .question-media-controls',
        )) {
          ro.observe(inner)
        }
      }
      const video = media?.querySelector('video')
      if (video instanceof HTMLVideoElement) {
        video.addEventListener('loadedmetadata', scheduleRecalculate, { once: true })
      }
    }

    observeMedia()
    const mo = new MutationObserver(() => {
      observeMedia()
      scheduleRecalculate()
    })
    mo.observe(container, { childList: true, subtree: true })

    const viewport = window.visualViewport
    const onViewportChange = () => scheduleRecalculate()
    viewport?.addEventListener('resize', onViewportChange)
    viewport?.addEventListener('scroll', onViewportChange)

    return () => {
      ro.disconnect()
      mo.disconnect()
      observedMediaRef.current = null
      viewport?.removeEventListener('resize', onViewportChange)
      viewport?.removeEventListener('scroll', onViewportChange)
    }
  }, [clueRef, containerRef, enabled, scheduleRecalculate])

  if (!enabled) return EMPTY_LAYOUT
  return layout
}
