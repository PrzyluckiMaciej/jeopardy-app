export interface MediaAttachment {
  id: string
  type: 'image' | 'audio' | 'video'
  name: string
  mimeType: string
  // stored as blob in IndexedDB, referenced by id
}

export interface Question {
  id: string
  question: string
  answer: string
  points: number
  mediaId?: string // reference to MediaAttachment in IndexedDB
}

export interface Category {
  id: string
  name: string
  questions: Question[] // ordered by difficulty (index 0 = lowest points)
}

export interface Board {
  id: string
  name: string
  categories: Category[]
  pointValues: number[] // e.g. [200, 400, 600, 800, 1000]
  createdAt: number
  updatedAt: number
}

export interface Player {
  id: string
  name: string
  score: number
  isConnected: boolean
}

export type GamePhase =
  | 'lobby'       // waiting for players
  | 'board'       // main board visible
  | 'question'    // a card is open
  | 'buzzing'     // players can buzz
  | 'judging'     // host judging a buzz
  | 'revealed'    // answer revealed

export interface GameState {
  phase: GamePhase
  board: Board | null
  players: Player[]
  answeredCells: string[] // `${categoryId}-${questionId}`
  activeQuestion: { categoryId: string; question: Question } | null
  buzzQueue: string[] // player ids in order
  activeMedia: { type: 'image' | 'audio' | 'video'; dataUrl: string } | null
}

// ---- Network messages ----
export type NetMessage =
  | { type: 'SYNC_STATE'; state: GameState }
  | { type: 'PLAYER_JOIN'; player: Player }
  | { type: 'PLAYER_LEAVE'; playerId: string }
  | { type: 'OPEN_CARD'; categoryId: string; question: Question; mediaDataUrl?: string }
  | { type: 'CLOSE_CARD' }
  | { type: 'START_BUZZING' }
  | { type: 'BUZZ'; playerId: string; playerName: string }
  | { type: 'JUDGE'; playerId: string; correct: boolean; pointDelta: number }
  | { type: 'REVEAL_ANSWER' }
  | { type: 'MARK_ANSWERED'; cellId: string }
  | { type: 'UPDATE_PLAYER'; player: Player }
  | { type: 'REMOVE_PLAYER'; playerId: string }
  | { type: 'UPDATE_SETTINGS'; settings: GameSettings }
  | { type: 'MEDIA_CHUNK'; mediaId: string; chunk: string; index: number; total: number; mimeType: string }

export interface GameSettings {
  negativePoints: boolean
  showScoresToPlayers: boolean
}
