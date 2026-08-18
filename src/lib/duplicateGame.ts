import type { Game } from '../types'

/** Shallow-copies a game (same boardIds) into the same folder. */
export function duplicateGame(
  source: Game,
  createGame: (name: string, folderId?: string | null) => string,
  addBoardToGame: (gameId: string, boardId: string) => void,
): string {
  const copyId = createGame(`${source.name} (Copy)`, source.folderId ?? null)
  for (const boardId of source.boardIds) {
    addBoardToGame(copyId, boardId)
  }
  return copyId
}
