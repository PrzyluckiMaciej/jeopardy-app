import type { Player } from '../types'

export type JoinDecision =
  | { action: 'reject'; reason: 'NAME_TAKEN' }
  | { action: 'reconnect'; playerId: string }
  | { action: 'add'; playerId: string }

export function findPeerForClient(
  peerToClient: ReadonlyMap<string, string>,
  clientId: string,
): string | undefined {
  for (const [peerId, cid] of peerToClient) {
    if (cid === clientId) return peerId
  }
  return undefined
}

/** True when the client still has a peer session in this room. */
export function isClientSessionActive(
  peerToClient: ReadonlyMap<string, string>,
  clientId: string,
  livePeerIds: Set<string>,
): boolean {
  const peerId = findPeerForClient(peerToClient, clientId)
  if (peerId === undefined) return false
  if (livePeerIds.size === 0) return true
  return livePeerIds.has(peerId)
}

export function evaluatePlayerJoin(input: {
  joiningId: string
  joiningName: string
  players: Player[]
  peerToClient: ReadonlyMap<string, string>
  livePeerIds: string[]
  joiningPeerId: string
}): JoinDecision {
  const { joiningId, joiningName, players, peerToClient, joiningPeerId } = input
  const livePeers = new Set(input.livePeerIds)

  const connectedByName = players.find(
    (p) => p.name === joiningName && p.isConnected,
  )

  if (connectedByName) {
    if (connectedByName.id !== joiningId) {
      if (isClientSessionActive(peerToClient, connectedByName.id, livePeers)) {
        return { action: 'reject', reason: 'NAME_TAKEN' }
      }
    } else {
      const ownPeer = findPeerForClient(peerToClient, joiningId)
      if (
        ownPeer !== undefined
        && ownPeer !== joiningPeerId
        && isClientSessionActive(peerToClient, joiningId, livePeers)
      ) {
        return { action: 'reject', reason: 'NAME_TAKEN' }
      }
    }
  }

  const existingById = players.find((p) => p.id === joiningId)
  const existingByName = players.find(
    (p) => p.name === joiningName && !p.isConnected,
  )
  const ghostByName = players.find(
    (p) =>
      p.name === joiningName
      && p.isConnected
      && !isClientSessionActive(peerToClient, p.id, livePeers),
  )

  const existing = existingById ?? existingByName ?? ghostByName
  if (existing) {
    return { action: 'reconnect', playerId: existing.id }
  }

  return { action: 'add', playerId: joiningId }
}
