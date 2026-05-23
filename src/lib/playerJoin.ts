import type { Player } from '../types'

export type JoinDecision =
  | { action: 'reject'; reason: 'NAME_TAKEN' }
  | { action: 'reconnect'; playerId: string }
  | { action: 'add'; playerId: string }

export type NameSession = { peerId: string; clientId: string }

export function normalizePlayerName(name: string): string {
  return name.trim().toLowerCase()
}

export function playerNamesMatch(a: string, b: string): boolean {
  return normalizePlayerName(a) === normalizePlayerName(b)
}

export function findPeerForClient(
  peerToClient: ReadonlyMap<string, string>,
  clientId: string,
): string | undefined {
  for (const [peerId, cid] of peerToClient) {
    if (cid === clientId) return peerId
  }
  return undefined
}

function findPlayerByName(players: Player[], name: string): Player | undefined {
  return players.find((p) => playerNamesMatch(p.name, name))
}

export function evaluatePlayerJoin(input: {
  joiningId: string
  joiningName: string
  players: Player[]
  peerToClient: ReadonlyMap<string, string>
  joiningPeerId: string
  nameSessions?: ReadonlyMap<string, NameSession>
}): JoinDecision {
  const { joiningId, joiningName, players, peerToClient, joiningPeerId, nameSessions } =
    input
  const norm = normalizePlayerName(joiningName)

  const held = nameSessions?.get(norm)
  if (
    held
    && held.clientId !== joiningId
    && held.peerId !== joiningPeerId
    && peerToClient.has(held.peerId)
  ) {
    return { action: 'reject', reason: 'NAME_TAKEN' }
  }

  for (const [mappedPeer, mappedClientId] of peerToClient) {
    if (mappedPeer === joiningPeerId) continue
    const mappedPlayer = players.find((p) => p.id === mappedClientId)
    if (
      mappedPlayer
      && playerNamesMatch(mappedPlayer.name, joiningName)
      && mappedClientId !== joiningId
    ) {
      return { action: 'reject', reason: 'NAME_TAKEN' }
    }
  }

  const connectedByName = findPlayerByName(
    players.filter((p) => p.isConnected),
    joiningName,
  )

  if (connectedByName) {
    if (connectedByName.id !== joiningId) {
      if (findPeerForClient(peerToClient, connectedByName.id) !== undefined) {
        return { action: 'reject', reason: 'NAME_TAKEN' }
      }
    } else {
      const ownPeer = findPeerForClient(peerToClient, joiningId)
      if (ownPeer !== undefined && ownPeer !== joiningPeerId) {
        return { action: 'reject', reason: 'NAME_TAKEN' }
      }
    }
  }

  const existingById = players.find((p) => p.id === joiningId)
  const existingByName = players.find(
    (p) => playerNamesMatch(p.name, joiningName) && !p.isConnected,
  )
  const ghostByName = players.find(
    (p) =>
      playerNamesMatch(p.name, joiningName)
      && p.isConnected
      && findPeerForClient(peerToClient, p.id) === undefined,
  )

  const existing = existingById ?? existingByName ?? ghostByName
  if (existing) {
    return { action: 'reconnect', playerId: existing.id }
  }

  return { action: 'add', playerId: joiningId }
}
