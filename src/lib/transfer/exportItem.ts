import type { Board, BoardFolder, Game, GameFolder } from '../../types'
import { blobToDataUrl, getMedia } from '../db'
import { collectFolderSubtree } from '../folderSubtree'
import { isBoardTrashed, isFolderTrashed, isGameFolderTrashed, isGameTrashed } from '../../store/gameStore'
import {
  EXPORT_FORMAT,
  EXPORT_VERSION,
  TransferValidationError,
  checkTransferAbort,
  exportKindForBoard,
  type ExportEnvelope,
  type ExportedBoardFolderNode,
  type ExportedBoardPackage,
  type ExportedGameFolderBoard,
  type ExportedGameFolderNode,
  type ExportedMedia,
  type OnTransferProgress,
} from './types'

export interface ExportBoardContext {
  boards: Board[]
  folders: BoardFolder[]
}

export interface ExportGameContext extends ExportBoardContext {
  games: Game[]
  gameFolders: GameFolder[]
}

interface ProgressTracker {
  done: number
  total: number
  onProgress?: OnTransferProgress
  signal?: AbortSignal
}

function report(tracker: ProgressTracker, label?: string) {
  tracker.onProgress?.({
    done: tracker.done,
    total: Math.max(tracker.total, 1),
    label,
  })
}

function stripBoardPlacement(board: Board): ExportedBoardPackage['board'] {
  const {
    folderId: _f,
    trashedAt: _t,
    restoreFolderId: _r,
    ...rest
  } = board
  return { ...rest }
}

async function collectBoardMedia(
  board: Board,
  tracker: ProgressTracker,
): Promise<ExportedMedia[]> {
  const media: ExportedMedia[] = []
  for (const cat of board.categories) {
    for (const q of cat.questions) {
      if (!q.mediaId) continue
      checkTransferAbort(tracker.signal)
      const rec = await getMedia(q.mediaId)
      if (!rec) {
        tracker.done += 1
        report(tracker, `Skipping missing media`)
        continue
      }
      const dataUrl = await blobToDataUrl(rec.blob)
      media.push({
        id: rec.id,
        questionId: q.id,
        mimeType: rec.mimeType,
        dataUrl,
      })
      tracker.done += 1
      report(tracker, `Encoding ${q.mediaType ?? 'media'}`)
    }
  }
  return media
}

function countBoardMedia(board: Board): number {
  let n = 0
  for (const cat of board.categories) {
    for (const q of cat.questions) {
      if (q.mediaId) n += 1
    }
  }
  return n
}

async function packageBoard(
  board: Board,
  tracker: ProgressTracker,
): Promise<ExportedBoardPackage> {
  checkTransferAbort(tracker.signal)
  const media = await collectBoardMedia(board, tracker)
  return {
    board: stripBoardPlacement(board),
    media,
  }
}

function countFolderMedia(
  folderId: string,
  folders: BoardFolder[],
  boards: Board[],
): number {
  const subtree = collectFolderSubtree(folders, folderId)
  let n = 0
  for (const board of boards) {
    if (isBoardTrashed(board)) continue
    if (board.folderId != null && subtree.has(board.folderId)) {
      n += countBoardMedia(board)
    }
  }
  return n
}

async function buildBoardFolderNode(
  folder: BoardFolder,
  folders: BoardFolder[],
  boards: Board[],
  tracker: ProgressTracker,
): Promise<ExportedBoardFolderNode> {
  checkTransferAbort(tracker.signal)
  const childFolders = folders
    .filter((f) => f.parentId === folder.id && !isFolderTrashed(f))
    .sort((a, b) => a.name.localeCompare(b.name))

  const foldersOut: ExportedBoardFolderNode[] = []
  for (const child of childFolders) {
    foldersOut.push(await buildBoardFolderNode(child, folders, boards, tracker))
  }

  const childBoards = boards
    .filter((b) => (b.folderId ?? null) === folder.id && !isBoardTrashed(b))
    .sort((a, b) => a.name.localeCompare(b.name))

  const boardsOut: ExportedBoardPackage[] = []
  for (const board of childBoards) {
    boardsOut.push(await packageBoard(board, tracker))
  }

  tracker.done += 1
  report(tracker, `Folder ${folder.name}`)

  return {
    name: folder.name,
    folders: foldersOut,
    boards: boardsOut,
  }
}

function countGameFolderMedia(
  folderId: string,
  gameFolders: GameFolder[],
  games: Game[],
  boards: Board[],
): { media: number; structure: number; boardIds: Set<string> } {
  const subtree = collectFolderSubtree(gameFolders, folderId)
  const boardIds = new Set<string>()
  let structure = 0

  function walk(id: string) {
    structure += 1
    for (const f of gameFolders) {
      if (f.parentId === id && !isGameFolderTrashed(f)) walk(f.id)
    }
    for (const g of games) {
      if ((g.folderId ?? null) === id && !isGameTrashed(g)) {
        structure += 1
        for (const bid of g.boardIds) boardIds.add(bid)
      }
    }
  }
  walk(folderId)

  let media = 0
  for (const bid of boardIds) {
    const board = boards.find((b) => b.id === bid && !isBoardTrashed(b))
    if (board) media += countBoardMedia(board)
  }
  return { media, structure, boardIds }
}

