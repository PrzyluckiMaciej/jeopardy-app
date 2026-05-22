import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { Board, Game, GameState, GameSettings, Player, Question } from '../types'

// ---- Board editor store (persisted) ----
interface BoardStore {
  boards: Board[]
  games: Game[]
  saveBoard: (board: Board) => void
  deleteBoard: (id: string) => void
  getBoard: (id: string) => Board | undefined
  createGame: (name: string) => void
  renameGame: (id: string, name: string) => void
  deleteGame: (id: string) => void
  addBoardToGame: (gameId: string, boardId: string) => void
  removeBoardFromGame: (gameId: string, boardId: string) => void
  reorderBoardInGame: (gameId: string, fromIndex: number, toIndex: number) => void
}

type PersistedBoardStore = Pick<BoardStore, 'boards' | 'games'>
type LegacyPersistedBoardStore = PersistedBoardStore & { groups?: Game[] }

function migrateBoardStore(persisted: unknown): PersistedBoardStore {
  if (!persisted || typeof persisted !== 'object') {
    return { boards: [], games: [] }
  }
  const state = persisted as LegacyPersistedBoardStore
  if (state.groups && !state.games) {
    const { groups, ...rest } = state
    return { ...rest, games: groups }
  }
  return {
    boards: state.boards ?? [],
    games: state.games ?? [],
  }
}

export const useBoardStore = create<BoardStore>()(
  persist(
    (set, get) => ({
      boards: [],
      games: [],
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
      deleteBoard: (id) =>
        set((s) => ({
          boards: s.boards.filter((b) => b.id !== id),
          games: s.games.map((g) => ({
            ...g,
            boardIds: g.boardIds.filter((bid) => bid !== id),
          })),
        })),
      getBoard: (id) => get().boards.find((b) => b.id === id),
      createGame: (name) =>
        set((s) => {
          const now = Date.now()
          return {
            games: [
              ...s.games,
              { id: crypto.randomUUID(), name, boardIds: [], createdAt: now, updatedAt: now },
            ],
          }
        }),
      renameGame: (id, name) =>
        set((s) => ({
          games: s.games.map((g) =>
            g.id === id ? { ...g, name, updatedAt: Date.now() } : g
          ),
        })),
      deleteGame: (id) =>
        set((s) => ({ games: s.games.filter((g) => g.id !== id) })),
      addBoardToGame: (gameId, boardId) =>
        set((s) => ({
          games: s.games.map((g) =>
            g.id === gameId && !g.boardIds.includes(boardId)
              ? { ...g, boardIds: [...g.boardIds, boardId], updatedAt: Date.now() }
              : g
          ),
        })),
      removeBoardFromGame: (gameId, boardId) =>
        set((s) => ({
          games: s.games.map((g) =>
            g.id === gameId
              ? { ...g, boardIds: g.boardIds.filter((id) => id !== boardId), updatedAt: Date.now() }
              : g
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
    }),
    {
      name: 'jeopardy-boards',
      migrate: migrateBoardStore,
      version: 1,
    }
  )
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
  openCard: (categoryId: string, question: Question, mediaDataUrl?: string) => void
  closeCard: () => void
  startBuzzing: () => void
  addBuzz: (playerId: string) => void
  clearBuzzQueue: () => void
  judgeAnswer: (playerId: string, correct: boolean, pointDelta: number) => void
  revealAnswer: () => void
  markAnswered: (cellId: string) => void
  startDailyDouble: (playerId: string) => void
  setDailyDoubleBet: (wager: number) => void
  revealDailyDoubleClue: () => void
  resetBoard: () => void
  reset: () => void
  leaveRoom: () => void

  selectGame: (gameId: string, boardIds: string[]) => void
  setBoardTransition: (boardName: string | null) => void
  showPodium: () => void
}

const defaultState: GameState = {
  phase: 'lobby',
  board: null,
  players: [],
  answeredCells: [],
  activeQuestion: null,
  buzzQueue: [],
  activeMedia: null,
  boardControlId: null,
  dailyDouble: null,
  activeGameId: null,
  gameBoardIds: [],
  currentBoardIndex: 0,
  boardTransition: null,
}

const defaultSettings: GameSettings = {
  pointDeduction: false,
  allowNegativeScore: false,
  autoBuzzQueue: false,
  blurClueOnBuzz: false,
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

      openCard: (categoryId, question, mediaDataUrl) =>
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
              phase: 'question',
              activeQuestion: { categoryId, question },
              buzzQueue: [],
              activeMedia: mediaDataUrl && mediaType
                ? { type: mediaType, dataUrl: mediaDataUrl }
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
            dailyDouble: null,
          },
        })),

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
            phase: correct ? 'revealed' : 'buzzing',
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

      markAnswered: (cellId) =>
        set((s) => ({
          state: {
            ...s.state,
            answeredCells: [...s.state.answeredCells, cellId],
            phase: 'board',
            activeQuestion: null,
            buzzQueue: [],
            activeMedia: null,
            dailyDouble: null,
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

      revealDailyDoubleClue: () =>
        set((s) => ({
          state: { ...s.state, phase: 'question' },
        })),

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
            boardControlId: null,
            dailyDouble: null,
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
            boardControlId: null,
            dailyDouble: null,
            boardTransition: null,
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
            dailyDouble: null,
            boardTransition: null,
          },
        })),

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
