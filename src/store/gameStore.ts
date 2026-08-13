import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type {
  Board,
  BoardFolder,
  Game,
  GameFolder,
  GameState,
  GameSettings,
  MediaPlaybackState,
  Player,
  Question,
} from '../types'
import {
  emptyFinalJeopardyState,
  FINAL_JEOPARDY_TIMER_MS,
  initialMediaPlaybackForType,
  questionMediaAutoplay,
} from '../types'

type FolderLike = { id: string; name: string; parentId: string | null; trashedAt?: number | null }

// ---- Board editor store (persisted) ----
interface BoardStore {
  boards: Board[]
  games: Game[]
  folders: BoardFolder[]
  gameFolders: GameFolder[]
  saveBoard: (board: Board) => void
  /** Soft-delete: move board to trash and unlink from games. */
  trashBoard: (id: string) => void
  /** Soft-delete: move folder + subtree to trash; unlink affected boards from games. */
  trashFolder: (id: string) => void
  restoreBoard: (id: string) => void
  restoreFolder: (id: string) => void
  /** Permanently remove a board. */
  deleteBoard: (id: string) => void
  getBoard: (id: string) => Board | undefined
  createGame: (name: string, folderId?: string | null) => string
  renameGame: (id: string, name: string) => void
  /** Soft-delete: move game to trash. */
  trashGame: (id: string) => void
  restoreGame: (id: string) => void
  /** Permanently remove a game. */
  deleteGame: (id: string) => void
  addBoardToGame: (gameId: string, boardId: string) => void
  removeBoardFromGame: (gameId: string, boardId: string) => void
  reorderBoardInGame: (gameId: string, fromIndex: number, toIndex: number) => void
  moveGameToFolder: (gameId: string, folderId: string | null) => void
  createFolder: (name: string, parentId?: string | null) => string
  /** Returns false if the name conflicts with a sibling folder. */
  renameFolder: (id: string, name: string) => boolean
  /** Permanently remove a folder and its subtree. */
  deleteFolder: (id: string) => void
  createGameFolder: (name: string, parentId?: string | null) => string
  renameGameFolder: (id: string, name: string) => boolean
  trashGameFolder: (id: string) => void
  restoreGameFolder: (id: string) => void
  deleteGameFolder: (id: string) => void
  moveGameFolder: (folderId: string, newParentId: string | null) => void
  /** Permanently remove all trashed boards, folders, games, and game folders. */
  emptyTrash: () => void
  moveBoardToFolder: (boardId: string, folderId: string | null) => void
  moveFolder: (folderId: string, newParentId: string | null) => void
}

export function isBoardTrashed(board: { trashedAt?: number | null }): boolean {
  return board.trashedAt != null
}

export function isFolderTrashed(folder: FolderLike): boolean {
  return folder.trashedAt != null
}

export function isGameTrashed(game: { trashedAt?: number | null }): boolean {
  return game.trashedAt != null
}

export function isGameFolderTrashed(folder: FolderLike): boolean {
  return folder.trashedAt != null
}

/** True when the restore target exists and is not trashed. */
function canRestoreToFolder(
  folders: FolderLike[],
  folderId: string | null | undefined,
  isTrashed: (f: FolderLike) => boolean,
): boolean {
  if (folderId == null) return true
  const folder = folders.find((f) => f.id === folderId)
  return folder != null && !isTrashed(folder)
}

type PersistedBoardStore = Pick<BoardStore, 'boards' | 'games' | 'folders' | 'gameFolders'>
type LegacyPersistedBoardStore = PersistedBoardStore & { groups?: Game[] }

function isDescendantFolder(
  folders: { id: string; parentId: string | null }[],
  folderId: string,
  potentialAncestorId: string,
): boolean {
  let current = folders.find((f) => f.id === folderId)
  while (current?.parentId) {
    if (current.parentId === potentialAncestorId) return true
    current = folders.find((f) => f.id === current!.parentId)
  }
  return false
}

/** Case-insensitive sibling name check. Empty names count as taken. Ignores trashed folders. */
function isFolderNameTaken(
  folders: FolderLike[],
  parentId: string | null,
  name: string,
  isTrashed: (f: FolderLike) => boolean,
  excludeId?: string,
): boolean {
  const key = name.trim().toLowerCase()
  if (!key) return true
  return folders.some(
    (f) =>
      f.id !== excludeId &&
      !isTrashed(f) &&
      f.parentId === parentId &&
      f.name.trim().toLowerCase() === key,
  )
}

/** Returns `desiredName` or `desiredName (2)`, `(3)`, … until unique among siblings. */
function uniqueFolderName(
  folders: FolderLike[],
  parentId: string | null,
  desiredName: string,
  isTrashed: (f: FolderLike) => boolean,
  excludeId?: string,
): string {
  const base = desiredName.trim() || 'New Folder'
  if (!isFolderNameTaken(folders, parentId, base, isTrashed, excludeId)) return base
  let n = 2
  while (isFolderNameTaken(folders, parentId, `${base} (${n})`, isTrashed, excludeId)) {
    n += 1
  }
  return `${base} (${n})`
}

