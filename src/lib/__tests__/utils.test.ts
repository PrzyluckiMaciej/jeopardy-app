import { formatScore, formatBoardTimestamp, cellId, generateRoomCode, generateId, createDefaultBoard, createDefaultFinalJeopardy, isFinalBoard, orderPlayersForDisplay, getDailyDoubleQuestionIds } from '../utils'
import type { Board, Player } from '../../types'

function player(id: string, name: string): Player {
  return { id, name, score: 0, isConnected: true }
}

describe('orderPlayersForDisplay', () => {
  const alice = player('a', 'Alice')
  const bob = player('b', 'Bob')
  const carol = player('c', 'Carol')
  const players = [alice, bob, carol]

  it('preserves join order when myPlayerId is omitted', () => {
    expect(orderPlayersForDisplay(players)).toEqual(players)
  })

  it('moves the current player to the front while preserving relative order of others', () => {
    expect(orderPlayersForDisplay(players, 'b')).toEqual([bob, alice, carol])
    expect(orderPlayersForDisplay(players, 'c')).toEqual([carol, alice, bob])
  })

  it('returns the array unchanged when self is already first', () => {
    expect(orderPlayersForDisplay(players, 'a')).toEqual(players)
  })

  it('returns the array unchanged when myPlayerId is not found', () => {
    expect(orderPlayersForDisplay(players, 'missing')).toEqual(players)
  })
})

describe('getDailyDoubleQuestionIds', () => {
  const base: Board = {
    id: 'b1',
    name: 'Board',
    categories: [],
    pointValues: [200],
  }

  it('returns the ids array when present', () => {
    expect(getDailyDoubleQuestionIds({ ...base, dailyDoubleQuestionIds: ['a', 'b'] })).toEqual([
      'a',
      'b',
    ])
  })

  it('returns an empty array when ids are explicitly empty', () => {
    expect(getDailyDoubleQuestionIds({ ...base, dailyDoubleQuestionIds: [] })).toEqual([])
  })

  it('falls back to legacy single id', () => {
    expect(
      getDailyDoubleQuestionIds({ ...base, dailyDoubleQuestionId: 'legacy' } as Board & {
        dailyDoubleQuestionId?: string
      }),
    ).toEqual(['legacy'])
  })
})

describe('formatScore', () => {
  it('formats positive scores with dollar sign', () => {
    expect(formatScore(200)).toBe('$200')
  })

  it('formats zero', () => {
    expect(formatScore(0)).toBe('$0')
  })

  it('formats negative scores with minus and dollar sign', () => {
    expect(formatScore(-400)).toBe('-$400')
  })

  it('formats large numbers with locale grouping', () => {
    expect(formatScore(1000)).toBe(`$${(1000).toLocaleString()}`)
    expect(formatScore(15000)).toBe(`$${(15000).toLocaleString()}`)
  })

  it('formats large negative numbers with locale grouping', () => {
    expect(formatScore(-2500)).toBe(`-$${(2500).toLocaleString()}`)
  })
})

describe('formatBoardTimestamp', () => {
  it('returns a dash for null, undefined, and non-finite values', () => {
    expect(formatBoardTimestamp(null)).toBe('-')
    expect(formatBoardTimestamp(undefined)).toBe('-')
    expect(formatBoardTimestamp(Number.NaN)).toBe('-')
    expect(formatBoardTimestamp(Number.POSITIVE_INFINITY)).toBe('-')
  })

  it('formats a valid timestamp as dd.mm.yyyy HH:mm', () => {
    const date = new Date(2024, 5, 15, 18, 26)
    expect(formatBoardTimestamp(date.getTime())).toBe('15.06.2024 18:26')
  })
})

describe('cellId', () => {
  it('concatenates category and question ids with a dash', () => {
    expect(cellId('cat-1', 'q-1')).toBe('cat-1-q-1')
  })
})

describe('generateRoomCode', () => {
  const validChars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

  it('returns a 6-character string', () => {
    const code = generateRoomCode()
    expect(code).toHaveLength(6)
  })

  it('only contains non-ambiguous characters (no 0, O, 1, I)', () => {
    for (let i = 0; i < 50; i++) {
      const code = generateRoomCode()
      for (const ch of code) {
        expect(validChars).toContain(ch)
      }
    }
  })
})

describe('generateId', () => {
  it('returns a valid UUID v4 format', () => {
    const id = generateId()
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    )
  })

  it('returns unique values on successive calls', () => {
    const ids = new Set(Array.from({ length: 20 }, () => generateId()))
    expect(ids.size).toBe(20)
  })
})

describe('createDefaultBoard', () => {
  it('creates a board with the default name', () => {
    const board = createDefaultBoard()
    expect(board.name).toBe('New Board')
  })

  it('has a valid id', () => {
    const board = createDefaultBoard()
    expect(board.id).toBeTruthy()
  })

  it('has 6 categories', () => {
    const board = createDefaultBoard()
    expect(board.categories).toHaveLength(6)
  })

  it('names categories sequentially', () => {
    const board = createDefaultBoard()
    board.categories.forEach((cat, i) => {
      expect(cat.name).toBe(`Category ${i + 1}`)
    })
  })

  it('each category has 5 questions with correct point values', () => {
    const board = createDefaultBoard()
    const expectedPoints = [200, 400, 600, 800, 1000]

    board.categories.forEach((cat) => {
      expect(cat.questions).toHaveLength(5)
      cat.questions.forEach((q, i) => {
        expect(q.points).toBe(expectedPoints[i])
        expect(q.question).toBe('')
        expect(q.answer).toBe('')
      })
    })
  })

  it('each category defaults to syncing settings with global', () => {
    const board = createDefaultBoard()
    board.categories.forEach((cat) => {
      expect(cat.syncSettingsWithGlobal).toBe(true)
    })
  })

  it('sets pointValues array on the board', () => {
    const board = createDefaultBoard()
    expect(board.pointValues).toEqual([200, 400, 600, 800, 1000])
  })

  it('sets createdAt and updatedAt timestamps', () => {
    const before = Date.now()
    const board = createDefaultBoard()
    const after = Date.now()

    expect(board.createdAt).toBeGreaterThanOrEqual(before)
    expect(board.createdAt).toBeLessThanOrEqual(after)
    expect(board.updatedAt).toBeGreaterThanOrEqual(before)
    expect(board.updatedAt).toBeLessThanOrEqual(after)
  })

  it('marks kind as board', () => {
    expect(createDefaultBoard().kind).toBe('board')
  })
})

describe('createDefaultFinalJeopardy', () => {
  it('creates a final board with one category and one question', () => {
    const board = createDefaultFinalJeopardy()
    expect(board.kind).toBe('final')
    expect(board.name).toBe('Final Jeopardy')
    expect(board.categories).toHaveLength(1)
    expect(board.categories[0].questions).toHaveLength(1)
    expect(isFinalBoard(board)).toBe(true)
  })

  it('isFinalBoard treats missing kind as regular board', () => {
    expect(isFinalBoard({ kind: undefined })).toBe(false)
    expect(isFinalBoard({ kind: 'board' })).toBe(false)
    expect(isFinalBoard({ kind: 'final' })).toBe(true)
  })
})
