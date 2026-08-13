import type { Board, Player } from '../types'

/** Daily Double question ids for a board; also accepts legacy single-id boards. */
export function getDailyDoubleQuestionIds(
  board: Board & { dailyDoubleQuestionId?: string },
): string[] {
  if (Array.isArray(board.dailyDoubleQuestionIds)) return board.dailyDoubleQuestionIds
  if (typeof board.dailyDoubleQuestionId === 'string' && board.dailyDoubleQuestionId) {
    return [board.dailyDoubleQuestionId]
  }
  return []
}

export function generateId(): string {
  return crypto.randomUUID()
}

export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

export function orderPlayersForDisplay(
  players: Player[],
  myPlayerId?: string,
): Player[] {
  if (!myPlayerId) return players
  const meIndex = players.findIndex((p) => p.id === myPlayerId)
  if (meIndex <= 0) return players
  return [players[meIndex], ...players.slice(0, meIndex), ...players.slice(meIndex + 1)]
}

export function formatScore(score: number): string {
  if (score < 0) return `-$${Math.abs(score).toLocaleString()}`
  return `$${score.toLocaleString()}`
}

/** Formats board created/modified timestamps for the picker; missing/invalid → '-'. */
export function formatBoardTimestamp(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return '-'
  const date = new Date(ms)
  if (Number.isNaN(date.getTime())) return '-'
  const dd = String(date.getDate()).padStart(2, '0')
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const yyyy = String(date.getFullYear())
  const hh = String(date.getHours()).padStart(2, '0')
  const min = String(date.getMinutes()).padStart(2, '0')
  return `${dd}.${mm}.${yyyy} ${hh}:${min}`
}

export function cellId(categoryId: string, questionId: string): string {
  return `${categoryId}-${questionId}`
}

export function isFinalBoard(board: Pick<Board, 'kind'> | null | undefined): boolean {
  return board?.kind === 'final'
}

export function createDefaultBoard(): Board {
  const id = generateId()
  const pointValues = [200, 400, 600, 800, 1000]
  return {
    id,
    name: 'New Board',
    kind: 'board',
    pointValues,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    categories: Array.from({ length: 6 }, (_, ci) => ({
      id: generateId(),
      name: `Category ${ci + 1}`,
      syncSettingsWithGlobal: true,
      questions: pointValues.map((points) => ({
        id: generateId(),
        question: '',
        answer: '',
        points,
      })),
    })),
  }
}

/** Final Jeopardy: one category + one question (no Daily Double / point grid). */
export function createDefaultFinalJeopardy(): Board {
  const now = Date.now()
  return {
    id: generateId(),
    name: 'Final Jeopardy',
    kind: 'final',
    pointValues: [0],
    createdAt: now,
    updatedAt: now,
    categories: [
      {
        id: generateId(),
        name: 'Category',
        syncSettingsWithGlobal: true,
        questions: [
          {
            id: generateId(),
            question: '',
            answer: '',
            points: 0,
          },
        ],
      },
    ],
  }
}