function migrateBoardDailyDoubles(
  board: Board & { dailyDoubleQuestionId?: string },
): Board {
  const { dailyDoubleQuestionId, ...rest } = board
  const withKind: Board = {
    ...rest,
    kind: rest.kind === 'final' ? 'final' : 'board',
  }
  if (Array.isArray(withKind.dailyDoubleQuestionIds)) {
    return withKind
  }
  if (typeof dailyDoubleQuestionId === 'string' && dailyDoubleQuestionId) {
    return { ...withKind, dailyDoubleQuestionIds: [dailyDoubleQuestionId] }
  }
  return withKind
}

function migrateBoardStore(persisted: unknown): PersistedBoardStore {
  if (!persisted || typeof persisted !== 'object') {
    return { boards: [], games: [], folders: [], gameFolders: [] }
  }
  const state = persisted as LegacyPersistedBoardStore
  let games = state.games ?? []
  if (state.groups && !state.games) {
    games = state.groups
  }
  games = games.map((g) => ({
    ...g,
    folderId: g.folderId ?? null,
  }))
  return {
    boards: (state.boards ?? []).map((b) =>
      migrateBoardDailyDoubles(b as Board & { dailyDoubleQuestionId?: string }),
    ),
    games,
    folders: state.folders ?? [],
    gameFolders: state.gameFolders ?? [],
  }
}