async function buildGameFolderNode(
  folder: GameFolder,
  ctx: ExportGameContext,
  tracker: ProgressTracker,
  sharedBoards: Map<string, ExportedGameFolderBoard>,
  isRoot: boolean,
): Promise<ExportedGameFolderNode> {
  checkTransferAbort(tracker.signal)

  const childFolders = ctx.gameFolders
    .filter((f) => f.parentId === folder.id && !isGameFolderTrashed(f))
    .sort((a, b) => a.name.localeCompare(b.name))

  const foldersOut: ExportedGameFolderNode[] = []
  for (const child of childFolders) {
    foldersOut.push(await buildGameFolderNode(child, ctx, tracker, sharedBoards, false))
  }

  const childGames = ctx.games
    .filter((g) => (g.folderId ?? null) === folder.id && !isGameTrashed(g))
    .sort((a, b) => a.name.localeCompare(b.name))

  const gamesOut: ExportedGameFolderNode['games'] = []
  for (const game of childGames) {
    checkTransferAbort(tracker.signal)
    const boardExportIds: string[] = []
    for (const boardId of game.boardIds) {
      if (sharedBoards.has(boardId)) {
        boardExportIds.push(boardId)
        continue
      }
      const board = ctx.boards.find((b) => b.id === boardId && !isBoardTrashed(b))
      if (!board) continue
      const pkg = await packageBoard(board, tracker)
      sharedBoards.set(boardId, { exportId: boardId, ...pkg })
      boardExportIds.push(boardId)
    }
    gamesOut.push({ name: game.name, boardExportIds })
    tracker.done += 1
    report(tracker, `Game ${game.name}`)
  }

  tracker.done += 1
  report(tracker, `Folder ${folder.name}`)

  return {
    name: folder.name,
    folders: foldersOut,
    games: gamesOut,
    boards: isRoot ? [...sharedBoards.values()] : [],
  }
}

export async function exportBoardItem(
  board: Board,
  options?: { signal?: AbortSignal; onProgress?: OnTransferProgress },
): Promise<ExportEnvelope> {
  const mediaCount = countBoardMedia(board)
  const tracker: ProgressTracker = {
    done: 0,
    total: mediaCount + 1,
    onProgress: options?.onProgress,
    signal: options?.signal,
  }
  report(tracker, 'Preparing board')
  const payload = await packageBoard(board, tracker)
  tracker.done = tracker.total
  report(tracker, 'Done')
  const kind = exportKindForBoard(board)
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: Date.now(),
    kind,
    payload,
  }
}

export async function exportBoardFolderItem(
  folder: BoardFolder,
  ctx: ExportBoardContext,
  options?: { signal?: AbortSignal; onProgress?: OnTransferProgress },
): Promise<ExportEnvelope> {
  if (isFolderTrashed(folder)) {
    throw new TransferValidationError('Cannot export a trashed folder.')
  }
  const mediaCount = countFolderMedia(folder.id, ctx.folders, ctx.boards)
  const subtreeSize = collectFolderSubtree(ctx.folders, folder.id).size
  const tracker: ProgressTracker = {
    done: 0,
    total: mediaCount + subtreeSize,
    onProgress: options?.onProgress,
    signal: options?.signal,
  }
  report(tracker, 'Preparing folder')
  const payload = await buildBoardFolderNode(folder, ctx.folders, ctx.boards, tracker)
  tracker.done = tracker.total
  report(tracker, 'Done')
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: Date.now(),
    kind: 'board-folder',
    payload,
  }
}

export async function exportGameItem(
  game: Game,
  ctx: ExportBoardContext,
  options?: { signal?: AbortSignal; onProgress?: OnTransferProgress },
): Promise<ExportEnvelope> {
  if (isGameTrashed(game)) {
    throw new TransferValidationError('Cannot export a trashed game.')
  }
  const linked = game.boardIds
    .map((id) => ctx.boards.find((b) => b.id === id && !isBoardTrashed(b)))
    .filter((b): b is Board => !!b)

  if (linked.length === 0 && game.boardIds.length > 0) {
    throw new TransferValidationError('Game has no available boards to export.')
  }

  const mediaCount = linked.reduce((n, b) => n + countBoardMedia(b), 0)
  const tracker: ProgressTracker = {
    done: 0,
    total: mediaCount + linked.length + 1,
    onProgress: options?.onProgress,
    signal: options?.signal,
  }
  report(tracker, 'Preparing game')

  const boards: ExportedBoardPackage[] = []
  for (const board of linked) {
    boards.push(await packageBoard(board, tracker))
    tracker.done += 1
    report(tracker, `Board ${board.name}`)
  }

  tracker.done = tracker.total
  report(tracker, 'Done')

  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: Date.now(),
    kind: 'game',
    payload: { name: game.name, boards },
  }
}

export async function exportGameFolderItem(
  folder: GameFolder,
  ctx: ExportGameContext,
  options?: { signal?: AbortSignal; onProgress?: OnTransferProgress },
): Promise<ExportEnvelope> {
  if (isGameFolderTrashed(folder)) {
    throw new TransferValidationError('Cannot export a trashed folder.')
  }
  const counts = countGameFolderMedia(folder.id, ctx.gameFolders, ctx.games, ctx.boards)
  const tracker: ProgressTracker = {
    done: 0,
    total: counts.media + counts.structure,
    onProgress: options?.onProgress,
    signal: options?.signal,
  }
  report(tracker, 'Preparing game folder')
  const sharedBoards = new Map<string, ExportedGameFolderBoard>()
  const payload = await buildGameFolderNode(folder, ctx, tracker, sharedBoards, true)
  // Ensure root carries all shared boards collected during walk
  payload.boards = [...sharedBoards.values()]
  tracker.done = tracker.total
  report(tracker, 'Done')
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: Date.now(),
    kind: 'game-folder',
    payload,
  }
}
