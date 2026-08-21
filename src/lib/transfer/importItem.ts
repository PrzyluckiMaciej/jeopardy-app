import type { Board, BoardKind } from '../../types'
import { dataUrlToBlob, deleteMedia, saveMedia } from '../db'
import { mimeTypeToMediaType } from '../mediaType'
import { generateId, getDailyDoubleQuestionIds } from '../utils'
import { uniqueBoardName, useBoardStore } from '../../store/gameStore'
import {
  checkTransferAbort,
  type ExportEnvelope,
  type ExportedBoardFolderNode,
  type ExportedBoardPackage,
  type ExportedGameFolderNode,
  type ExportedGamePackage,
  type OnTransferProgress,
} from './types'

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

interface CreatedIds {
  boardIds: string[]
  folderIds: string[]
  gameIds: string[]
  gameFolderIds: string[]
  mediaIds: string[]
}

function emptyCreated(): CreatedIds {
  return {
    boardIds: [],
    folderIds: [],
    gameIds: [],
    gameFolderIds: [],
    mediaIds: [],
  }
}

async function cleanupCreated(created: CreatedIds): Promise<void> {
  const store = useBoardStore.getState()
  for (const id of created.mediaIds) {
    try {
      await deleteMedia(id)
    } catch {
      /* ignore */
    }
  }
  for (const id of created.gameFolderIds) {
    store.deleteGameFolder(id)
  }
  for (const id of created.gameIds) {
    store.deleteGame(id)
  }
  for (const id of created.folderIds) {
    store.deleteFolder(id)
  }
  for (const id of created.boardIds) {
    store.deleteBoard(id)
  }
}

/** Materialize an exported board with new IDs and media into a target folder. */
async function importBoardPackage(
  pkg: ExportedBoardPackage,
  folderId: string | null,
  tracker: ProgressTracker,
  created: CreatedIds,
): Promise<string> {
  checkTransferAbort(tracker.signal)

  const now = Date.now()
  const newBoardId = generateId()
  const questionIdMap = new Map<string, string>()
  const mediaIdMap = new Map<string, string>()

  // Decode media first so we can abort before store writes when possible
  const decoded: Array<{ oldId: string; questionId: string; mimeType: string; blob: Blob }> = []
  for (const m of pkg.media) {
    checkTransferAbort(tracker.signal)
    const blob = await dataUrlToBlob(m.dataUrl)
    decoded.push({
      oldId: m.id,
      questionId: m.questionId,
      mimeType: m.mimeType,
      blob,
    })
    tracker.done += 1
    report(tracker, 'Decoding media')
  }

  const categories = pkg.board.categories.map((cat) => {
    const newCategoryId = generateId()
    const questions = cat.questions.map((q) => {
      const newQuestionId = generateId()
      questionIdMap.set(q.id, newQuestionId)

      let mediaId = q.mediaId
      let mediaType = q.mediaType
      if (q.mediaId) {
        const src = decoded.find((d) => d.oldId === q.mediaId)
        if (src) {
          const newMediaId = generateId()
          mediaIdMap.set(q.mediaId, newMediaId)
          mediaId = newMediaId
          if (!mediaType) mediaType = mimeTypeToMediaType(src.mimeType)
        } else {
          mediaId = undefined
          mediaType = undefined
        }
      }

      return {
        ...q,
        id: newQuestionId,
        mediaId,
        mediaType,
        autoplayMedia:
          mediaId && (mediaType === 'audio' || mediaType === 'video')
            ? q.autoplayMedia
            : undefined,
      }
    })
    return {
      ...cat,
      id: newCategoryId,
      questions,
    }
  })

  for (const src of decoded) {
    checkTransferAbort(tracker.signal)
    const newMediaId = mediaIdMap.get(src.oldId)
    const newQuestionId = questionIdMap.get(src.questionId)
    if (!newMediaId || !newQuestionId) continue
    await saveMedia({
      id: newMediaId,
      boardId: newBoardId,
      questionId: newQuestionId,
      mimeType: src.mimeType,
      blob: src.blob,
    })
    created.mediaIds.push(newMediaId)
    tracker.done += 1
    report(tracker, 'Saving media')
  }

  const kind: BoardKind = pkg.board.kind === 'final' ? 'final' : 'board'
  const store = useBoardStore.getState()
  const uniqueName = uniqueBoardName(store.boards, folderId, pkg.board.name, kind)

  const board: Board = {
    ...pkg.board,
    id: newBoardId,
    name: uniqueName,
    kind,
    categories,
    dailyDoubleQuestionIds: getDailyDoubleQuestionIds(pkg.board)
      .map((id) => questionIdMap.get(id))
      .filter((id): id is string => !!id),
    folderId,
    trashedAt: null,
    restoreFolderId: null,
    createdAt: now,
    updatedAt: now,
  }

  store.saveBoard(board)
  created.boardIds.push(newBoardId)
  tracker.done += 1
  report(tracker, `Imported ${uniqueName}`)
  return newBoardId
}

function countBoardPackageWork(pkg: ExportedBoardPackage): number {
  // decode + save per media + 1 board write
  return pkg.media.length * 2 + 1
}