export const useBoardStore = create<BoardStore>()(
  persist(
    (set, get) => ({
      boards: [],
      games: [],
      folders: [],
      gameFolders: [],
      saveBoard: (board) =>
        set((s) => {
          const idx = s.boards.findIndex((b) => b.id === board.id)
          if (idx >= 0) {
            const boards = [...s.boards]
            boards[idx] = board
            return { boards }
          }
          return { boards: [...s.boards, board] }
        }),
      trashBoard: (id) =>
        set((s) => {
          const board = s.boards.find((b) => b.id === id)
          if (!board || isBoardTrashed(board)) return s
          const now = Date.now()
          return {
            boards: s.boards.map((b) =>
              b.id === id
                ? {
                    ...b,
                    folderId: null,
                    trashedAt: now,
                    restoreFolderId: b.folderId ?? null,
                    updatedAt: now,
                  }
                : b,
            ),
            games: s.games.map((g) => ({
              ...g,
              boardIds: g.boardIds.filter((bid) => bid !== id),
            })),
          }
        }),
      trashFolder: (id) =>
        set((s) => {
          const folder = s.folders.find((f) => f.id === id)
          if (!folder || isFolderTrashed(folder)) return s
          const now = Date.now()
          const folderIdsToTrash = new Set(
            s.folders
              .filter((f) => f.id === id || isDescendantFolder(s.folders, f.id, id))
              .map((f) => f.id),
          )
          const boardIdsToTrash = new Set(
            s.boards
              .filter((b) => b.folderId != null && folderIdsToTrash.has(b.folderId))
              .map((b) => b.id),
          )
          return {
            folders: s.folders.map((f) => {
              if (!folderIdsToTrash.has(f.id) || isFolderTrashed(f)) return f
              return {
                ...f,
                // Detach the deleted root from the live tree; keep subtree links.
                parentId: f.id === id ? null : f.parentId,
                trashedAt: now,
                restoreParentId: f.parentId,
                updatedAt: now,
              }
            }),
            boards: s.boards.map((b) =>
              boardIdsToTrash.has(b.id) && !isBoardTrashed(b)
                ? {
                    ...b,
                    trashedAt: now,
                    restoreFolderId: b.folderId ?? null,
                    updatedAt: now,
                  }
                : b,
            ),
            games: s.games.map((g) => ({
              ...g,
              boardIds: g.boardIds.filter((bid) => !boardIdsToTrash.has(bid)),
            })),
          }
        }),
      restoreBoard: (id) =>
        set((s) => {
          const board = s.boards.find((b) => b.id === id)
          if (!board || !isBoardTrashed(board)) return s
          const now = Date.now()
          const target = canRestoreToFolder(s.folders, board.restoreFolderId, isFolderTrashed)
            ? (board.restoreFolderId ?? null)
            : null
          return {
            boards: s.boards.map((b) =>
              b.id === id
                ? {
                    ...b,
                    folderId: target,
                    trashedAt: null,
                    restoreFolderId: null,
                    updatedAt: now,
                  }
                : b,
            ),
          }
        }),
      restoreFolder: (id) =>
        set((s) => {
          const folder = s.folders.find((f) => f.id === id)
          if (!folder || !isFolderTrashed(folder)) return s
          const now = Date.now()
          const subtreeIds = new Set(
            s.folders
              .filter((f) => f.id === id || isDescendantFolder(s.folders, f.id, id))
              .map((f) => f.id),
          )
          const targetParent = canRestoreToFolder(s.folders, folder.restoreParentId, isFolderTrashed)
            ? (folder.restoreParentId ?? null)
            : null
          const uniqueName = uniqueFolderName(
            s.folders,
            targetParent,
            folder.name,
            isFolderTrashed,
            id,
          )
          // Only clear trash on the restored folder + descendants that are still trashed.
          // Reattach the root folder to its restore parent; descendants keep their parentIds.
          return {
            folders: s.folders.map((f) => {
              if (!subtreeIds.has(f.id) || !isFolderTrashed(f)) return f
              if (f.id === id) {
                return {
                  ...f,
                  parentId: targetParent,
                  name: uniqueName,
                  trashedAt: null,
                  restoreParentId: null,
                  updatedAt: now,
                }
              }
              return {
                ...f,
                trashedAt: null,
                restoreParentId: null,
                updatedAt: now,
              }
            }),
            boards: s.boards.map((b) => {
              if (
                !isBoardTrashed(b) ||
                b.folderId == null ||
                !subtreeIds.has(b.folderId)
              ) {
                return b
              }
              return {
                ...b,
                trashedAt: null,
                restoreFolderId: null,
                updatedAt: now,
              }
            }),
          }
        }),
      deleteBoard: (id) =>
        set((s) => ({
          boards: s.boards.filter((b) => b.id !== id),
          games: s.games.map((g) => ({
            ...g,
            boardIds: g.boardIds.filter((bid) => bid !== id),
          })),
        })),
      getBoard: (id) => get().boards.find((b) => b.id === id),
      createGame: (name, folderId = null) => {
        const id = crypto.randomUUID()
        const now = Date.now()
        set((s) => ({
          games: [
            ...s.games,
            {
              id,
              name,
              boardIds: [],
              folderId: folderId ?? null,
              createdAt: now,
              updatedAt: now,
            },
          ],
        }))
        return id
      },
      renameGame: (id, name) =>
        set((s) => ({
          games: s.games.map((g) =>
            g.id === id ? { ...g, name, updatedAt: Date.now() } : g,
          ),
        })),
      trashGame: (id) =>
        set((s) => {
          const game = s.games.find((g) => g.id === id)
          if (!game || isGameTrashed(game)) return s
          const now = Date.now()
          return {
            games: s.games.map((g) =>
              g.id === id
                ? {
                    ...g,
                    folderId: null,
                    trashedAt: now,
                    restoreFolderId: g.folderId ?? null,
                    updatedAt: now,
                  }
                : g,
            ),
          }
        }),
      restoreGame: (id) =>
        set((s) => {
          const game = s.games.find((g) => g.id === id)
          if (!game || !isGameTrashed(game)) return s
          const now = Date.now()
          const target = canRestoreToFolder(
            s.gameFolders,
            game.restoreFolderId,
            isGameFolderTrashed,
          )
            ? (game.restoreFolderId ?? null)
            : null
          return {
            games: s.games.map((g) =>
              g.id === id
                ? {
                    ...g,
                    folderId: target,
                    trashedAt: null,
                    restoreFolderId: null,
                    updatedAt: now,
                  }
                : g,
            ),
          }
        }),
      deleteGame: (id) =>
        set((s) => ({ games: s.games.filter((g) => g.id !== id) })),
      addBoardToGame: (gameId, boardId) =>
        set((s) => ({
          games: s.games.map((g) =>
            g.id === gameId && !g.boardIds.includes(boardId)
              ? { ...g, boardIds: [...g.boardIds, boardId], updatedAt: Date.now() }
              : g,
          ),
        })),
      removeBoardFromGame: (gameId, boardId) =>
        set((s) => ({
          games: s.games.map((g) =>
            g.id === gameId
              ? {
                  ...g,
                  boardIds: g.boardIds.filter((id) => id !== boardId),
                  updatedAt: Date.now(),
                }
              : g,
          ),
        })),
      reorderBoardInGame: (gameId, fromIndex, toIndex) =>
        set((s) => ({
          games: s.games.map((g) => {
            if (g.id !== gameId) return g
            const ids = [...g.boardIds]
            const [moved] = ids.splice(fromIndex, 1)
            ids.splice(toIndex, 0, moved)
            return { ...g, boardIds: ids, updatedAt: Date.now() }
          }),
        })),
      moveGameToFolder: (gameId, folderId) =>
        set((s) => ({
          games: s.games.map((g) =>
            g.id === gameId ? { ...g, folderId, updatedAt: Date.now() } : g,
          ),
        })),
      createFolder: (name, parentId = null) => {
        const id = crypto.randomUUID()
        const now = Date.now()
        const parent = parentId ?? null
        set((s) => {
          const uniqueName = uniqueFolderName(s.folders, parent, name, isFolderTrashed)
          return {
            folders: [
              ...s.folders,
              { id, name: uniqueName, parentId: parent, createdAt: now, updatedAt: now },
            ],
          }
        })
        return id
      },
      renameFolder: (id, name) => {
        let renamed = false
        set((s) => {
          const folder = s.folders.find((f) => f.id === id)
          if (!folder) return s
          const trimmed = name.trim()
          if (!trimmed) return s
          if (isFolderNameTaken(s.folders, folder.parentId, trimmed, isFolderTrashed, id)) {
            return s
          }
          renamed = true
          return {
            folders: s.folders.map((f) =>
              f.id === id ? { ...f, name: trimmed, updatedAt: Date.now() } : f,
            ),
          }
        })
        return renamed
      },
      deleteFolder: (id) =>
        set((s) => {
          if (!s.folders.some((f) => f.id === id)) return s
          const folderIdsToDelete = new Set(
            s.folders
              .filter((f) => f.id === id || isDescendantFolder(s.folders, f.id, id))
              .map((f) => f.id),
          )
          const boardIdsToDelete = new Set(
            s.boards
              .filter((b) => b.folderId != null && folderIdsToDelete.has(b.folderId))
              .map((b) => b.id),
          )
          return {
            folders: s.folders.filter((f) => !folderIdsToDelete.has(f.id)),
            boards: s.boards.filter((b) => !boardIdsToDelete.has(b.id)),
            games: s.games.map((g) => ({
              ...g,
              boardIds: g.boardIds.filter((bid) => !boardIdsToDelete.has(bid)),
            })),
          }
        }),
      createGameFolder: (name, parentId = null) => {
        const id = crypto.randomUUID()
        const now = Date.now()
        const parent = parentId ?? null
        set((s) => {
          const uniqueName = uniqueFolderName(s.gameFolders, parent, name, isGameFolderTrashed)
          return {
            gameFolders: [
              ...s.gameFolders,
              { id, name: uniqueName, parentId: parent, createdAt: now, updatedAt: now },
            ],
          }
        })
        return id
      },
      renameGameFolder: (id, name) => {
        let renamed = false
        set((s) => {
          const folder = s.gameFolders.find((f) => f.id === id)
          if (!folder) return s
          const trimmed = name.trim()
          if (!trimmed) return s
          if (
            isFolderNameTaken(s.gameFolders, folder.parentId, trimmed, isGameFolderTrashed, id)
          ) {
            return s
          }
          renamed = true
          return {
            gameFolders: s.gameFolders.map((f) =>
              f.id === id ? { ...f, name: trimmed, updatedAt: Date.now() } : f,
            ),
          }
        })
        return renamed
      },
      trashGameFolder: (id) =>
        set((s) => {
          const folder = s.gameFolders.find((f) => f.id === id)
          if (!folder || isGameFolderTrashed(folder)) return s
          const now = Date.now()
          const folderIdsToTrash = new Set(
            s.gameFolders
              .filter((f) => f.id === id || isDescendantFolder(s.gameFolders, f.id, id))
              .map((f) => f.id),
          )
          const gameIdsToTrash = new Set(
            s.games
              .filter((g) => g.folderId != null && folderIdsToTrash.has(g.folderId))
              .map((g) => g.id),
          )
          return {
            gameFolders: s.gameFolders.map((f) => {
              if (!folderIdsToTrash.has(f.id) || isGameFolderTrashed(f)) return f
              return {
                ...f,
                parentId: f.id === id ? null : f.parentId,
                trashedAt: now,
                restoreParentId: f.parentId,
                updatedAt: now,
              }
            }),
            games: s.games.map((g) =>
              gameIdsToTrash.has(g.id) && !isGameTrashed(g)
                ? {
                    ...g,
                    trashedAt: now,
                    restoreFolderId: g.folderId ?? null,
                    updatedAt: now,
                  }
                : g,
            ),
          }
        }),
      restoreGameFolder: (id) =>
        set((s) => {
          const folder = s.gameFolders.find((f) => f.id === id)
          if (!folder || !isGameFolderTrashed(folder)) return s
          const now = Date.now()
          const subtreeIds = new Set(
            s.gameFolders
              .filter((f) => f.id === id || isDescendantFolder(s.gameFolders, f.id, id))
              .map((f) => f.id),
          )
          const targetParent = canRestoreToFolder(
            s.gameFolders,
            folder.restoreParentId,
            isGameFolderTrashed,
          )
            ? (folder.restoreParentId ?? null)
            : null
          const uniqueName = uniqueFolderName(
            s.gameFolders,
            targetParent,
            folder.name,
            isGameFolderTrashed,
            id,
          )
          return {
            gameFolders: s.gameFolders.map((f) => {
              if (!subtreeIds.has(f.id) || !isGameFolderTrashed(f)) return f
              if (f.id === id) {
                return {
                  ...f,
                  parentId: targetParent,
                  name: uniqueName,
                  trashedAt: null,
                  restoreParentId: null,
                  updatedAt: now,
                }
              }
              return {
                ...f,
                trashedAt: null,
                restoreParentId: null,
                updatedAt: now,
              }
            }),
            games: s.games.map((g) => {
              if (
                !isGameTrashed(g) ||
                g.folderId == null ||
                !subtreeIds.has(g.folderId)
              ) {
                return g
              }
              return {
                ...g,
                trashedAt: null,
                restoreFolderId: null,
                updatedAt: now,
              }
            }),
          }
        }),
      deleteGameFolder: (id) =>
        set((s) => {
          if (!s.gameFolders.some((f) => f.id === id)) return s
          const folderIdsToDelete = new Set(
            s.gameFolders
              .filter((f) => f.id === id || isDescendantFolder(s.gameFolders, f.id, id))
              .map((f) => f.id),
          )
          const gameIdsToDelete = new Set(
            s.games
              .filter((g) => g.folderId != null && folderIdsToDelete.has(g.folderId))
              .map((g) => g.id),
          )
          return {
            gameFolders: s.gameFolders.filter((f) => !folderIdsToDelete.has(f.id)),
            games: s.games.filter((g) => !gameIdsToDelete.has(g.id)),
          }
        }),
      moveGameFolder: (folderId, newParentId) =>
        set((s) => {
          if (folderId === newParentId) return s
          if (
            newParentId !== null &&
            (newParentId === folderId ||
              isDescendantFolder(s.gameFolders, newParentId, folderId))
          ) {
            return s
          }
          const folder = s.gameFolders.find((f) => f.id === folderId)
          if (!folder) return s
          if (folder.parentId === newParentId) return s
          const uniqueName = uniqueFolderName(
            s.gameFolders,
            newParentId,
            folder.name,
            isGameFolderTrashed,
            folderId,
          )
          return {
            gameFolders: s.gameFolders.map((f) =>
              f.id === folderId
                ? { ...f, parentId: newParentId, name: uniqueName, updatedAt: Date.now() }
                : f,
            ),
          }
        }),
      emptyTrash: () =>
        set((s) => {
          const trashedFolderIds = new Set(
            s.folders.filter((f) => isFolderTrashed(f)).map((f) => f.id),
          )
          const trashedBoardIds = new Set(
            s.boards.filter((b) => isBoardTrashed(b)).map((b) => b.id),
          )
          const trashedGameFolderIds = new Set(
            s.gameFolders.filter((f) => isGameFolderTrashed(f)).map((f) => f.id),
          )
          const trashedGameIds = new Set(
            s.games.filter((g) => isGameTrashed(g)).map((g) => g.id),
          )
          // Also remove boards whose folder was trashed but board flag was missing
          for (const b of s.boards) {
            if (b.folderId != null && trashedFolderIds.has(b.folderId)) {
              trashedBoardIds.add(b.id)
            }
          }
          // Cascade: any folder under a trashed folder
          for (const f of s.folders) {
            if (
              !trashedFolderIds.has(f.id) &&
              [...trashedFolderIds].some((tid) => isDescendantFolder(s.folders, f.id, tid))
            ) {
              trashedFolderIds.add(f.id)
            }
          }
          for (const b of s.boards) {
            if (b.folderId != null && trashedFolderIds.has(b.folderId)) {
              trashedBoardIds.add(b.id)
            }
          }
          for (const f of s.gameFolders) {
            if (
              !trashedGameFolderIds.has(f.id) &&
              [...trashedGameFolderIds].some((tid) =>
                isDescendantFolder(s.gameFolders, f.id, tid),
              )
            ) {
              trashedGameFolderIds.add(f.id)
            }
          }
          for (const g of s.games) {
            if (g.folderId != null && trashedGameFolderIds.has(g.folderId)) {
              trashedGameIds.add(g.id)
            }
          }
          if (
            trashedFolderIds.size === 0 &&
            trashedBoardIds.size === 0 &&
            trashedGameFolderIds.size === 0 &&
            trashedGameIds.size === 0
          ) {
            return s
          }
          return {
            folders: s.folders.filter((f) => !trashedFolderIds.has(f.id)),
            boards: s.boards.filter((b) => !trashedBoardIds.has(b.id)),
            gameFolders: s.gameFolders.filter((f) => !trashedGameFolderIds.has(f.id)),
            games: s.games
              .filter((g) => !trashedGameIds.has(g.id))
              .map((g) => ({
                ...g,
                boardIds: g.boardIds.filter((bid) => !trashedBoardIds.has(bid)),
              })),
          }
        }),
      moveBoardToFolder: (boardId, folderId) =>
        set((s) => ({
          boards: s.boards.map((b) =>
            b.id === boardId ? { ...b, folderId, updatedAt: Date.now() } : b,
          ),
        })),
      moveFolder: (folderId, newParentId) =>
        set((s) => {
          if (folderId === newParentId) return s
          if (
            newParentId !== null &&
            (newParentId === folderId ||
              isDescendantFolder(s.folders, newParentId, folderId))
          ) {
            return s
          }
          const folder = s.folders.find((f) => f.id === folderId)
          if (!folder) return s
          if (folder.parentId === newParentId) return s
          const uniqueName = uniqueFolderName(
            s.folders,
            newParentId,
            folder.name,
            isFolderTrashed,
            folderId,
          )
          return {
            folders: s.folders.map((f) =>
              f.id === folderId
                ? { ...f, parentId: newParentId, name: uniqueName, updatedAt: Date.now() }
                : f,
            ),
          }
        }),
    }),
    {
      name: 'jeopardy-boards',
      migrate: migrateBoardStore,
      version: 5,
    },
  ),
)

