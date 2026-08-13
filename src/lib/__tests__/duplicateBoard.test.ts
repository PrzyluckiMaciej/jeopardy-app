import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Board } from '../../types'
import { duplicateBoard } from '../duplicateBoard'

vi.mock('../db', () => ({
  getMedia: vi.fn(),
  saveMedia: vi.fn(),
}))

import { getMedia, saveMedia } from '../db'

function makeBoard(overrides: Partial<Board> = {}): Board {
  return {
    id: 'board-1',
    name: 'Test Board',
    pointValues: [200, 400, 600, 800, 1000],
    categories: [
      {
        id: 'cat-1',
        name: 'Science',
        questions: [
          { id: 'q-1', question: 'Q1', answer: 'A1', points: 200, mediaId: 'media-1', mediaType: 'image' },
          { id: 'q-2', question: 'Q2', answer: 'A2', points: 400 },
        ],
      },
    ],
    dailyDoubleQuestionIds: ['q-2'],
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  }
}

describe('duplicateBoard', () => {
  beforeEach(() => {
    vi.mocked(getMedia).mockReset()
    vi.mocked(saveMedia).mockReset()
  })

  it('creates a copy with new ids and updated name', async () => {
    vi.mocked(getMedia).mockResolvedValue(undefined)

    const copy = await duplicateBoard(makeBoard())

    expect(copy.id).not.toBe('board-1')
    expect(copy.name).toBe('Test Board (Copy)')
    expect(copy.createdAt).toBeGreaterThanOrEqual(1000)
    expect(copy.updatedAt).toBeGreaterThanOrEqual(1000)
    expect(copy.categories[0].id).not.toBe('cat-1')
    expect(copy.categories[0].questions[0].id).not.toBe('q-1')
    expect(copy.categories[0].questions[1].id).not.toBe('q-2')
    expect(copy.dailyDoubleQuestionIds).toEqual([copy.categories[0].questions[1].id])
  })

  it('maps multiple daily doubles to new question ids', async () => {
    vi.mocked(getMedia).mockResolvedValue(undefined)

    const copy = await duplicateBoard(
      makeBoard({ dailyDoubleQuestionIds: ['q-1', 'q-2'] }),
    )

    expect(copy.dailyDoubleQuestionIds).toEqual([
      copy.categories[0].questions[0].id,
      copy.categories[0].questions[1].id,
    ])
  })

  it('copies media attachments with new ids', async () => {
    const blob = new Blob(['img'], { type: 'image/png' })
    vi.mocked(getMedia).mockResolvedValue({
      id: 'media-1',
      boardId: 'board-1',
      questionId: 'q-1',
      mimeType: 'image/png',
      blob,
    })

    const copy = await duplicateBoard(makeBoard())

    expect(saveMedia).toHaveBeenCalledOnce()
    const saved = vi.mocked(saveMedia).mock.calls[0][0]
    expect(saved.id).not.toBe('media-1')
    expect(saved.boardId).toBe(copy.id)
    expect(saved.questionId).toBe(copy.categories[0].questions[0].id)
    expect(saved.blob).toBe(blob)
    expect(copy.categories[0].questions[0].mediaId).toBe(saved.id)
  })
})
