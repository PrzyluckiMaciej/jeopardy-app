import { useCallback, useEffect, useRef, useState } from 'react'
import { Pause, Play, Volume2 } from 'lucide-react'
import type { MediaPlaybackState } from '../types'
import * as net from '../lib/network'
import { useGameStore } from '../store/gameStore'

const VOLUME_STORAGE_KEY = 'jeopardy-media-volume'
const SPEED_OPTIONS = [0.5, 1, 1.25, 1.5, 2] as const

interface Props {
  media: { type: 'image' | 'audio' | 'video'; dataUrl: string }
  role: 'host' | 'player'
  playback: MediaPlaybackState | null
  mountKey: number
  mediaActive?: boolean
  loading?: boolean
  className?: string
  style?: React.CSSProperties
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function readStoredVolume(): number {
  try {
    const raw = sessionStorage.getItem(VOLUME_STORAGE_KEY)
    if (raw == null) return 1
    const n = parseFloat(raw)
    return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 1
  } catch {
    return 1
  }
}

function stopMediaElement(el: HTMLMediaElement) {
  el.pause()
  el.currentTime = 0
}

function applyPlaybackToElement(
  el: HTMLMediaElement,
  playback: MediaPlaybackState,
  applyingRef: React.MutableRefObject<boolean>,
) {
  applyingRef.current = true
  el.playbackRate = playback.playbackRate
  if (Math.abs(el.currentTime - playback.currentTime) > 0.25) {
    el.currentTime = playback.currentTime
  }
  if (playback.paused) {
    el.pause()
  } else if (el.paused) {
    el.play().catch(() => {})
  }
  requestAnimationFrame(() => {
    applyingRef.current = false
  })
}

function applyPlaybackWhenReady(
  el: HTMLMediaElement,
  playback: MediaPlaybackState,
  applyingRef: React.MutableRefObject<boolean>,
  getLatestPlayback: () => MediaPlaybackState | null,
  signal: AbortSignal,
) {
  const apply = () => {
    if (signal.aborted) return
    const latest = getLatestPlayback() ?? playback
    applyPlaybackToElement(el, latest, applyingRef)
    if (!latest.paused && el.paused) {
      el.addEventListener(
        'canplay',
        () => {
          if (signal.aborted) return
          const current = getLatestPlayback()
          if (current) applyPlaybackToElement(el, current, applyingRef)
        },
        { once: true, signal },
      )
    }
  }

  if (el.readyState >= HTMLMediaElement.HAVE_METADATA) {
    apply()
  } else {
    el.addEventListener('loadedmetadata', apply, { once: true, signal })
  }
}

function playbackFromElement(el: HTMLMediaElement): MediaPlaybackState {
  return {
    paused: el.paused,
    currentTime: el.currentTime,
    playbackRate: el.playbackRate,
  }
}

const SEEK_THUMB_SIZE = '0.875rem'

interface MediaSeekBarProps {
  value: number
  max: number
  onChange: (value: number) => void
}

function MediaSeekBar({ value, max, onChange }: MediaSeekBarProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0

  function seekFromClientX(clientX: number) {
    const track = trackRef.current
    if (!track || max <= 0) return
    const rect = track.getBoundingClientRect()
    const nextRatio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    onChange(nextRatio * max)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (max <= 0) return
    const step = Math.max(0.1, max / 100)
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault()
      onChange(Math.max(0, value - step))
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault()
      onChange(Math.min(max, value + step))
    } else if (e.key === 'Home') {
      e.preventDefault()
      onChange(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      onChange(max)
    }
  }

  return (
    <div
      ref={trackRef}
      className="question-media-controls__seek"
      role="slider"
      tabIndex={0}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-label="Seek"
      style={{ ['--seek-ratio' as string]: ratio }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        seekFromClientX(e.clientX)
      }}
      onPointerMove={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          seekFromClientX(e.clientX)
        }
      }}
      onKeyDown={handleKeyDown}
    >
      <div className="question-media-controls__seek-track" aria-hidden>
        <div className="question-media-controls__seek-fill" />
      </div>
      <div
        className="question-media-controls__seek-thumb"
        style={{ left: `calc((100% - ${SEEK_THUMB_SIZE}) * ${ratio})` }}
        aria-hidden
      />
    </div>
  )
}