// ---- Live game store (session-persisted: roomCode, isHost, myPlayerId only) ----
interface GameStore {
  state: GameState
  settings: GameSettings
  isHost: boolean
  roomCode: string | null
  myPlayerId: string | null

  setIsHost: (v: boolean) => void
  setRoomCode: (code: string | null) => void
  setMyPlayerId: (id: string | null) => void
  setState: (state: GameState) => void
  setSettings: (settings: GameSettings) => void
  patchState: (patch: Partial<GameState>) => void

  addPlayer: (player: Player) => void
  removePlayer: (id: string) => void
  updatePlayer: (player: Player) => void
  setPlayerConnected: (id: string, connected: boolean) => void
  setBoardControl: (id: string | null) => void
  openCard: (categoryId: string, question: Question, mediaDataUrl?: string, reveal?: { clue?: boolean; media?: boolean }) => void
  closeCard: () => void
  setMediaPlayback: (playback: MediaPlaybackState | null) => void
  startBuzzing: () => void
  addBuzz: (playerId: string) => void
  clearBuzzQueue: () => void
  judgeAnswer: (playerId: string, correct: boolean, pointDelta: number) => void
  revealAnswer: () => void
  revealClue: () => void
  revealMedia: () => void
  markAnswered: (cellId: string) => void
  startDailyDouble: (playerId: string) => void
  setDailyDoubleBet: (wager: number) => void
  revealDailyDoubleClue: (autoRevealMedia?: boolean) => void
  resetBoard: () => void
  reset: () => void
  leaveRoom: () => void

