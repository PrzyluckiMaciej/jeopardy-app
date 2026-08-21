import { describe, expect, it } from 'vitest'
import { parseAndValidateExport } from '../validateExport'
import { EXPORT_FORMAT, EXPORT_VERSION, TransferValidationError } from '../types'

const boardPayload = {
  board: {
    id: 'b1',
    name: 'Test Board',
    kind: 'board' as const,
    categories: [
      {
        id: 'c1',
        name: 'Cat',
        questions: [{ id: 'q1', question: 'Q?', answer: 'A', points: 200 }],
      },
    ],
    pointValues: [200],
  },
  media: [],
}

describe('parseAndValidateExport', () => {
  it('accepts a valid board export in boards context', () => {
    const envelope = parseAndValidateExport(
      {
        format: EXPORT_FORMAT,
        version: EXPORT_VERSION,
        exportedAt: 1,
        kind: 'board',
        payload: boardPayload,
      },
      'boards',
    )
    expect(envelope.kind).toBe('board')
    expect(envelope.payload.board.name).toBe('Test Board')
  })

  it('rejects board export in games context', () => {
    expect(() =>
      parseAndValidateExport(
        {
          format: EXPORT_FORMAT,
          version: EXPORT_VERSION,
          exportedAt: 1,
          kind: 'board',
          payload: boardPayload,
        },
        'games',
      ),
    ).toThrow(TransferValidationError)
  })

  it('rejects wrong format', () => {
    expect(() =>
      parseAndValidateExport({ format: 'other', version: 1, kind: 'board' }, 'boards'),
    ).toThrow(/not a Jeopardy export/)
  })

  it('rejects invalid media data URLs', () => {
    expect(() =>
      parseAndValidateExport(
        {
          format: EXPORT_FORMAT,
          version: EXPORT_VERSION,
          exportedAt: 1,
          kind: 'board',
          payload: {
            ...boardPayload,
            media: [
              {
                id: 'm1',
                questionId: 'q1',
                mimeType: 'image/png',
                dataUrl: 'not-a-data-url',
              },
            ],
          },
        },
        'boards',
      ),
    ).toThrow(/invalid data URL/)
  })
})
