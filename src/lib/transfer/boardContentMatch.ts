import type { Board, BoardFolder, Category, CategorySettings, Question } from '../../types'
import { dataUrlToBlob, getMedia } from '../db'
import { buildPathString } from '../folderPath'
import { getDailyDoubleQuestionIds } from '../utils'
import { isBoardTrashed } from '../../store/gameStore'
import type { ExportedBoardData, ExportedBoardPackage, ExportedMedia } from './types'

type QuestionSlot = { catIndex: number; qIndex: number }

function boardKind(board: Pick<Board, 'kind'>): 'board' | 'final' {
  return board.kind === 'final' ? 'final' : 'board'
}

/** Build media lookup by questionId from an export package. */
function mediaByQuestionId(media: ExportedMedia[]): Map<string, ExportedMedia> {
  const map = new Map<string, ExportedMedia>()
  for (const m of media) map.set(m.questionId, m)
  return map
}

function dailyDoubleSlots(
  board: Pick<Board, 'categories' | 'dailyDoubleQuestionIds'> & { dailyDoubleQuestionId?: string },
): QuestionSlot[] {
  const ids = new Set(
    getDailyDoubleQuestionIds(board as Board & { dailyDoubleQuestionId?: string }),
  )
  const slots: QuestionSlot[] = []
  board.categories.forEach((cat, catIndex) => {
    cat.questions.forEach((q, qIndex) => {
      if (ids.has(q.id)) slots.push({ catIndex, qIndex })
    })
  })
  slots.sort((a, b) => a.catIndex - b.catIndex || a.qIndex - b.qIndex)
  return slots
}

function settingsEqual(a?: CategorySettings, b?: CategorySettings): boolean {
  if (a == null && b == null) return true
  if (a == null || b == null) return false
  return (
    a.autoBuzzQueue === b.autoBuzzQueue &&
    a.autoBuzzQueueOnMedia === b.autoBuzzQueueOnMedia &&
    a.blurClueOnBuzz === b.blurClueOnBuzz &&
    a.pauseMediaOnBuzz === b.pauseMediaOnBuzz &&
    a.autoRevealClue === b.autoRevealClue &&
    a.autoRevealMedia === b.autoRevealMedia
  )
}

function questionsStructurallyEqual(
  a: Question,
  b: Question,
  aHasMedia: boolean,
  bHasMedia: boolean,
): boolean {
  if (a.question !== b.question) return false
  if (a.answer !== b.answer) return false
  if (a.points !== b.points) return false
  if ((a.mediaType ?? undefined) !== (b.mediaType ?? undefined)) return false
  if ((a.autoplayMedia ?? undefined) !== (b.autoplayMedia ?? undefined)) return false
  if (aHasMedia !== bHasMedia) return false
  return true
}

function categoriesStructurallyEqual(
  a: Category[],
  b: Category[],
  exportMedia?: Map<string, ExportedMedia>,
): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    const ca = a[i]
    const cb = b[i]
    if (ca.name !== cb.name) return false
    if ((ca.syncSettingsWithGlobal ?? true) !== (cb.syncSettingsWithGlobal ?? true)) return false
    if (!settingsEqual(ca.settings, cb.settings)) return false
    if (ca.questions.length !== cb.questions.length) return false
    for (let j = 0; j < ca.questions.length; j++) {
      const qa = ca.questions[j]
      const qb = cb.questions[j]
      const aHas = exportMedia
        ? Boolean(qa.mediaId && exportMedia.has(qa.id))
        : Boolean(qa.mediaId)
      const bHas = Boolean(qb.mediaId)
      if (!questionsStructurallyEqual(qa, qb, aHas, bHas)) return false
    }
  }
  return true
}

function slotsEqual(a: QuestionSlot[], b: QuestionSlot[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i].catIndex !== b[i].catIndex || a[i].qIndex !== b[i].qIndex) return false
  }
  return true
}

/** ID-agnostic structural equality (media presence only; bytes checked separately). */
export function boardsStructurallyEqual(
  exported: ExportedBoardData,
  library: Board,
  exportMedia: ExportedMedia[],
): boolean {
  if (exported.name !== library.name) return false
  if (boardKind(exported) !== boardKind(library)) return false
  if (exported.pointValues.length !== library.pointValues.length) return false
  for (let i = 0; i < exported.pointValues.length; i++) {
    if (exported.pointValues[i] !== library.pointValues[i]) return false
  }
  const mediaMap = mediaByQuestionId(exportMedia)
  if (!categoriesStructurallyEqual(exported.categories, library.categories, mediaMap)) {
    return false
  }
  return slotsEqual(dailyDoubleSlots(exported), dailyDoubleSlots(library))
}

async function blobsEqual(a: Blob, b: Blob): Promise<boolean> {
  if (a.size !== b.size) return false
  const [ab, bb] = await Promise.all([a.arrayBuffer(), b.arrayBuffer()])
  const au = new Uint8Array(ab)
  const bu = new Uint8Array(bb)
  for (let i = 0; i < au.length; i++) {
    if (au[i] !== bu[i]) return false
  }
  return true
}

/** Compare export media entries to library IndexedDB blobs question-by-question. */
export async function boardMediaEqual(
  pkg: ExportedBoardPackage,
  library: Board,
): Promise<boolean> {
  const exportMedia = mediaByQuestionId(pkg.media)

  for (let ci = 0; ci < pkg.board.categories.length; ci++) {
    const exportCat = pkg.board.categories[ci]
    const libraryCat = library.categories[ci]
    if (!libraryCat) return false

    for (let qi = 0; qi < exportCat.questions.length; qi++) {
      const eq = exportCat.questions[qi]
      const lq = libraryCat.questions[qi]
      if (!lq) return false

      const exported = eq.mediaId ? exportMedia.get(eq.id) : undefined
      const libraryMediaId = lq.mediaId

      if (!exported && !libraryMediaId) continue
      if (!exported || !libraryMediaId) return false

      const rec = await getMedia(libraryMediaId)
      if (!rec) return false
      if (rec.mimeType !== exported.mimeType) return false

      const exportBlob = await dataUrlToBlob(exported.dataUrl)
      if (!(await blobsEqual(exportBlob, rec.blob))) return false
    }
  }
  return true
}

/**
 * Find a non-trashed library board at the same folder path with exact content+media.
 * Returns the board id, or null if none match / folderPath is missing.
 */
export async function findReusableBoard(
  pkg: ExportedBoardPackage,
  boards: Board[],
  folders: BoardFolder[],
): Promise<string | null> {
  if (pkg.folderPath == null || pkg.folderPath === '') return null

  const candidates = boards.filter(
    (b) =>
      !isBoardTrashed(b) &&
      buildPathString(folders, b.folderId ?? null) === pkg.folderPath,
  )

  for (const board of candidates) {
    if (!boardsStructurallyEqual(pkg.board, board, pkg.media)) continue
    if (await boardMediaEqual(pkg, board)) return board.id
  }
  return null
}