  selectGame: (gameId: string, boardIds: string[]) => void
  setBoardTransition: (boardName: string | null) => void
  showPodium: () => void

  startFinalJeopardy: (categoryId: string, question: Question, mediaDataUrl?: string) => void
  revealFinalCategory: () => void
  setFinalWager: (playerId: string, wager: number) => void
  revealFinalClue: (timerEndsAt?: number) => void
  revealFinalMedia: (timerEndsAt?: number) => void
  submitFinalAnswer: (playerId: string, text: string) => void
  markFinalAnswerSubmitted: (playerId: string) => void
  revealFinalPlayer: (playerId: string) => void
  applyFinalPlayerReveal: (playerId: string, wager: number, answer: string) => void
  judgeFinalAnswer: (playerId: string, correct: boolean, pointDelta: number) => void
}

const defaultState: GameState = {
  phase: 'lobby',
  board: null,
  players: [],
  answeredCells: [],
  activeQuestion: null,
  buzzQueue: [],
  activeMedia: null,
  mediaPlayback: null,
  boardControlId: null,
  dailyDouble: null,
  finalJeopardy: null,
  activeGameId: null,
  gameBoardIds: [],
  currentBoardIndex: 0,
  boardTransition: null,
  clueRevealed: false,
  mediaRevealed: false,
}

