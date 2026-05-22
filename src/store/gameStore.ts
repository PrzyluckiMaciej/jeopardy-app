import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { Board, BoardGroup, GameState, GameSettings, Player, Question } from '../types'

// ---- Board editor store (persisted) ----
interface BoardStore {
  boards: Board[]
  groups: BoardGroup[]
  saveBoard: (board: Board) => void
  deleteBoard: (id: string) => void
  getBoard: (id: string) => Board | undefined
  createGroup: (name: string) => void
  renameGroup: (id: string, name: string) => void
  deleteGroup: (id: string) => void
  addBoardToGroup: (groupId: string, boardId: string) => void
  removeBoardFromGroup: (groupId: string, boardId: string) => void
}

export const useBoardStore = create<BoardStore>()(
  persist(
    (set, get) => ({
      boards: [],
      groups: [],
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
          groups: s.groups.map((g) => ({
            ...g,
            boardIds: g.boardIds.filter((bid) => bid !== id),
          })),
        })),
      getBoard: (id) => get().boards.find((b) => b.id === id),
      createGroup: (name) =>
        set((s) => {
          const now = Date.now()
          return {
            groups: [
              ...s.groups,
              { id: crypto.randomUUID(), name, boardIds: [], createdAt: now, updatedAt: now },
            ],
          }
        }),
      renameGroup: (id, name) =>
        set((s) => ({
          groups: s.groups.map((g) =>
            g.id === id ? { ...g, name, updatedAt: Date.now() } : g
          ),
        })),
      deleteGroup: (id) =>
        set((s) => ({ groups: s.groups.filter((g) => g.id !== id) })),
      addBoardToGroup: (groupId, boardId) =>
        set((s) => ({
          groups: s.groups.map((g) =>
            g.id === groupId && !g.boardIds.includes(boardId)
              ? { ...g, boardIds: [...g.boardIds, boardId], updatedAt: Date.now() }
              : g
          ),
        })),
      removeBoardFromGroup: (groupId, boardId) =>
        set((s) => ({
          groups: s.groups.map((g) =>
            g.id === groupId
              ? { ...g, boardIds: g.boardIds.filter((id) => id !== boardId), updatedAt: Date.now() }
              : g
          ),
        })),
    }),
    { name: 'jeopardy-boards' }
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

      reset: () =>
        set({
          state: defaultState,
          isHost: false,
          roomCode: null,
          myPlayerId: null,
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
