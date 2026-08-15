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

export type BoardKind = 'board' | 'final'

export interface Board {
  id: string
  name: string
  /** Regular board vs Final Jeopardy; missing treated as 'board'. */
  kind?: BoardKind
  categories: Category[]
  pointValues: number[] // e.g. [200, 400, 600, 800, 1000]
  /** Question ids marked as Daily Doubles (no limit). */
  dailyDoubleQuestionIds?: string[]
  /** Folder containing this board; null/absent = All Boards root */
  folderId?: string | null
  /** Set when the board is in the trash */
  trashedAt?: number | null
  /** Folder to restore into; null = All Boards root */
  restoreFolderId?: string | null
  /** Epoch ms; absent on boards created before timestamps were tracked */
  createdAt?: number
  /** Epoch ms; absent on boards created before timestamps were tracked */
  updatedAt?: number
}

/** Live Final Jeopardy round state (host-authoritative). */
export interface FinalJeopardyState {
  /** Epoch ms when this round object was created (resets local player form state). */
  startedAt: number
  categoryRevealed: boolean
  clueRevealed: boolean
  mediaRevealed: boolean
  /** Host has revealed the correct answer text. */
  answerRevealed: boolean
  /** Epoch ms; null until first clue/media reveal starts the 30s timer. */
  timerEndsAt: number | null
  wagers: Record<string, number>
  answers: Record<string, string>
  submittedAnswerIds: string[]
  revealedPlayerIds: string[]
  /** playerId → whether the answer was judged correct */
  judged: Record<string, boolean>
}

export const FINAL_JEOPARDY_TIMER_MS = 30_000

export function emptyFinalJeopardyState(): FinalJeopardyState {
  return {
    startedAt: Date.now(),
    categoryRevealed: false,
    clueRevealed: false,
    mediaRevealed: false,
    answerRevealed: false,
    timerEndsAt: null,
    wagers: {},
    answers: {},
    submittedAnswerIds: [],
    revealedPlayerIds: [],
    judged: {},
  }
}

export interface BoardFolder {
  id: string
  name: string
  /** Parent folder; null = All Boards root */
  parentId: string | null
  /** Set when the folder is in the trash */
  trashedAt?: number | null
  /** Parent to restore under; null = All Boards root */
  restoreParentId?: string | null
  createdAt: number
  updatedAt: number
}

export interface GameFolder {
  id: string
  name: string
  /** Parent folder; null = Games root */
  parentId: string | null
  /** Set when the folder is in the trash */
  trashedAt?: number | null
  /** Parent to restore under; null = Games root */
  restoreParentId?: string | null
  createdAt: number
  updatedAt: number
}

export interface Game {
  id: string
  name: string
  boardIds: string[]
  /** Folder containing this game; null/absent = Games root */
  folderId?: string | null
  /** Set when the game is in the trash */
  trashedAt?: number | null
  /** Folder to restore into; null = Games root */
  restoreFolderId?: string | null
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
  | 'finalJeopardy'    // Final Jeopardy round (category / wager / answer / reveal)
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
  finalJeopardy: FinalJeopardyState | null
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
  | { type: 'FINAL_JEOPARDY_REVEAL_CATEGORY' }
  | { type: 'FINAL_JEOPARDY_WAGER'; playerId: string; wager: number }
  | { type: 'FINAL_JEOPARDY_WAGER_LOCKED'; playerId: string }
  | { type: 'FINAL_JEOPARDY_REVEAL_CLUE'; timerEndsAt?: number }
  | { type: 'FINAL_JEOPARDY_REVEAL_MEDIA'; timerEndsAt?: number }
  | { type: 'FINAL_JEOPARDY_SUBMIT_ANSWER'; playerId: string; text: string }
  | { type: 'FINAL_JEOPARDY_ANSWER_LOCKED'; playerId: string }
  | { type: 'FINAL_JEOPARDY_TIMER_START'; timerEndsAt: number }
  | { type: 'FINAL_JEOPARDY_TIMER_STOP'; timerEndsAt: number }
  | { type: 'FINAL_JEOPARDY_REVEAL_PLAYER'; playerId: string; wager: number; answer: string }
  | { type: 'FINAL_JEOPARDY_REVEAL_ANSWER' }
  | { type: 'FINAL_JEOPARDY_JUDGE'; playerId: string; correct: boolean; pointDelta: number }
  | { type: 'EMOJI_REACT'; playerId: string; emoji: string }

export interface GameSettings {
  pointDeduction: boolean
  allowNegativeScore: boolean
  dailyDoubleMinWager: number
  autoBuzzQueue: boolean
  autoBuzzQueueOnMedia: boolean
  blurClueOnBuzz: boolean
  pauseMediaOnBuzz: boolean
  autoRevealClue: boolean
  autoRevealMedia: boolean
  autoStartFinalTimer: boolean
}

export interface PlayerSyncStatus {
  total: number
  synced: number
}