export default function QuestionMediaPlayer({
  media,
  role,
  playback,
  mountKey,
  mediaActive = true,
  loading = false,
  className,
  style,
}: Props) {
  const mediaRef = useRef<HTMLMediaElement | null>(null)
  const applyingRef = useRef(false)
  const lastPlaybackRef = useRef<MediaPlaybackState | null>(playback)
  const setMediaPlayback = useGameStore((s) => s.setMediaPlayback)

  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [isPaused, setIsPaused] = useState(true)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [volume, setVolume] = useState(readStoredVolume)

  const isHost = role === 'host'

  const getLatestPlayback = useCallback(() => lastPlaybackRef.current, [])

  const publishPlayback = useCallback(
    (el: HTMLMediaElement) => {
      const state = playbackFromElement(el)
      setMediaPlayback(state)
      net.broadcast({ type: 'MEDIA_PLAYBACK', playback: state })
    },
    [setMediaPlayback],
  )

  const applyVolume = useCallback((el: HTMLMediaElement, v: number) => {
    el.volume = v
  }, [])

  const setMediaRef = useCallback((el: HTMLVideoElement | HTMLAudioElement | null) => {
    mediaRef.current = el
  }, [])

  useEffect(() => {
    lastPlaybackRef.current = playback
  }, [playback])

  useEffect(() => {
    const el = mediaRef.current
    if (!el || media.type === 'image') return
    applyVolume(el, volume)
  }, [volume, media.type, mountKey, applyVolume])

  useEffect(() => {
    const el = mediaRef.current
    if (!el || media.type === 'image') return
    if (!mediaActive || !playback) {
      stopMediaElement(el)
      return
    }
    if (isHost) return

    const controller = new AbortController()
    applyPlaybackWhenReady(el, playback, applyingRef, getLatestPlayback, controller.signal)
    return () => controller.abort()
  }, [playback, isHost, media.type, mountKey, mediaActive, getLatestPlayback])

  useEffect(() => {
    if (media.type === 'image') return
    const el = mediaRef.current
    if (!el) return

    if (!mediaActive) {
      stopMediaElement(el)
      if (isHost) publishPlayback(el)
      return
    }

    if (!isHost) return

    const controller = new AbortController()
    const startPlayback = () => {
      if (controller.signal.aborted) return
      applyingRef.current = true
      el.playbackRate = 1
      el.currentTime = 0
      el.play()
        .catch(() => {})
        .finally(() => {
          applyingRef.current = false
          if (!controller.signal.aborted) publishPlayback(el)
        })
    }

    if (el.readyState >= HTMLMediaElement.HAVE_METADATA) {
      startPlayback()
    } else {
      el.addEventListener('loadedmetadata', startPlayback, { once: true, signal: controller.signal })
    }

    return () => controller.abort()
  }, [mountKey, media.dataUrl, media.type, isHost, mediaActive, publishPlayback])

  useEffect(() => {
    if (media.type === 'image') return
    const el = mediaRef.current
    if (!el) return

    const onTimeUpdate = () => {
      if (isHost) {
        setCurrentTime(el.currentTime)
        setDuration(el.duration)
        setIsPaused(el.paused)
        setPlaybackRate(el.playbackRate)
      }
    }

    const onLoadedMetadata = () => {
      setDuration(el.duration)
      if (isHost) {
        setCurrentTime(el.currentTime)
      } else if (mediaActive && lastPlaybackRef.current) {
        const controller = new AbortController()
        applyPlaybackWhenReady(
          el,
          lastPlaybackRef.current,
          applyingRef,
          getLatestPlayback,
          controller.signal,
        )
      }
    }

    const onHostPlaybackChange = () => {
      if (!isHost || applyingRef.current || !mediaActive) return
      setIsPaused(el.paused)
      setCurrentTime(el.currentTime)
      setPlaybackRate(el.playbackRate)
      publishPlayback(el)
    }

    const onPlayerTamper = () => {
      if (isHost || applyingRef.current || !mediaActive) return
      const synced = lastPlaybackRef.current
      if (synced) {
        const controller = new AbortController()
        applyPlaybackWhenReady(el, synced, applyingRef, getLatestPlayback, controller.signal)
      }
    }

    el.addEventListener('timeupdate', onTimeUpdate)
    el.addEventListener('loadedmetadata', onLoadedMetadata)

    if (isHost) {
      el.addEventListener('play', onHostPlaybackChange)
      el.addEventListener('pause', onHostPlaybackChange)
      el.addEventListener('seeked', onHostPlaybackChange)
      el.addEventListener('ratechange', onHostPlaybackChange)
    } else {
      el.addEventListener('pause', onPlayerTamper)
      el.addEventListener('seeking', onPlayerTamper)
      el.addEventListener('ratechange', onPlayerTamper)
    }

    return () => {
      el.removeEventListener('timeupdate', onTimeUpdate)
      el.removeEventListener('loadedmetadata', onLoadedMetadata)
      if (isHost) {
        el.removeEventListener('play', onHostPlaybackChange)
        el.removeEventListener('pause', onHostPlaybackChange)
        el.removeEventListener('seeked', onHostPlaybackChange)
        el.removeEventListener('ratechange', onHostPlaybackChange)
      } else {
        el.removeEventListener('pause', onPlayerTamper)
        el.removeEventListener('seeking', onPlayerTamper)
        el.removeEventListener('ratechange', onPlayerTamper)
      }
    }
  }, [isHost, media.type, media.dataUrl, mountKey, mediaActive, publishPlayback, getLatestPlayback])

  useEffect(() => {
    return () => {
      const el = mediaRef.current
      if (el && media.type !== 'image') stopMediaElement(el)
    }
  }, [media.type])

  function handleVolumeChange(v: number) {
    setVolume(v)
    try {
      sessionStorage.setItem(VOLUME_STORAGE_KEY, String(v))
    } catch {
      /* ignore */
    }
    const el = mediaRef.current
    if (el) applyVolume(el, v)
  }

  function handleTogglePlay() {
    const el = mediaRef.current
    if (!el || !isHost || !mediaActive) return
    if (el.paused) {
      el.play()
        .then(() => publishPlayback(el))
        .catch(() => publishPlayback(el))
    } else {
      el.pause()
      publishPlayback(el)
    }
  }

  function handleSeek(value: number) {
    const el = mediaRef.current
    if (!el || !isHost || !mediaActive) return
    el.currentTime = value
    setCurrentTime(value)
  }

  function handleSpeedChange(rate: number) {
    const el = mediaRef.current
    if (!el || !isHost || !mediaActive) return
    el.playbackRate = rate
    setPlaybackRate(rate)
    publishPlayback(el)
  }

  if (loading) {
    return (
      <div
        className={`question-media-player question-media-player--loading${className ? ` ${className}` : ''}`}
        style={style}
      >
        <div className="question-media-player__loader">
          <div className="question-media-player__spinner" />
          <span className="question-media-player__loader-text font-condensed">Loading media…</span>
        </div>
      </div>
    )
  }

  if (media.type === 'image') {
    return (
      <div className={className} style={style}>
        <img src={media.dataUrl} alt="" />
      </div>
    )
  }

  const mediaProps = {
    ref: setMediaRef,
    src: media.dataUrl,
    playsInline: true,
    tabIndex: -1,
    preload: 'auto' as const,
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  }

  return (
    <div
      className={`question-media-player${isHost ? '' : ' question-media-player--player'}${className ? ` ${className}` : ''}`}
      style={style}
    >
      <div className="question-media-player__element">
        {media.type === 'video' ? (
          <video {...mediaProps} className="question-media-player__video" />
        ) : (
          <audio {...mediaProps} className="question-media-player__audio" />
        )}
      </div>

      {isHost ? (
        <div className="question-media-controls">
          <button
            type="button"
            className="question-media-controls__btn"
            onClick={handleTogglePlay}
            aria-label={isPaused ? 'Play' : 'Pause'}
          >
            {isPaused ? <Play size={18} aria-hidden /> : <Pause size={18} aria-hidden />}
          </button>

          <span className="question-media-controls__time">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>

          <MediaSeekBar
            value={Math.min(currentTime, duration || 0)}
            max={duration || 0}
            onChange={handleSeek}
          />

          <label className="question-media-controls__speed">
            <span className="sr-only">Playback speed</span>
            <select
              value={playbackRate}
              onChange={(e) => handleSpeedChange(parseFloat(e.target.value))}
              aria-label="Playback speed"
            >
              {SPEED_OPTIONS.map((rate) => (
                <option key={rate} value={rate}>
                  {rate}x
                </option>
              ))}
            </select>
          </label>

          <label className="question-media-controls__volume">
            <Volume2 size={16} aria-hidden />
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={volume}
              onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
              aria-label="Volume"
            />
          </label>
        </div>
      ) : (
        <label className="question-media-volume">
          <Volume2 size={18} aria-hidden />
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={volume}
            onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
            aria-label="Volume"
          />
        </label>
      )}
    </div>
  )
}
