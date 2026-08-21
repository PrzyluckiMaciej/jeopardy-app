import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Board, BoardFolder } from '../../../types'
import type { ExportedBoardPackage } from '../types'

vi.mock('../../db', () => ({
  getMedia: vi.fn(),
  dataUrlToBlob: vi.fn(),
}))

import { dataUrlToBlob, getMedia } from '../../db'
import { findReusableBoard } from '../boardContentMatch'

const PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

function makeBoard(overrides: Partial<Board> = {}): Board {
  return {
    id: 'lib-board-1',
    name: 'World Capitals',
    kind: 'board',
    pointValues: [200],
    categories: [
      {
        id: 'c1',
        name: 'Europe',
        questions: [
          {
            id: 'q1',
            question: 'Capital of France?',
            answer: 'Paris',
            points: 200,
          },
        ],
      },
    ],
    folderId: null,
    ...overrides,
  }
}

function makePkg(overrides: Partial<ExportedBoardPackage> = {}): ExportedBoardPackage {
  return {
    folderPath: '/',
    board: {
      id: 'export-board-1',
      name: 'World Capitals',
      kind: 'board',
      pointValues: [200],
      categories: [
        {
          id: 'ec1',
          name: 'Europe',
          questions: [
            {
              id: 'eq1',
              question: 'Capital of France?',
              answer: 'Paris',
              points: 200,
            },
          ],
        },
      ],
    },
    media: [],
    ...overrides,
  }
}

function makeFolder(
  overrides: Partial<BoardFolder> & Pick<BoardFolder, 'id' | 'name' | 'parentId'>,
): BoardFolder {
  return {
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

describe('findReusableBoard', () => {
  beforeEach(() => {
    vi.mocked(getMedia).mockReset()
    vi.mocked(dataUrlToBlob).mockReset()
  })

  it('reuses a board with matching path and content', async () => {
    const library = makeBoard()
    const id = await findReusableBoard(makePkg(), [library], [])
    expect(id).toBe('lib-board-1')
  })

  it('returns null when folderPath is missing', async () => {
    const library = makeBoard()
    const pkg = makePkg()
    delete pkg.folderPath
    const id = await findReusableBoard(pkg, [library], [])
    expect(id).toBeNull()
  })

  it('returns null when content matches but folder path differs', async () => {
    const folders: BoardFolder[] = [makeFolder({ id: 'f1', name: 'Sports', parentId: null })]
    const library = makeBoard({ folderId: 'f1' })
    const id = await findReusableBoard(makePkg({ folderPath: '/' }), [library], folders)
    expect(id).toBeNull()
  })

  it('returns null when path matches but content differs', async () => {
    const library = makeBoard()
    const pkg = makePkg()
    pkg.board.categories[0].questions[0].answer = 'Lyon'
    const id = await findReusableBoard(pkg, [library], [])
    expect(id).toBeNull()
  })

  it('returns null when media bytes differ', async () => {
    const library = makeBoard({
      categories: [
        {
          id: 'c1',
          name: 'Europe',
          questions: [
            {
              id: 'q1',
              question: 'Capital of France?',
              answer: 'Paris',
              points: 200,
              mediaId: 'lib-media',
              mediaType: 'image',
            },
          ],
        },
      ],
    })
    const pkg = makePkg({
      board: {
        id: 'export-board-1',
        name: 'World Capitals',
        kind: 'board',
        pointValues: [200],
        categories: [
          {
            id: 'ec1',
            name: 'Europe',
            questions: [
              {
                id: 'eq1',
                question: 'Capital of France?',
                answer: 'Paris',
                points: 200,
                mediaId: 'export-media',
                mediaType: 'image',
              },
            ],
          },
        ],
      },
      media: [
        {
          id: 'export-media',
          questionId: 'eq1',
          mimeType: 'image/png',
          dataUrl: PNG_DATA_URL,
        },
      ],
    })

    vi.mocked(getMedia).mockResolvedValue({
      id: 'lib-media',
      boardId: 'lib-board-1',
      questionId: 'q1',
      mimeType: 'image/png',
      blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }),
    })
    vi.mocked(dataUrlToBlob).mockResolvedValue(
      new Blob([new Uint8Array([9, 9, 9])], { type: 'image/png' }),
    )

    const id = await findReusableBoard(pkg, [library], [])
    expect(id).toBeNull()
  })

  it('reuses when media bytes match', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4])
    const library = makeBoard({
      categories: [
        {
          id: 'c1',
          name: 'Europe',
          questions: [
            {
              id: 'q1',
              question: 'Capital of France?',
              answer: 'Paris',
              points: 200,
              mediaId: 'lib-media',
              mediaType: 'image',
            },
          ],
        },
      ],
    })
    const pkg = makePkg({
      board: {
        id: 'export-board-1',
        name: 'World Capitals',
        kind: 'board',
        pointValues: [200],
        categories: [
          {
            id: 'ec1',
            name: 'Europe',
            questions: [
              {
                id: 'eq1',
                question: 'Capital of France?',
                answer: 'Paris',
                points: 200,
                mediaId: 'export-media',
                mediaType: 'image',
              },
            ],
          },
        ],
      },
      media: [
        {
          id: 'export-media',
          questionId: 'eq1',
          mimeType: 'image/png',
          dataUrl: PNG_DATA_URL,
        },
      ],
    })

    vi.mocked(getMedia).mockResolvedValue({
      id: 'lib-media',
      boardId: 'lib-board-1',
      questionId: 'q1',
      mimeType: 'image/png',
      blob: new Blob([bytes], { type: 'image/png' }),
    })
    vi.mocked(dataUrlToBlob).mockResolvedValue(new Blob([bytes], { type: 'image/png' }))

    const id = await findReusableBoard(pkg, [library], [])
    expect(id).toBe('lib-board-1')
  })

  it('skips trashed boards', async () => {
    const library = makeBoard({ trashedAt: Date.now() })
    const id = await findReusableBoard(makePkg(), [library], [])
    expect(id).toBeNull()
  })

  it('matches nested folder paths', async () => {
    const folders: BoardFolder[] = [
      makeFolder({ id: 'f1', name: 'Trivia', parentId: null }),
      makeFolder({ id: 'f2', name: 'Geography', parentId: 'f1' }),
    ]
    const library = makeBoard({ folderId: 'f2' })
    const id = await findReusableBoard(
      makePkg({ folderPath: '/Trivia/Geography' }),
      [library],
      folders,
    )
    expect(id).toBe('lib-board-1')
  })
})
