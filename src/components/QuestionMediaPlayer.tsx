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
    if (!el.paused) el.pause()
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
) {
  const apply = () => {
    applyPlaybackToElement(el, playback, applyingRef)
    if (!playback.paused && el.paused) {
      el.addEventListener('canplay', () => applyPlaybackToElement(el, playback, applyingRef), { once: true })
    }
  }

  if (el.readyState >= HTMLMediaElement.HAVE_METADATA) {
    apply()
  } else {
    el.addEventListener('loadedmetadata', apply, { once: true })
  }
}

function playbackFromElement(el: HTMLMediaElement): MediaPlaybackState {
  return {
    paused: el.paused,
    currentTime: el.currentTime,
    playbackRate: el.playbackRate,
  }
}

export default function QuestionMediaPlayer({
  media,
  role,
  playback,
  mountKey,
  className,
  style,
}: Props) {
  const mediaRef = useRef<HTMLMediaElement | null>(null)
  const applyingRef = useRef(false)
  const pendingPlaybackRef = useRef<MediaPlaybackState | null>(playback)
  const lastPlaybackRef = useRef<MediaPlaybackState | null>(playback)

  const setMediaRef = useCallback((el: HTMLVideoElement | HTMLAudioElement | null) => {
    mediaRef.current = el
    if (el && role === 'player' && pendingPlaybackRef.current) {
      applyPlaybackWhenReady(el, pendingPlaybackRef.current, applyingRef)
    }
  }, [role])
  const setMediaPlayback = useGameStore((s) => s.setMediaPlayback)

  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [isPaused, setIsPaused] = useState(true)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [volume, setVolume] = useState(readStoredVolume)

  const isHost = role === 'host'

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

  useEffect(() => {
    lastPlaybackRef.current = playback
    pendingPlaybackRef.current = playback
  }, [playback])

  useEffect(() => {
    const el = mediaRef.current
    if (!el || media.type === 'image') return
    applyVolume(el, volume)
  }, [volume, media.type, mountKey, applyVolume])

  useEffect(() => {
    if (media.type === 'image') return
    const el = mediaRef.current
    if (!el) return

    if (isHost) {
      const startPlayback = () => {
        applyingRef.current = true
        el.playbackRate = 1
        el.currentTime = 0
        el.play()
          .catch(() => {})
          .finally(() => {
            applyingRef.current = false
            publishPlayback(el)
          })
      }

      if (el.readyState >= 1) {
        startPlayback()
      } else {
        el.addEventListener('loadedmetadata', startPlayback, { once: true })
        return () => el.removeEventListener('loadedmetadata', startPlayback)
      }
    }
  }, [mountKey, media.dataUrl, media.type, isHost, publishPlayback])

  useEffect(() => {
    if (isHost || media.type === 'image' || !playback) return
    const el = mediaRef.current
    if (!el) return
    applyPlaybackWhenReady(el, playback, applyingRef)
  }, [playback, isHost, media.type, mountKey])

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
      } else if (pendingPlaybackRef.current) {
        applyPlaybackWhenReady(el, pendingPlaybackRef.current, applyingRef)
      }
    }

    const onHostPlaybackChange = () => {
      if (!isHost || applyingRef.current) return
      setIsPaused(el.paused)
      setCurrentTime(el.currentTime)
      setPlaybackRate(el.playbackRate)
      publishPlayback(el)
    }

    const onPlayerTamper = () => {
      if (isHost || applyingRef.current) return
      const synced = lastPlaybackRef.current
      if (synced) applyPlaybackWhenReady(el, synced, applyingRef)
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
  }, [isHost, media.type, media.dataUrl, mountKey, publishPlayback])

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
    if (!el || !isHost) return
    if (el.paused) {
      el.play().catch(() => {})
    } else {
      el.pause()
    }
  }

  function handleSeek(value: number) {
    const el = mediaRef.current
    if (!el || !isHost) return
    el.currentTime = value
    setCurrentTime(value)
  }

  function handleSpeedChange(rate: number) {
    const el = mediaRef.current
    if (!el || !isHost) return
    el.playbackRate = rate
    setPlaybackRate(rate)
    publishPlayback(el)
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
    autoPlay: !isHost,
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

          <input
            type="range"
            className="question-media-controls__seek"
            min={0}
            max={duration || 0}
            step={0.1}
            value={Math.min(currentTime, duration || 0)}
            onChange={(e) => handleSeek(parseFloat(e.target.value))}
            aria-label="Seek"
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
