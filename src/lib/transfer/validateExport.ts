import type { BoardKind, Category, Question } from '../../types'
import {
  EXPORT_FORMAT,
  EXPORT_VERSION,
  TransferValidationError,
  type ExplorerContext,
  type ExportEnvelope,
  type ExportKind,
  type ExportedBoardFolderNode,
  type ExportedBoardPackage,
  type ExportedGameFolderNode,
  type ExportedGamePackage,
  type ExportedMedia,
} from './types'

const BOARD_KINDS: ReadonlySet<string> = new Set(['board', 'final'])
const MEDIA_TYPES: ReadonlySet<string> = new Set(['image', 'audio', 'video'])
const DATA_URL_RE = /^data:[^;]+;base64,/

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TransferValidationError(`Invalid or missing ${field}.`)
  }
  return value
}

function requireArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new TransferValidationError(`Invalid or missing ${field}.`)
  }
  return value
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function validateQuestion(raw: unknown, index: number): Question {
  if (!isPlainObject(raw)) {
    throw new TransferValidationError(`Invalid question at index ${index}.`)
  }
  const id = requireString(raw.id, `question[${index}].id`)
  const question = typeof raw.question === 'string' ? raw.question : ''
  const answer = typeof raw.answer === 'string' ? raw.answer : ''
  const points = typeof raw.points === 'number' && Number.isFinite(raw.points) ? raw.points : 0

  const result: Question = { id, question, answer, points }

  if (raw.mediaId != null) {
    result.mediaId = requireString(raw.mediaId, `question[${index}].mediaId`)
  }
  if (raw.mediaType != null) {
    if (typeof raw.mediaType !== 'string' || !MEDIA_TYPES.has(raw.mediaType)) {
      throw new TransferValidationError(`Invalid mediaType on question ${id}.`)
    }
    result.mediaType = raw.mediaType as Question['mediaType']
  }
  if (typeof raw.autoplayMedia === 'boolean') {
    result.autoplayMedia = raw.autoplayMedia
  }
  return result
}

function validateCategory(raw: unknown, index: number): Category {
  if (!isPlainObject(raw)) {
    throw new TransferValidationError(`Invalid category at index ${index}.`)
  }
  const id = requireString(raw.id, `category[${index}].id`)
  const name = typeof raw.name === 'string' ? raw.name : ''
  const questions = requireArray(raw.questions, `category[${index}].questions`).map(
    (q, qi) => validateQuestion(q, qi),
  )
  const category: Category = { id, name, questions }
  if (typeof raw.syncSettingsWithGlobal === 'boolean') {
    category.syncSettingsWithGlobal = raw.syncSettingsWithGlobal
  }
  if (isPlainObject(raw.settings)) {
    category.settings = raw.settings as Category['settings']
  }
  return category
}

function validateBoardData(raw: unknown): ExportedBoardPackage['board'] {
  if (!isPlainObject(raw)) {
    throw new TransferValidationError('Invalid board data.')
  }
  const id = requireString(raw.id, 'board.id')
  const name = requireString(raw.name, 'board.name')
  const categories = requireArray(raw.categories, 'board.categories').map((c, i) =>
    validateCategory(c, i),
  )
  const pointValues = requireArray(raw.pointValues, 'board.pointValues').map((v, i) => {
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      throw new TransferValidationError(`Invalid pointValues[${i}].`)
    }
    return v
  })

  let kind: BoardKind | undefined
  if (raw.kind != null) {
    if (typeof raw.kind !== 'string' || !BOARD_KINDS.has(raw.kind)) {
      throw new TransferValidationError('Invalid board.kind.')
    }
    kind = raw.kind as BoardKind
  }

  const board: ExportedBoardPackage['board'] = {
    id,
    name,
    categories,
    pointValues,
    kind,
  }

  if (Array.isArray(raw.dailyDoubleQuestionIds)) {
    board.dailyDoubleQuestionIds = raw.dailyDoubleQuestionIds.filter(
      (id): id is string => typeof id === 'string',
    )
  }
  if (typeof raw.createdAt === 'number') board.createdAt = raw.createdAt
  if (typeof raw.updatedAt === 'number') board.updatedAt = raw.updatedAt

  return board
}

function validateMedia(raw: unknown, index: number): ExportedMedia {
  if (!isPlainObject(raw)) {
    throw new TransferValidationError(`Invalid media entry at index ${index}.`)
  }
  const id = requireString(raw.id, `media[${index}].id`)
  const questionId = requireString(raw.questionId, `media[${index}].questionId`)
  const mimeType = requireString(raw.mimeType, `media[${index}].mimeType`)
  const dataUrl = requireString(raw.dataUrl, `media[${index}].dataUrl`)
  if (!DATA_URL_RE.test(dataUrl)) {
    throw new TransferValidationError(`Media entry ${id} has an invalid data URL.`)
  }
  return { id, questionId, mimeType, dataUrl }
}

function validateBoardPackage(raw: unknown): ExportedBoardPackage {
  if (!isPlainObject(raw)) {
    throw new TransferValidationError('Invalid board package.')
  }
  const board = validateBoardData(raw.board)
  const media = requireArray(raw.media, 'media').map((m, i) => validateMedia(m, i))

  const questionIds = new Set(
    board.categories.flatMap((c) => c.questions.map((q) => q.id)),
  )
  for (const m of media) {
    if (!questionIds.has(m.questionId)) {
      throw new TransferValidationError(
        `Media ${m.id} references unknown question ${m.questionId}.`,
      )
    }
  }

  return { board, media }
}

