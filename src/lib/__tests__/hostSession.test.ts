import { describe, expect, it } from 'vitest'
import { emptyFinalJeopardyState, type GameState } from '../../types'
import {
  acceptHostHello,
  generateHostSecret,
  sanitizeStateForPersist,
} from '../hostSession'

function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    phase: 'board',
    board: {
      id: 'board-1',
      name: 'Test',
      categories: [],
      pointValues: [200],
    },
    players: [
      { id: 'p1', name: 'Alice', score: 400, isConnected: true, isSpectator: false },
    ],
    answeredCells: ['cat-1-q-1'],
    activeQuestion: {
      categoryId: 'cat-1',
      question: { id: 'q-1', question: 'Q', answer: 'A', points: 200, mediaId: 'm1' },
    },
    buzzQueue: ['p1'],
    activeMedia: { type: 'image', dataUrl: 'data:image/png;base64,abc' },
    mediaPlayback: { paused: false, currentTime: 1, playbackRate: 1 },
    boardControlId: 'p1',
    dailyDouble: null,
    finalJeopardy: {
      ...emptyFinalJeopardyState(),
      wagers: { p1: 100 },
    },
    activeGameId: 'game-1',
    gameBoardIds: ['board-1'],
    currentBoardIndex: 0,
    boardTransition: null,
    clueRevealed: true,
    mediaRevealed: true,
    ...overrides,
  }
}

describe('sanitizeStateForPersist', () => {
  it('strips activeMedia and keeps scores, board, and answered cells', () => {
    const persisted = sanitizeStateForPersist(makeState())
    expect(persisted.activeMedia).toBeNull()
    expect(persisted.players[0]?.score).toBe(400)
    expect(persisted.answeredCells).toEqual(['cat-1-q-1'])
    expect(persisted.board?.id).toBe('board-1')
    expect(persisted.activeGameId).toBe('game-1')
    expect(persisted.activeQuestion?.question.mediaId).toBe('m1')
    expect(persisted.finalJeopardy?.wagers).toEqual({ p1: 100 })
    expect(persisted.clueRevealed).toBe(true)
  })

  it('does not mutate the original state', () => {
    const original = makeState()
    sanitizeStateForPersist(original)
    expect(original.activeMedia).toEqual({ type: 'image', dataUrl: 'data:image/png;base64,abc' })
  })
})

describe('acceptHostHello', () => {
  it('accepts the first hello when no secret is stored', () => {
    expect(acceptHostHello({ storedSecret: null, incomingSecret: 'abc' })).toBe(true)
    expect(acceptHostHello({ storedSecret: '', incomingSecret: 'abc' })).toBe(true)
  })

  it('accepts a matching secret on reconnect', () => {
    expect(acceptHostHello({ storedSecret: 'abc', incomingSecret: 'abc' })).toBe(true)
  })

  it('rejects a mismatched or empty secret', () => {
    expect(acceptHostHello({ storedSecret: 'abc', incomingSecret: 'xyz' })).toBe(false)
    expect(acceptHostHello({ storedSecret: 'abc', incomingSecret: '' })).toBe(false)
    expect(acceptHostHello({ storedSecret: null, incomingSecret: '  ' })).toBe(false)
  })
})

describe('generateHostSecret', () => {
  it('returns a non-empty unique string', () => {
    const a = generateHostSecret()
    const b = generateHostSecret()
    expect(a.length).toBeGreaterThan(0)
    expect(b).not.toBe(a)
  })
})