function countBoardFolderWork(node: ExportedBoardFolderNode): number {
  let n = 1 // folder create
  for (const child of node.folders) n += countBoardFolderWork(child)
  for (const board of node.boards) n += countBoardPackageWork(board)
  return n
}

function countGameWork(pkg: ExportedGamePackage): number {
  return pkg.boards.reduce((n, b) => n + countBoardPackageWork(b), 0) + 1
}

function countGameFolderWork(node: ExportedGameFolderNode, isRoot: boolean): number {
  let n = 1
  for (const child of node.folders) n += countGameFolderWork(child, false)
  n += node.games.length
  if (isRoot) {
    for (const board of node.boards) n += countBoardPackageWork(board)
  }
  return n
}

async function importBoardFolderNode(
  node: ExportedBoardFolderNode,
  parentId: string | null,
  tracker: ProgressTracker,
  created: CreatedIds,
): Promise<string> {
  checkTransferAbort(tracker.signal)
  const store = useBoardStore.getState()
  const folderId = store.createFolder(node.name, parentId)
  created.folderIds.push(folderId)
  tracker.done += 1
  report(tracker, `Folder ${node.name}`)

  for (const child of node.folders) {
    await importBoardFolderNode(child, folderId, tracker, created)
  }
  for (const board of node.boards) {
    await importBoardPackage(board, folderId, tracker, created)
  }
  return folderId
}

async function importGamePackage(
  pkg: ExportedGamePackage,
  gameFolderId: string | null,
  tracker: ProgressTracker,
  created: CreatedIds,
): Promise<string> {
  checkTransferAbort(tracker.signal)
  const boardIds: string[] = []
  for (const boardPkg of pkg.boards) {
    // Boards from game imports land in All Boards root
    const id = await importBoardPackage(boardPkg, null, tracker, created)
    boardIds.push(id)
  }

  const store = useBoardStore.getState()
  const gameId = store.createGame(pkg.name, gameFolderId)
  created.gameIds.push(gameId)
  for (const boardId of boardIds) {
    store.addBoardToGame(gameId, boardId)
  }
  tracker.done += 1
  report(tracker, `Game ${pkg.name}`)
  return gameId
}

async function importGameFolderNode(
  node: ExportedGameFolderNode,
  parentId: string | null,
  sharedBoardMap: Map<string, string>,
  rootBoards: ExportedGameFolderNode['boards'],
  tracker: ProgressTracker,
  created: CreatedIds,
  isRoot: boolean,
): Promise<string> {
  checkTransferAbort(tracker.signal)

  if (isRoot) {
    for (const boardPkg of rootBoards) {
      const newId = await importBoardPackage(boardPkg, null, tracker, created)
      sharedBoardMap.set(boardPkg.exportId, newId)
    }
  }

  const store = useBoardStore.getState()
  const folderId = store.createGameFolder(node.name, parentId)
  created.gameFolderIds.push(folderId)
  tracker.done += 1
  report(tracker, `Folder ${node.name}`)

  for (const child of node.folders) {
    await importGameFolderNode(
      child,
      folderId,
      sharedBoardMap,
      rootBoards,
      tracker,
      created,
      false,
    )
  }

  for (const game of node.games) {
    checkTransferAbort(tracker.signal)
    const gameId = store.createGame(game.name, folderId)
    created.gameIds.push(gameId)
    for (const exportId of game.boardExportIds) {
      const boardId = sharedBoardMap.get(exportId)
      if (boardId) store.addBoardToGame(gameId, boardId)
    }
    tracker.done += 1
    report(tracker, `Game ${game.name}`)
  }

  return folderId
}

export async function importEnvelope(
  envelope: ExportEnvelope,
  targetFolderId: string | null,
  options?: { signal?: AbortSignal; onProgress?: OnTransferProgress },
): Promise<void> {
  const created = emptyCreated()
  const tracker: ProgressTracker = {
    done: 0,
    total: 1,
    onProgress: options?.onProgress,
    signal: options?.signal,
  }

  try {
    switch (envelope.kind) {
      case 'board':
      case 'final': {
        tracker.total = countBoardPackageWork(envelope.payload)
        report(tracker, 'Importing board')
        await importBoardPackage(envelope.payload, targetFolderId, tracker, created)
        break
      }
      case 'board-folder': {
        tracker.total = countBoardFolderWork(envelope.payload)
        report(tracker, 'Importing folder')
        await importBoardFolderNode(envelope.payload, targetFolderId, tracker, created)
        break
      }
      case 'game': {
        tracker.total = countGameWork(envelope.payload)
        report(tracker, 'Importing game')
        await importGamePackage(envelope.payload, targetFolderId, tracker, created)
        break
      }
      case 'game-folder': {
        tracker.total = countGameFolderWork(envelope.payload, true)
        report(tracker, 'Importing game folder')
        await importGameFolderNode(
          envelope.payload,
          targetFolderId,
          new Map(),
          envelope.payload.boards,
          tracker,
          created,
          true,
        )
        break
      }
    }
    tracker.done = tracker.total
    report(tracker, 'Done')
  } catch (err) {
    await cleanupCreated(created)
    throw err
  }
}