function validateBoardFolderNode(raw: unknown): ExportedBoardFolderNode {
  if (!isPlainObject(raw)) {
    throw new TransferValidationError('Invalid board folder package.')
  }
  const name = requireString(raw.name, 'folder.name')
  const folders = requireArray(raw.folders, 'folder.folders').map((f) =>
    validateBoardFolderNode(f),
  )
  const boards = requireArray(raw.boards, 'folder.boards').map((b) => validateBoardPackage(b))
  return { name, folders, boards }
}

function validateGamePackage(raw: unknown): ExportedGamePackage {
  if (!isPlainObject(raw)) {
    throw new TransferValidationError('Invalid game package.')
  }
  const name = requireString(raw.name, 'game.name')
  const boards = requireArray(raw.boards, 'game.boards').map((b) => validateBoardPackage(b))
  return { name, boards }
}

function validateGameFolderNode(raw: unknown, isRoot = true): ExportedGameFolderNode {
  if (!isPlainObject(raw)) {
    throw new TransferValidationError('Invalid game folder package.')
  }
  const name = requireString(raw.name, 'gameFolder.name')
  const folders = requireArray(raw.folders, 'gameFolder.folders').map((f) =>
    validateGameFolderNode(f, false),
  )
  const games = requireArray(raw.games, 'gameFolder.games').map((g, i) => {
    if (!isPlainObject(g)) {
      throw new TransferValidationError(`Invalid game at index ${i} in game folder.`)
    }
    return {
      name: requireString(g.name, `gameFolder.games[${i}].name`),
      boardExportIds: requireArray(g.boardExportIds, `gameFolder.games[${i}].boardExportIds`).map(
        (id, j) => requireString(id, `gameFolder.games[${i}].boardExportIds[${j}]`),
      ),
    }
  })

  const boards = requireArray(raw.boards ?? (isRoot ? undefined : []), 'gameFolder.boards').map(
    (b, i) => {
      if (!isPlainObject(b)) {
        throw new TransferValidationError(`Invalid shared board at index ${i}.`)
      }
      const exportId = requireString(b.exportId, `gameFolder.boards[${i}].exportId`)
      const pkg = validateBoardPackage(b)
      return { exportId, ...pkg }
    },
  )

  if (isRoot) {
    const known = new Set(boards.map((b) => b.exportId))
    for (const game of games) {
      for (const id of game.boardExportIds) {
        if (!known.has(id)) {
          throw new TransferValidationError(
            `Game "${game.name}" references unknown board exportId ${id}.`,
          )
        }
      }
    }
    for (const child of folders) {
      assertGameFolderRefs(child, known)
    }
  }

  return { name, folders, games, boards }
}

function assertGameFolderRefs(
  node: ExportedGameFolderNode,
  known: Set<string>,
): void {
  for (const game of node.games) {
    for (const id of game.boardExportIds) {
      if (!known.has(id)) {
        throw new TransferValidationError(
          `Game "${game.name}" references unknown board exportId ${id}.`,
        )
      }
    }
  }
  for (const child of node.folders) {
    assertGameFolderRefs(child, known)
  }
}

const KIND_CONTEXT: Record<ExportKind, ExplorerContext> = {
  board: 'boards',
  final: 'boards',
  'board-folder': 'boards',
  game: 'games',
  'game-folder': 'games',
}

/** Parse + validate a JSON value as an export envelope for the given explorer. */
export function parseAndValidateExport(
  raw: unknown,
  context: ExplorerContext,
): ExportEnvelope {
  if (!isPlainObject(raw)) {
    throw new TransferValidationError('File is not a valid Jeopardy export.')
  }
  if (raw.format !== EXPORT_FORMAT) {
    throw new TransferValidationError('File is not a Jeopardy export.')
  }
  if (raw.version !== EXPORT_VERSION) {
    throw new TransferValidationError(
      `Unsupported export version (expected ${EXPORT_VERSION}).`,
    )
  }
  if (typeof raw.exportedAt !== 'number' || !Number.isFinite(raw.exportedAt)) {
    throw new TransferValidationError('Export is missing exportedAt.')
  }
  const kind = optionalString(raw.kind) as ExportKind | undefined
  if (
    !kind ||
    !['board', 'final', 'board-folder', 'game', 'game-folder'].includes(kind)
  ) {
    throw new TransferValidationError('Export has an invalid kind.')
  }

  if (KIND_CONTEXT[kind] !== context) {
    throw new TransferValidationError(
      context === 'boards'
        ? 'This file is a game export. Open the Games tab to import it.'
        : 'This file is a board export. Open the Boards tab to import it.',
    )
  }

  const base = {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: raw.exportedAt,
  } as const

  switch (kind) {
    case 'board':
    case 'final': {
      const payload = validateBoardPackage(raw.payload)
      const boardKind = payload.board.kind === 'final' ? 'final' : 'board'
      if (boardKind !== kind) {
        throw new TransferValidationError(
          `Export kind "${kind}" does not match board kind "${boardKind}".`,
        )
      }
      return { ...base, kind, payload }
    }
    case 'board-folder':
      return { ...base, kind, payload: validateBoardFolderNode(raw.payload) }
    case 'game':
      return { ...base, kind, payload: validateGamePackage(raw.payload) }
    case 'game-folder':
      return { ...base, kind, payload: validateGameFolderNode(raw.payload) }
  }
}

export function expectedContextForKind(kind: ExportKind): ExplorerContext {
  return KIND_CONTEXT[kind]
}
