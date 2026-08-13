import { useSyncExternalStore } from 'react'

const CLOCK_INTERVAL_MS = 250

function subscribeToClock(onStoreChange: () => void) {
  const id = window.setInterval(onStoreChange, CLOCK_INTERVAL_MS)
  return () => window.clearInterval(id)
}

function getClockSnapshot() {
  return Date.now()
}

function getServerClockSnapshot() {
  return 0
}

/** Seconds remaining until `timerEndsAt`, or null when no timer is running. */
export function useCountdownSeconds(timerEndsAt: number | null): number | null {
  const now = useSyncExternalStore(subscribeToClock, getClockSnapshot, getServerClockSnapshot)
  if (timerEndsAt == null) return null
  return Math.max(0, Math.ceil((timerEndsAt - now) / 1000))
}
