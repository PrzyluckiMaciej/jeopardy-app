import { describe, expect, it } from 'vitest'
import { emptyFinalJeopardyState, type GameState } from '../../types'
import { sanitizeGameStateForPlayer } from '../finalJeopardySync'

function baseState(overrides: Partial<GameState> = {}): GameState {
  return {
    phase: 'finalJeopardy',
    board: null,
    players: [],
    answeredCells: [],
    activeQuestion: null,
    buzzQueue: [],
    activeMedia: null,
    mediaPlayback: null,
    boardControlId: null,
    dailyDouble: null,
    finalJeopardy: {
      ...emptyFinalJeopardyState(),
      categoryRevealed: true,
      wagers: { a: 100, b: 200 },
      answers: { a: 'What is A?', b: 'What is B?' },
      submittedAnswerIds: ['a', 'b'],
      revealedPlayerIds: ['a'],
      judged: {},
    },
    activeGameId: null,
    gameBoardIds: [],
    currentBoardIndex: 0,
    boardTransition: null,
    clueRevealed: false,
    mediaRevealed: false,
    ...overrides,
  }
}

describe('sanitizeGameStateForPlayer', () => {
  it('keeps own wager/answer and revealed players only', () => {
    const sanitized = sanitizeGameStateForPlayer(baseState(), 'b')
    expect(sanitized.finalJeopardy?.wagers).toEqual({ a: 100, b: 200 })
    expect(sanitized.finalJeopardy?.answers).toEqual({
      a: 'What is A?',
      b: 'What is B?',
    })
  })

  it('hides other players unrevealed secrets', () => {
    const sanitized = sanitizeGameStateForPlayer(baseState(), 'a')
    expect(sanitized.finalJeopardy?.wagers).toEqual({ a: 100 })
    expect(sanitized.finalJeopardy?.answers).toEqual({ a: 'What is A?' })
  })

  it('passes through when finalJeopardy is null', () => {
    const state = baseState({ finalJeopardy: null, phase: 'board' })
    expect(sanitizeGameStateForPlayer(state, 'a')).toEqual(state)
  })
})
