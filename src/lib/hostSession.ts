import type { GameState } from '../types'

export const HOST_DISCONNECT_GRACE_MS = 2000

export function generateHostSecret(): string {
  return crypto.randomUUID()
}

/** Drop bulky data URLs before writing live game state to sessionStorage. */
export function sanitizeStateForPersist(state: GameState): GameState {
  return {
    ...state,
    activeMedia: null,
  }
}

/** First hello wins; later hellos must present the same secret. */
export function acceptHostHello(input: {
  storedSecret: string | null
  incomingSecret: string
}): boolean {
  const incoming = input.incomingSecret.trim()
  if (!incoming) return false
  if (input.storedSecret == null || input.storedSecret === '') return true
  return input.storedSecret === incoming
}
