import type { Game, GameFolder } from '../types'

/**
 * Deep-copies a game folder and its nested folders/games into the same parent.
 * Games are shallow-copied (same boardIds references).
 */
export function duplicateGameFolder(
  source: GameFolder,
  folders: GameFolder[],
  games: Game[],
  createGameFolder: (name: string, parentId?: string | null) => string,
  createGame: (name: string, folderId?: string | null) => string,
  addBoardToGame: (gameId: string, boardId: string) => void,
): string {
  function copySubtree(folder: GameFolder, parentId: string | null, name: string): string {
    const newId = createGameFolder(name, parentId)

    const childFolders = folders.filter((f) => f.parentId === folder.id)
    for (const child of childFolders) {
      copySubtree(child, newId, child.name)
    }

    const childGames = games.filter((g) => g.folderId === folder.id)
    for (const game of childGames) {
      const copyId = createGame(`${game.name} (Copy)`, newId)
      for (const boardId of game.boardIds) {
        addBoardToGame(copyId, boardId)
      }
    }

    return newId
  }

  return copySubtree(source, source.parentId, `${source.name} (Copy)`)
}
