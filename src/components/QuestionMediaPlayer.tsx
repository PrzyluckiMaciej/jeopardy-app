import { useCallback, useEffect, useRef, useState } from 'react'
import { Pause, Play, Volume2, VolumeX } from 'lucide-react'
import type { MediaPlaybackState } from '../types'
import * as net from '../lib/network'
import { useGameStore } from '../store/gameStore'

const VOLUME_STORAGE_KEY = 'jeopardy-media-volume'
const SPEED_OPTIONS = [0.5, 1, 1.25, 1.5, 2] as const
const CONTROLS_HIDE_DELAY_MS = 3000
const CONTROLS_LEAVE_DELAY_MS = 300

function canHover(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(hover: hover)').matches
}

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
  ariaLabel?: string
}

function MediaSeekBar({ value, max, onChange, ariaLabel = 'Seek' }: MediaSeekBarProps) {
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
      aria-label={ariaLabel}
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

interface HostControlsProps {
  isPaused: boolean
  currentTime: number
  duration: number
  playbackRate: number
  volume: number
  muted: boolean
  onTogglePlay: () => void
  onSeek: (value: number) => void
  onSpeedChange: (rate: number) => void
  onVolumeChange: (value: number) => void
  onToggleMute: () => void
  variant: 'bar' | 'overlay'
  onControlInteract?: () => void
}

function HostControls({
  isPaused,
  currentTime,
  duration,
  playbackRate,
  volume,
  muted,
  onTogglePlay,
  onSeek,
  onSpeedChange,
  onVolumeChange,
  onToggleMute,
  variant,
  onControlInteract,
}: HostControlsProps) {
  const isOverlay = variant === 'overlay'
  const seekBar = (
    <MediaSeekBar
      value={Math.min(currentTime, duration || 0)}
      max={duration || 0}
      onChange={onSeek}
    />
  )

  if (isOverlay) {
    return (
      <>
        <div
          className="question-media-player__overlay-seek"
          onPointerDown={onControlInteract}
        >
          {seekBar}
        </div>
        <div className="question-media-player__overlay-toolbar">
          <button
            type="button"
            className="question-media-player__overlay-btn"
            onClick={() => {
              onControlInteract?.()
              onTogglePlay()
            }}
            aria-label={isPaused ? 'Play' : 'Pause'}
          >
            {isPaused ? <Play size={20} aria-hidden /> : <Pause size={20} aria-hidden />}
          </button>

          <span className="question-media-player__overlay-time">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>

          <VolumeControls
            className="question-media-player__overlay-volume"
            volume={volume}
            muted={muted}
            onVolumeChange={(v) => {
              onControlInteract?.()
              onVolumeChange(v)
            }}
            onToggleMute={() => {
              onControlInteract?.()
              onToggleMute()
            }}
            iconSize={20}
          />

          <label className="question-media-player__overlay-speed">
            <span className="sr-only">Playback speed</span>
            <select
              value={playbackRate}
              onChange={(e) => {
                onControlInteract?.()
                onSpeedChange(parseFloat(e.target.value))
              }}
              aria-label="Playback speed"
            >
              {SPEED_OPTIONS.map((rate) => (
                <option key={rate} value={rate}>
                  {rate}x
                </option>
              ))}
            </select>
          </label>
        </div>
      </>
    )
  }

  return (
    <div className="question-media-controls">
      <button
        type="button"
        className="question-media-controls__btn"
        onClick={onTogglePlay}
        aria-label={isPaused ? 'Play' : 'Pause'}
      >
        {isPaused ? <Play size={18} aria-hidden /> : <Pause size={18} aria-hidden />}
      </button>

      <span className="question-media-controls__time">
        {formatTime(currentTime)} / {formatTime(duration)}
      </span>

      {seekBar}

      <label className="question-media-controls__speed">
        <span className="sr-only">Playback speed</span>
        <select
          value={playbackRate}
          onChange={(e) => onSpeedChange(parseFloat(e.target.value))}
          aria-label="Playback speed"
        >
          {SPEED_OPTIONS.map((rate) => (
            <option key={rate} value={rate}>
              {rate}x
            </option>
          ))}
        </select>
      </label>

      <VolumeControls
        className="question-media-controls__volume"
        volume={volume}
        muted={muted}
        onVolumeChange={onVolumeChange}
        onToggleMute={onToggleMute}
      />
    </div>
  )
}

interface VolumeControlsProps {
  volume: number
  muted: boolean
  onVolumeChange: (value: number) => void
  onToggleMute: () => void
  className: string
  iconSize?: number
}

function VolumeControls({
  volume,
  muted,
  onVolumeChange,
  onToggleMute,
  className,
  iconSize = 16,
}: VolumeControlsProps) {
  const isEffectivelyMuted = muted || volume === 0

  return (
    <div className={className}>
      <button
        type="button"
        className="question-media-controls__volume-btn"
        onClick={onToggleMute}
        aria-label={isEffectivelyMuted ? 'Unmute' : 'Mute'}
      >
        {isEffectivelyMuted ? (
          <VolumeX size={iconSize} aria-hidden />
        ) : (
          <Volume2 size={iconSize} aria-hidden />
        )}
      </button>
      <MediaSeekBar
        value={volume}
        max={1}
        onChange={onVolumeChange}
        ariaLabel="Volume"
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
  const [muted, setMuted] = useState(false)
  const volumeBeforeMuteRef = useRef(volume)
  const [controlsVisible, setControlsVisible] = useState(false)
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const leaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hoverCapableRef = useRef(canHover())

  const isHost = role === 'host'
  const isVideo = media.type === 'video'

  const clearHideTimeout = useCallback(() => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current)
      hideTimeoutRef.current = null
    }
  }, [])

  const clearLeaveTimeout = useCallback(() => {
    if (leaveTimeoutRef.current) {
      clearTimeout(leaveTimeoutRef.current)
      leaveTimeoutRef.current = null
    }
  }, [])

  const scheduleHide = useCallback(() => {
    clearHideTimeout()
    hideTimeoutRef.current = setTimeout(() => {
      setControlsVisible(false)
    }, CONTROLS_HIDE_DELAY_MS)
  }, [clearHideTimeout])

  const handleControlInteract = useCallback(() => {
    setControlsVisible(true)
    if (!hoverCapableRef.current) {
      scheduleHide()
    } else {
      clearHideTimeout()
    }
  }, [scheduleHide, clearHideTimeout])

  const handleStageMouseEnter = useCallback(() => {
    if (!hoverCapableRef.current) return
    clearLeaveTimeout()
    clearHideTimeout()
    setControlsVisible(true)
  }, [clearLeaveTimeout, clearHideTimeout])

  const handleStageMouseLeave = useCallback(() => {
    if (!hoverCapableRef.current) return
    clearLeaveTimeout()
    leaveTimeoutRef.current = setTimeout(() => {
      setControlsVisible(false)
      clearHideTimeout()
    }, CONTROLS_LEAVE_DELAY_MS)
  }, [clearLeaveTimeout, clearHideTimeout])

  const handleStagePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (hoverCapableRef.current) return
      const target = e.target as HTMLElement
      if (target.closest('.question-media-player__overlay')) return
      setControlsVisible((visible) => {
        const next = !visible
        if (next) scheduleHide()
        else clearHideTimeout()
        return next
      })
    },
    [scheduleHide, clearHideTimeout],
  )

  const publishPlayback = useCallback(
    (el: HTMLMediaElement) => {
      const state = playbackFromElement(el)
      setMediaPlayback(state)
      net.broadcast({ type: 'MEDIA_PLAYBACK', playback: state })
    },
    [setMediaPlayback],
  )

  const handleTogglePlay = useCallback(() => {
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
  }, [isHost, mediaActive, publishPlayback])

  const handleStageClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!isHost || !mediaActive) return
      const target = e.target as HTMLElement
      if (
        target.closest(
          '.question-media-player__overlay-toolbar, .question-media-player__overlay-seek, button, select, label',
        )
      ) {
        return
      }
      handleTogglePlay()
      handleControlInteract()
    },
    [isHost, mediaActive, handleTogglePlay, handleControlInteract],
  )

  useEffect(() => {
    return () => {
      clearHideTimeout()
      clearLeaveTimeout()
    }
  }, [clearHideTimeout, clearLeaveTimeout])

  const getLatestPlayback = useCallback(() => lastPlaybackRef.current, [])

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
    applyVolume(el, muted ? 0 : volume)
  }, [volume, muted, media.type, mountKey, applyVolume])

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
    if (v > 0) {
      setMuted(false)
      volumeBeforeMuteRef.current = v
    }
    setVolume(v)
    try {
      sessionStorage.setItem(VOLUME_STORAGE_KEY, String(v))
    } catch {
      /* ignore */
    }
    const el = mediaRef.current
    if (el) applyVolume(el, v)
  }

  function handleToggleMute() {
    const effectivelyMuted = muted || volume === 0
    if (effectivelyMuted) {
      const restoreVolume = volume > 0 ? volume : volumeBeforeMuteRef.current || 1
      setMuted(false)
      if (volume === 0) {
        handleVolumeChange(restoreVolume)
      } else {
        const el = mediaRef.current
        if (el) applyVolume(el, volume)
      }
    } else {
      volumeBeforeMuteRef.current = volume
      setMuted(true)
      const el = mediaRef.current
      if (el) applyVolume(el, 0)
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

  const playerVolumeControls = (
    <VolumeControls
      className={isVideo ? 'question-media-player__overlay-volume' : 'question-media-volume'}
      volume={volume}
      muted={muted}
      onVolumeChange={(v) => {
        if (isVideo) handleControlInteract()
        handleVolumeChange(v)
      }}
      onToggleMute={() => {
        if (isVideo) handleControlInteract()
        handleToggleMute()
      }}
      iconSize={isVideo ? 20 : 18}
    />
  )

  return (
    <div
      className={`question-media-player${isHost ? '' : ' question-media-player--player'}${isVideo ? ' question-media-player--video' : ''}${className ? ` ${className}` : ''}`}
      style={style}
    >
      {isVideo ? (
        <div
          className={`question-media-player__stage${controlsVisible ? ' question-media-player--controls-visible' : ''}`}
          onMouseEnter={handleStageMouseEnter}
          onMouseLeave={handleStageMouseLeave}
          onPointerDown={handleStagePointerDown}
          onClick={handleStageClick}
        >
          <video
            {...mediaProps}
            className={`question-media-player__video${isHost ? '' : ' question-media-player__video--no-pointer'}`}
          />
          <div
            className={`question-media-player__overlay${isHost ? '' : ' question-media-player__overlay--player'}`}
            aria-hidden={!controlsVisible}
          >
            {isHost ? (
              <HostControls
                variant="overlay"
                isPaused={isPaused}
                currentTime={currentTime}
                duration={duration}
                playbackRate={playbackRate}
                volume={volume}
                muted={muted}
                onTogglePlay={handleTogglePlay}
                onSeek={handleSeek}
                onSpeedChange={handleSpeedChange}
                onVolumeChange={handleVolumeChange}
                onToggleMute={handleToggleMute}
                onControlInteract={handleControlInteract}
              />
            ) : (
              <div className="question-media-player__overlay-toolbar question-media-player__overlay-toolbar--player">
                {playerVolumeControls}
              </div>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="question-media-player__element">
            <audio {...mediaProps} className="question-media-player__audio" />
          </div>

          {isHost ? (
            <HostControls
              variant="bar"
              isPaused={isPaused}
              currentTime={currentTime}
              duration={duration}
              playbackRate={playbackRate}
              volume={volume}
              muted={muted}
              onTogglePlay={handleTogglePlay}
              onSeek={handleSeek}
              onSpeedChange={handleSpeedChange}
              onVolumeChange={handleVolumeChange}
              onToggleMute={handleToggleMute}
            />
          ) : (
            playerVolumeControls
          )}
        </>
      )}
    </div>
  )
}
