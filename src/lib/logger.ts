export interface LogPayload {
  role: 'host' | 'player'
  roomCode: string
  actor: string
  event: string
}

export function logEvent(payload: LogPayload): void {
  const body = JSON.stringify({ ...payload, timestamp: new Date().toISOString() })
  // Fire-and-forget; silently swallow errors so logging never disrupts gameplay
  fetch('/api/log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  }).catch(() => undefined)
}