const defaultSettings: GameSettings = {
  pointDeduction: false,
  allowNegativeScore: false,
  dailyDoubleMinWager: 5,
  autoBuzzQueue: false,
  autoBuzzQueueOnMedia: false,
  blurClueOnBuzz: false,
  pauseMediaOnBuzz: false,
  autoRevealClue: false,
  autoRevealMedia: false,
}

export const useGameStore = create<GameStore>()(
  persist(
    (set) => ({
      state: defaultState,
      settings: defaultSettings,
      isHost: false,
      roomCode: null,
      myPlayerId: null,

      setIsHost: (v) => set({ isHost: v }),
      setRoomCode: (code) => set({ roomCode: code }),
      setMyPlayerId: (id) => set({ myPlayerId: id }),
      setState: (state) => set({ state }),
      setSettings: (settings) => set({ settings }),
      patchState: (patch) => set((s) => ({ state: { ...s.state, ...patch } })),

      addPlayer: (player) =>
        set((s) => ({
          state: {
            ...s.state,
            players: s.state.players.some((p) => p.id === player.id)
              ? s.state.players
              : [...s.state.players, player],
          },
        })),

      removePlayer: (id) =>
        set((s) => ({
          state: {
            ...s.state,
            players: s.state.players.filter((p) => p.id !== id),
            buzzQueue: s.state.buzzQueue.filter((pid) => pid !== id),
            boardControlId:
              s.state.boardControlId === id ? null : s.state.boardControlId,
          },
        })),

      updatePlayer: (player) =>
        set((s) => ({
          state: {
            ...s.state,
            players: s.state.players.map((p) => (p.id === player.id ? player : p)),
          },
        })),

      setPlayerConnected: (id, connected) =>
        set((s) => ({
          state: {
            ...s.state,
            players: s.state.players.map((p) =>
              p.id === id ? { ...p, isConnected: connected } : p
            ),
          },
        })),

      setBoardControl: (id) =>
        set((s) => ({ state: { ...s.state, boardControlId: id } })),

      openCard: (categoryId, question, mediaDataUrl, reveal) =>
        set((s) => {
          let mediaType: 'image' | 'audio' | 'video' | undefined
          if (mediaDataUrl) {
            if (mediaDataUrl.startsWith('data:image')) mediaType = 'image'
            else if (mediaDataUrl.startsWith('data:audio')) mediaType = 'audio'
            else if (mediaDataUrl.startsWith('data:video')) mediaType = 'video'
          }
          const clueRevealed = reveal?.clue ?? false
          const mediaRevealed = reveal?.media ?? false
          return {
            state: {
              ...s.state,
              phase: 'question',
              activeQuestion: { categoryId, question },
              buzzQueue: [],
              activeMedia: mediaDataUrl && mediaType
                ? { type: mediaType, dataUrl: mediaDataUrl }
                : null,
              clueRevealed,
              mediaRevealed,
              mediaPlayback: mediaRevealed
                ? initialMediaPlaybackForType(mediaType, questionMediaAutoplay(question))
                : null,
            },
          }
        }),

      closeCard: () =>
        set((s) => ({
          state: {
            ...s.state,
            phase: 'board',
            activeQuestion: null,
            buzzQueue: [],
            activeMedia: null,
            mediaPlayback: null,
            dailyDouble: null,
            finalJeopardy: null,
            clueRevealed: false,
            mediaRevealed: false,
          },
        })),

      setMediaPlayback: (playback) =>
        set((s) => ({ state: { ...s.state, mediaPlayback: playback } })),

      startBuzzing: () =>
        set((s) => ({ state: { ...s.state, phase: 'buzzing', buzzQueue: [] } })),

      addBuzz: (playerId) =>
        set((s) => {
          if (s.state.buzzQueue.includes(playerId)) return s
          return {
            state: {
              ...s.state,
              buzzQueue: [...s.state.buzzQueue, playerId],
            },
          }
        }),

      clearBuzzQueue: () =>
        set((s) => ({ state: { ...s.state, buzzQueue: [], phase: 'buzzing' } })),

      judgeAnswer: (playerId, correct, pointDelta) =>
        set((s) => ({
          state: {
            ...s.state,
            // Keep answer visible if it was already revealed (e.g. incorrect after reveal)
            phase: correct || s.state.phase === 'revealed' ? 'revealed' : 'buzzing',
            players: s.state.players.map((p) =>
              p.id === playerId ? { ...p, score: p.score + pointDelta } : p
            ),
            buzzQueue: correct
              ? s.state.buzzQueue
              : s.state.buzzQueue.filter((id) => id !== playerId),
            ...(correct && { boardControlId: playerId }),
          },
        })),

      revealAnswer: () =>
        set((s) => ({ state: { ...s.state, phase: 'revealed' } })),

      revealClue: () =>
        set((s) => ({ state: { ...s.state, clueRevealed: true } })),

      revealMedia: () =>
        set((s) => ({
          state: {
            ...s.state,
            mediaRevealed: true,
            mediaPlayback: initialMediaPlaybackForType(
              s.state.activeMedia?.type,
              questionMediaAutoplay(s.state.activeQuestion?.question),
            ),
          },
        })),

      markAnswered: (cellId) =>
        set((s) => ({
          state: {
            ...s.state,
            answeredCells: [...s.state.answeredCells, cellId],
            phase: 'board',
            activeQuestion: null,
            buzzQueue: [],
            activeMedia: null,
            mediaPlayback: null,
            dailyDouble: null,
            finalJeopardy: null,
            clueRevealed: false,
            mediaRevealed: false,
          },
        })),

      startDailyDouble: (playerId) =>
        set((s) => ({
          state: {
            ...s.state,
            phase: 'dailyDouble',
            dailyDouble: { playerId, wager: null },
          },
        })),

      setDailyDoubleBet: (wager) =>
        set((s) => ({
          state: {
            ...s.state,
            phase: 'dailyDoubleBet',
            dailyDouble: s.state.dailyDouble
              ? { ...s.state.dailyDouble, wager }
              : null,
          },
        })),

      revealDailyDoubleClue: (autoRevealMedia = false) =>
        set((s) => {
          const mediaRevealed = s.state.mediaRevealed || autoRevealMedia
          return {
            state: {
              ...s.state,
              phase: 'question',
              clueRevealed: true,
              mediaRevealed,
              mediaPlayback: mediaRevealed && !s.state.mediaRevealed
                ? initialMediaPlaybackForType(
                    s.state.activeMedia?.type,
                    questionMediaAutoplay(s.state.activeQuestion?.question),
                  )
                : s.state.mediaPlayback,
            },
          }
        }),

      resetBoard: () =>
        set((s) => ({
          state: {
            ...s.state,
            answeredCells: [],
            players: s.state.players.map((p) => ({ ...p, score: 0 })),
            phase: 'board',
            activeQuestion: null,
            buzzQueue: [],
            activeMedia: null,
            mediaPlayback: null,
            boardControlId: null,
            dailyDouble: null,
            finalJeopardy: null,
            clueRevealed: false,
            mediaRevealed: false,
          },
        })),

      selectGame: (gameId, boardIds) =>
        set((s) => ({
          state: {
            ...s.state,
            phase: 'gameStart',
            activeGameId: gameId,
            gameBoardIds: boardIds,
            currentBoardIndex: 0,
            board: null,
            answeredCells: [],
            activeQuestion: null,
            buzzQueue: [],
            activeMedia: null,
            mediaPlayback: null,
            boardControlId: null,
            dailyDouble: null,
            finalJeopardy: null,
            boardTransition: null,
            clueRevealed: false,
            mediaRevealed: false,
            players: s.state.players.map((p) => ({ ...p, score: 0 })),
          },
        })),

      setBoardTransition: (boardName) =>
        set((s) => ({
          state: { ...s.state, boardTransition: boardName },
        })),

      showPodium: () =>
        set((s) => ({
          state: {
            ...s.state,
            phase: 'podium',
            board: null,
            activeQuestion: null,
            buzzQueue: [],
            activeMedia: null,
            mediaPlayback: null,
            dailyDouble: null,
            finalJeopardy: null,
            boardTransition: null,
            clueRevealed: false,
            mediaRevealed: false,
          },
        })),

      startFinalJeopardy: (categoryId, question, mediaDataUrl) =>
        set((s) => {
          let mediaType: 'image' | 'audio' | 'video' | undefined
          if (mediaDataUrl) {
            if (mediaDataUrl.startsWith('data:image')) mediaType = 'image'
            else if (mediaDataUrl.startsWith('data:audio')) mediaType = 'audio'
            else if (mediaDataUrl.startsWith('data:video')) mediaType = 'video'
          }
          return {
            state: {
              ...s.state,
              phase: 'finalJeopardy',
              activeQuestion: { categoryId, question },
              buzzQueue: [],
              dailyDouble: null,
              finalJeopardy: emptyFinalJeopardyState(),
              activeMedia: mediaDataUrl && mediaType
                ? { type: mediaType, dataUrl: mediaDataUrl }
                : null,
              mediaPlayback: null,
              clueRevealed: false,
              mediaRevealed: false,
            },
          }
        }),

      revealFinalCategory: () =>
        set((s) => {
          if (!s.state.finalJeopardy) return s
          return {
            state: {
              ...s.state,
              finalJeopardy: {
                ...s.state.finalJeopardy,
                categoryRevealed: true,
              },
            },
          }
        }),

      setFinalWager: (playerId, wager) =>
        set((s) => {
          const fj = s.state.finalJeopardy
          if (!fj || !fj.categoryRevealed) return s
          const player = s.state.players.find((p) => p.id === playerId)
          if (!player || player.score <= 0) return s
          if (fj.wagers[playerId] != null) return s
          const clamped = Math.max(0, Math.min(Math.floor(wager), player.score))
          return {
            state: {
              ...s.state,
              finalJeopardy: {
                ...fj,
                wagers: { ...fj.wagers, [playerId]: clamped },
              },
            },
          }
        }),

      revealFinalClue: (timerEndsAt) =>
        set((s) => {
          const fj = s.state.finalJeopardy
          if (!fj) return s
          const endsAt =
            fj.timerEndsAt ??
            timerEndsAt ??
            Date.now() + FINAL_JEOPARDY_TIMER_MS
          return {
            state: {
              ...s.state,
              clueRevealed: true,
              finalJeopardy: {
                ...fj,
                clueRevealed: true,
                timerEndsAt: endsAt,
              },
            },
          }
        }),

      revealFinalMedia: (timerEndsAt) =>
        set((s) => {
          const fj = s.state.finalJeopardy
          if (!fj) return s
          const endsAt =
            fj.timerEndsAt ??
            timerEndsAt ??
            Date.now() + FINAL_JEOPARDY_TIMER_MS
          return {
            state: {
              ...s.state,
              mediaRevealed: true,
              mediaPlayback: initialMediaPlaybackForType(
                s.state.activeMedia?.type,
                questionMediaAutoplay(s.state.activeQuestion?.question),
              ),
              finalJeopardy: {
                ...fj,
                mediaRevealed: true,
                timerEndsAt: endsAt,
              },
            },
          }
        }),

      submitFinalAnswer: (playerId, text) =>
        set((s) => {
          const fj = s.state.finalJeopardy
          if (!fj || fj.wagers[playerId] == null) return s
          if (fj.submittedAnswerIds.includes(playerId)) return s
          if (fj.timerEndsAt != null && Date.now() > fj.timerEndsAt) return s
          const trimmed = text.trim()
          if (!trimmed) return s
          return {
            state: {
              ...s.state,
              finalJeopardy: {
                ...fj,
                answers: { ...fj.answers, [playerId]: trimmed },
                submittedAnswerIds: [...fj.submittedAnswerIds, playerId],
              },
            },
          }
        }),

      markFinalAnswerSubmitted: (playerId) =>
        set((s) => {
          const fj = s.state.finalJeopardy
          if (!fj) return s
          if (fj.submittedAnswerIds.includes(playerId)) return s
          return {
            state: {
              ...s.state,
              finalJeopardy: {
                ...fj,
                submittedAnswerIds: [...fj.submittedAnswerIds, playerId],
              },
            },
          }
        }),

      revealFinalPlayer: (playerId) =>
        set((s) => {
          const fj = s.state.finalJeopardy
          if (!fj || fj.wagers[playerId] == null) return s
          if (fj.revealedPlayerIds.includes(playerId)) return s
          return {
            state: {
              ...s.state,
              finalJeopardy: {
                ...fj,
                revealedPlayerIds: [...fj.revealedPlayerIds, playerId],
              },
            },
          }
        }),

      applyFinalPlayerReveal: (playerId, wager, answer) =>
        set((s) => {
          const fj = s.state.finalJeopardy
          if (!fj) return s
          return {
            state: {
              ...s.state,
              finalJeopardy: {
                ...fj,
                wagers: { ...fj.wagers, [playerId]: wager },
                answers: { ...fj.answers, [playerId]: answer },
                revealedPlayerIds: fj.revealedPlayerIds.includes(playerId)
                  ? fj.revealedPlayerIds
                  : [...fj.revealedPlayerIds, playerId],
              },
            },
          }
        }),

      judgeFinalAnswer: (playerId, correct, pointDelta) =>
        set((s) => {
          const fj = s.state.finalJeopardy
          if (!fj || fj.wagers[playerId] == null) return s
          if (fj.judged[playerId] != null) return s
          if (!fj.revealedPlayerIds.includes(playerId)) return s
          return {
            state: {
              ...s.state,
              players: s.state.players.map((p) =>
                p.id === playerId ? { ...p, score: p.score + pointDelta } : p
              ),
              finalJeopardy: {
                ...fj,
                judged: { ...fj.judged, [playerId]: correct },
              },
            },
          }
        }),

      reset: () =>
        set({
          state: defaultState,
          isHost: false,
          roomCode: null,
          myPlayerId: null,
        }),

      leaveRoom: () =>
        set({
          state: defaultState,
          isHost: false,
          roomCode: null,
        }),
    }),
    {
      name: 'jeopardy-session',
      storage: createJSONStorage(() => sessionStorage),
      partialize: (s) => ({
        roomCode: s.roomCode,
        isHost: s.isHost,
        myPlayerId: s.myPlayerId,
      }),
    }
  )
)
