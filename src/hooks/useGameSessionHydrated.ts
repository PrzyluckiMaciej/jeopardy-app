import { useSyncExternalStore } from 'react'
import { useGameStore } from '../store/gameStore'

function subscribe(onStoreChange: () => void) {
  return useGameStore.persist.onFinishHydration(onStoreChange)
}

function getSnapshot() {
  return useGameStore.persist.hasHydrated()
}

function getServerSnapshot() {
  return false
}

/** True after the live game session has been rehydrated from sessionStorage. */
export function useGameSessionHydrated(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
