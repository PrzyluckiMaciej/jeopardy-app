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
  dailyDoubleQuestionId?: string
  createdAt: number
  updatedAt: number
}

export interface Game {
  id: string
  name: string
  boardIds: string[]
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
  | 'lobby'            // waiting for players
  | 'gameStart'        // game selected, waiting for host to press start
  | 'board'            // main board visible
  | 'question'         // a card is open
  | 'buzzing'          // players can buzz (host judges first in queue while others keep buzzing)
  | 'revealed'         // answer revealed
  | 'dailyDouble'      // daily double title splash
  | 'dailyDoubleBet'   // player is inputting their wager
  | 'podium'           // end-of-game podium showing top 3 players

export interface GameState {
  phase: GamePhase
  board: Board | null
  players: Player[]
  answeredCells: string[] // `${categoryId}-${questionId}`
  activeQuestion: { categoryId: string; question: Question } | null
  buzzQueue: string[] // player ids in order
  activeMedia: { type: 'image' | 'audio' | 'video'; dataUrl: string } | null
  boardControlId: string | null // player id of the player with board control
  dailyDouble: { playerId: string; wager: number | null } | null
  activeGameId: string | null
  gameBoardIds: string[]
  currentBoardIndex: number
  boardTransition: string | null // board name shown during transition animation
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
  | { type: 'JUDGE'; playerId: string; correct: boolean; pointDelta: number; boardControlId?: string }
  | { type: 'REVEAL_ANSWER' }
  | { type: 'MARK_ANSWERED'; cellId: string }
  | { type: 'UPDATE_PLAYER'; player: Player }
  | { type: 'REMOVE_PLAYER'; playerId: string }
  | { type: 'SET_BOARD_CONTROL'; playerId: string | null }
  | { type: 'UPDATE_SETTINGS'; settings: GameSettings }
  | { type: 'MEDIA_CHUNK'; mediaId: string; chunk: string; index: number; total: number; mimeType: string }
  | { type: 'JOIN_REJECTED'; reason: 'NAME_TAKEN' }
  | { type: 'DAILY_DOUBLE_REVEAL'; playerId: string; categoryId: string; question: Question; mediaDataUrl?: string }
  | { type: 'DAILY_DOUBLE_BET'; wager: number; playerId: string }
  | { type: 'DAILY_DOUBLE_ACCEPT_BET'; wager: number }
  | { type: 'DAILY_DOUBLE_REVEAL_CLUE' }
  | { type: 'EMOJI_REACT'; playerId: string; emoji: string }

export interface GameSettings {
  pointDeduction: boolean
  allowNegativeScore: boolean
  autoBuzzQueue: boolean
  blurClueOnBuzz: boolean
}
