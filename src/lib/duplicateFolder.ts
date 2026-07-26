import type { Board, BoardFolder } from '../types'
import { duplicateBoard } from './duplicateBoard'

/**
 * Deep-copies a folder and its nested folders/boards into the same parent.
 * Boards are duplicated (including media) into the corresponding new folders.
 */
export async function duplicateFolder(
  source: BoardFolder,
  folders: BoardFolder[],
  boards: Board[],
  createFolder: (name: string, parentId?: string | null) => string,
  saveBoard: (board: Board) => void,
): Promise<string> {
  async function copySubtree(
    folder: BoardFolder,
    parentId: string | null,
    name: string,
  ): Promise<string> {
    const newId = createFolder(name, parentId)

    const childFolders = folders.filter((f) => f.parentId === folder.id)
    for (const child of childFolders) {
      await copySubtree(child, newId, child.name)
    }

    const childBoards = boards.filter((b) => b.folderId === folder.id)
    for (const board of childBoards) {
      const copy = await duplicateBoard(board)
      saveBoard({ ...copy, folderId: newId })
    }

    return newId
  }

  return copySubtree(source, source.parentId, `${source.name} (Copy)`)
}
