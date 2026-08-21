import type { Board, BoardKind } from '../../types'

export const EXPORT_FORMAT = 'jeopardy-export' as const
export const EXPORT_VERSION = 1 as const

export type ExportKind = 'board' | 'final' | 'board-folder' | 'game' | 'game-folder'

/** Which explorer the user is importing into. */
export type ExplorerContext = 'boards' | 'games'

export interface TransferProgress {
  done: number
  total: number
  label?: string
}

export type OnTransferProgress = (progress: TransferProgress) => void

export interface ExportedMedia {
  id: string
  questionId: string
  mimeType: string
  dataUrl: string
}

/** Board JSON without library placement / trash fields. */
export type ExportedBoardData = Omit<
  Board,
  'folderId' | 'trashedAt' | 'restoreFolderId'
>

export interface ExportedBoardPackage {
  board: ExportedBoardData
  media: ExportedMedia[]
  /** Board folder path at export time (`/` = All Boards root). */
  folderPath?: string
}

export interface ExportedBoardFolderNode {
  name: string
  folders: ExportedBoardFolderNode[]
  boards: ExportedBoardPackage[]
}

export interface ExportedGamePackage {
  name: string
  boards: ExportedBoardPackage[]
}

export interface ExportedGameFolderGame {
  name: string
  /** References `boards[].exportId` in the same folder package. */
  boardExportIds: string[]
}

export interface ExportedGameFolderBoard extends ExportedBoardPackage {
  exportId: string
}

export interface ExportedGameFolderNode {
  name: string
  folders: ExportedGameFolderNode[]
  games: ExportedGameFolderGame[]
  /** Deduped boards shared across games in this subtree (may be empty at nested nodes). */
  boards: ExportedGameFolderBoard[]
}

export interface ExportEnvelopeBase {
  format: typeof EXPORT_FORMAT
  version: typeof EXPORT_VERSION
  exportedAt: number
}

export type ExportEnvelope =
  | (ExportEnvelopeBase & { kind: 'board' | 'final'; payload: ExportedBoardPackage })
  | (ExportEnvelopeBase & { kind: 'board-folder'; payload: ExportedBoardFolderNode })
  | (ExportEnvelopeBase & { kind: 'game'; payload: ExportedGamePackage })
  | (ExportEnvelopeBase & { kind: 'game-folder'; payload: ExportedGameFolderNode })

export function boardKindFromExportKind(kind: 'board' | 'final'): BoardKind {
  return kind
}

export function exportKindForBoard(board: Pick<Board, 'kind'>): 'board' | 'final' {
  return board.kind === 'final' ? 'final' : 'board'
}

export class TransferValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TransferValidationError'
  }
}

export class TransferAbortError extends Error {
  constructor(message = 'Transfer cancelled') {
    super(message)
    this.name = 'TransferAbortError'
  }
}

export function checkTransferAbort(signal?: AbortSignal): void {
  if (signal?.aborted) throw new TransferAbortError()
}
