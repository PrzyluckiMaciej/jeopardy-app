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
  mediaType?: 'image' | 'audio' | 'video'
  /** When false, audio/video stays paused on reveal. Default: true. */
  autoplayMedia?: boolean
}

export interface CategorySettings {
  autoBuzzQueue: boolean
  autoBuzzQueueOnMedia: boolean
  blurClueOnBuzz: boolean
  pauseMediaOnBuzz: boolean
  autoRevealClue: boolean
  autoRevealMedia: boolean
}

export interface Category {
  id: string
  name: string
  questions: Question[] // ordered by difficulty (index 0 = lowest points)
  /** When true/undefined, use live global settings. Default: synced. */
  syncSettingsWithGlobal?: boolean
  /** Snapshot used when sync is off; updated when sync is turned on. */
  settings?: CategorySettings
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

export interface MediaPlaybackState {
  paused: boolean
  currentTime: number
  playbackRate: number
}

export const INITIAL_MEDIA_PLAYBACK: MediaPlaybackState = {
  paused: false,
  currentTime: 0,
  playbackRate: 1,
}

export function questionMediaAutoplay(question?: Pick<Question, 'autoplayMedia'> | null): boolean {
  return question?.autoplayMedia !== false
}

export function initialMediaPlaybackForType(
  type?: 'image' | 'audio' | 'video',
  autoplay = true,
): MediaPlaybackState | null {
  if (type !== 'audio' && type !== 'video') return null
  return autoplay
    ? INITIAL_MEDIA_PLAYBACK
    : { paused: true, currentTime: 0, playbackRate: 1 }
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
  mediaPlayback: MediaPlaybackState | null
  boardControlId: string | null // player id of the player with board control
  dailyDouble: { playerId: string; wager: number | null } | null
  activeGameId: string | null
  gameBoardIds: string[]
  currentBoardIndex: number
  boardTransition: string | null // board name shown during transition animation
  clueRevealed: boolean
  mediaRevealed: boolean
}

// ---- Network messages ----
export type NetMessage =
  | { type: 'SYNC_STATE'; state: GameState }
  | { type: 'PLAYER_JOIN'; player: Player }
  | { type: 'PLAYER_LEAVE'; playerId: string }
  | { type: 'OPEN_CARD'; categoryId: string; question: Question; mediaDataUrl?: string; clueRevealed?: boolean; mediaRevealed?: boolean }
  | { type: 'CLOSE_CARD' }
  | { type: 'START_BUZZING' }
  | { type: 'BUZZ'; playerId: string; playerName: string }
  | { type: 'JUDGE'; playerId: string; correct: boolean; pointDelta: number; boardControlId?: string }
  | { type: 'REVEAL_ANSWER' }
  | { type: 'REVEAL_CLUE' }
  | { type: 'REVEAL_MEDIA' }
  | { type: 'MARK_ANSWERED'; cellId: string }
  | { type: 'UPDATE_PLAYER'; player: Player }
  | { type: 'REMOVE_PLAYER'; playerId: string }
  | { type: 'SET_BOARD_CONTROL'; playerId: string | null }
  | { type: 'UPDATE_SETTINGS'; settings: GameSettings }
  | { type: 'MEDIA_MANIFEST'; items: Array<{ mediaId: string; mimeType: string; size: number }> }
  | { type: 'MEDIA_ACK'; mediaId: string }
  | { type: 'MEDIA_REQUEST'; mediaId: string }
  | { type: 'MEDIA_PLAYBACK'; playback: MediaPlaybackState }
  | { type: 'JOIN_REJECTED'; reason: 'NAME_TAKEN' }
  | { type: 'DAILY_DOUBLE_REVEAL'; playerId: string; categoryId: string; question: Question; mediaDataUrl?: string }
  | { type: 'DAILY_DOUBLE_BET'; wager: number; playerId: string }
  | { type: 'DAILY_DOUBLE_ACCEPT_BET'; wager: number }
  | { type: 'DAILY_DOUBLE_REVEAL_CLUE'; mediaRevealed?: boolean }
  | { type: 'EMOJI_REACT'; playerId: string; emoji: string }

export interface GameSettings {
  pointDeduction: boolean
  allowNegativeScore: boolean
  autoBuzzQueue: boolean
  autoBuzzQueueOnMedia: boolean
  blurClueOnBuzz: boolean
  pauseMediaOnBuzz: boolean
  autoRevealClue: boolean
  autoRevealMedia: boolean
}

export interface PlayerSyncStatus {
  total: number
  synced: number
}
