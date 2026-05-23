import { describe, expect, it } from 'vitest'
import { evaluatePlayerJoin } from '../playerJoin'
import type { Player } from '../../types'

function player(overrides: Partial<Player> & Pick<Player, 'id' | 'name'>): Player {
  return {
    score: 0,
    isConnected: true,
    ...overrides,
  }
}

describe('evaluatePlayerJoin', () => {
  it('rejects a second client id while the name is actively connected', () => {
    const peerToClient = new Map([['peer-a', 'id-1']])
    const decision = evaluatePlayerJoin({
      joiningId: 'id-2',
      joiningName: 'ABC',
      players: [player({ id: 'id-1', name: 'ABC' })],
      peerToClient,
      livePeerIds: ['peer-a'],
      joiningPeerId: 'peer-b',
    })
    expect(decision).toEqual({ action: 'reject', reason: 'NAME_TAKEN' })
  })

  it('rejects a second tab for the same client id', () => {
    const peerToClient = new Map([['peer-a', 'id-1']])
    const decision = evaluatePlayerJoin({
      joiningId: 'id-1',
      joiningName: 'ABC',
      players: [player({ id: 'id-1', name: 'ABC' })],
      peerToClient,
      livePeerIds: ['peer-a'],
      joiningPeerId: 'peer-b',
    })
    expect(decision).toEqual({ action: 'reject', reason: 'NAME_TAKEN' })
  })

  it('rejects duplicate names when peer map shows an active session even if getPeers is empty', () => {
    const peerToClient = new Map([['peer-a', 'id-1']])
    const decision = evaluatePlayerJoin({
      joiningId: 'id-2',
      joiningName: 'ABC',
      players: [player({ id: 'id-1', name: 'ABC' })],
      peerToClient,
      livePeerIds: [],
      joiningPeerId: 'peer-b',
    })
    expect(decision).toEqual({ action: 'reject', reason: 'NAME_TAKEN' })
  })

  it('allows reclaiming a disconnected slot with the same name', () => {
    const decision = evaluatePlayerJoin({
      joiningId: 'id-2',
      joiningName: 'ABC',
      players: [player({ id: 'id-1', name: 'ABC', isConnected: false })],
      peerToClient: new Map(),
      livePeerIds: [],
      joiningPeerId: 'peer-b',
    })
    expect(decision).toEqual({ action: 'reconnect', playerId: 'id-1' })
  })

  it('allows reclaiming a ghost connected flag without a peer mapping', () => {
    const decision = evaluatePlayerJoin({
      joiningId: 'id-2',
      joiningName: 'ABC',
      players: [player({ id: 'id-1', name: 'ABC' })],
      peerToClient: new Map(),
      livePeerIds: [],
      joiningPeerId: 'peer-b',
    })
    expect(decision).toEqual({ action: 'reconnect', playerId: 'id-1' })
  })

  it('allows reclaiming when the peer left but getPeers still lists them', () => {
    const peerToClient = new Map()
    const decision = evaluatePlayerJoin({
      joiningId: 'id-2',
      joiningName: 'ABC',
      players: [player({ id: 'id-1', name: 'ABC' })],
      peerToClient,
      livePeerIds: ['peer-a'],
      joiningPeerId: 'peer-b',
    })
    expect(decision).toEqual({ action: 'reconnect', playerId: 'id-1' })
  })

  it('adds a brand-new player', () => {
    const decision = evaluatePlayerJoin({
      joiningId: 'id-1',
      joiningName: 'ABC',
      players: [],
      peerToClient: new Map(),
      livePeerIds: [],
      joiningPeerId: 'peer-a',
    })
    expect(decision).toEqual({ action: 'add', playerId: 'id-1' })
  })
})
