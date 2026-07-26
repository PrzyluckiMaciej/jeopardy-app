import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { Board, BoardFolder, Game, GameState, GameSettings, MediaPlaybackState, Player, Question } from '../types'
import { initialMediaPlaybackForType, questionMediaAutoplay } from '../types'

// ---- Board editor store (persisted) ----
interface BoardStore {
  boards: Board[]
  games: Game[]
  folders: BoardFolder[]
  saveBoard: (board: Board) => void
  deleteBoard: (id: string) => void
  getBoard: (id: string) => Board | undefined
  createGame: (name: string) => void
  renameGame: (id: string, name: string) => void
  deleteGame: (id: string) => void
  addBoardToGame: (gameId: string, boardId: string) => void
  removeBoardFromGame: (gameId: string, boardId: string) => void
  reorderBoardInGame: (gameId: string, fromIndex: number, toIndex: number) => void
  createFolder: (name: string, parentId?: string | null) => string
  renameFolder: (id: string, name: string) => void
  deleteFolder: (id: string) => void
  moveBoardToFolder: (boardId: string, folderId: string | null) => void
  moveFolder: (folderId: string, newParentId: string | null) => void
}

type PersistedBoardStore = Pick<BoardStore, 'boards' | 'games' | 'folders'>
type LegacyPersistedBoardStore = PersistedBoardStore & { groups?: Game[] }

function isDescendantFolder(
  folders: BoardFolder[],
  folderId: string,
  potentialAncestorId: string
): boolean {
  let current = folders.find((f) => f.id === folderId)
  while (current?.parentId) {
    if (current.parentId === potentialAncestorId) return true
    current = folders.find((f) => f.id === current!.parentId)
  }
  return false
}

function migrateBoardStore(persisted: unknown): PersistedBoardStore {
  if (!persisted || typeof persisted !== 'object') {
    return { boards: [], games: [], folders: [] }
  }
  const state = persisted as LegacyPersistedBoardStore
  if (state.groups && !state.games) {
    const { groups, ...rest } = state
    return {
      boards: rest.boards ?? [],
      games: groups,
      folders: rest.folders ?? [],
    }
  }
  return {
    boards: state.boards ?? [],
    games: state.games ?? [],
    folders: state.folders ?? [],
  }
}

export const useBoardStore = create<BoardStore>()(
  persist(
    (set, get) => ({
      boards: [],
      games: [],
      folders: [],
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
      createFolder: (name, parentId = null) => {
        const id = crypto.randomUUID()
        const now = Date.now()
        set((s) => ({
          folders: [
            ...s.folders,
            { id, name, parentId: parentId ?? null, createdAt: now, updatedAt: now },
          ],
        }))
        return id
      },
      renameFolder: (id, name) =>
        set((s) => ({
          folders: s.folders.map((f) =>
            f.id === id ? { ...f, name, updatedAt: Date.now() } : f
          ),
        })),
      deleteFolder: (id) =>
        set((s) => {
          const folder = s.folders.find((f) => f.id === id)
          if (!folder) return s
          const parentId = folder.parentId
          return {
            folders: s.folders
              .filter((f) => f.id !== id)
              .map((f) =>
                f.parentId === id ? { ...f, parentId, updatedAt: Date.now() } : f
              ),
            boards: s.boards.map((b) =>
              b.folderId === id ? { ...b, folderId: parentId, updatedAt: Date.now() } : b
            ),
          }
        }),
      moveBoardToFolder: (boardId, folderId) =>
        set((s) => ({
          boards: s.boards.map((b) =>
            b.id === boardId
              ? { ...b, folderId, updatedAt: Date.now() }
              : b
          ),
        })),
      moveFolder: (folderId, newParentId) =>
        set((s) => {
          if (folderId === newParentId) return s
          if (
            newParentId !== null &&
            (newParentId === folderId ||
              isDescendantFolder(s.folders, newParentId, folderId))
          ) {
            return s
          }
          return {
            folders: s.folders.map((f) =>
              f.id === folderId
                ? { ...f, parentId: newParentId, updatedAt: Date.now() }
                : f
            ),
          }
        }),
    }),
    {
      name: 'jeopardy-boards',
      migrate: migrateBoardStore,
      version: 2,
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
  openCard: (categoryId: string, question: Question, mediaDataUrl?: string, reveal?: { clue?: boolean; media?: boolean }) => void
  closeCard: () => void
  setMediaPlayback: (playback: MediaPlaybackState | null) => void
  startBuzzing: () => void
  addBuzz: (playerId: string) => void
  clearBuzzQueue: () => void
  judgeAnswer: (playerId: string, correct: boolean, pointDelta: number) => void
  revealAnswer: () => void
  revealClue: () => void
  revealMedia: () => void
  markAnswered: (cellId: string) => void
  startDailyDouble: (playerId: string) => void
  setDailyDoubleBet: (wager: number) => void
  revealDailyDoubleClue: (autoRevealMedia?: boolean) => void
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
  mediaPlayback: null,
  boardControlId: null,
  dailyDouble: null,
  activeGameId: null,
  gameBoardIds: [],
  currentBoardIndex: 0,
  boardTransition: null,
  clueRevealed: false,
  mediaRevealed: false,
}

const defaultSettings: GameSettings = {
  pointDeduction: false,
  allowNegativeScore: false,
  autoBuzzQueue: false,
  autoBuzzQueueOnMedia: false,
  blurClueOnBuzz: false,
  pauseMediaOnBuzz: false,
  autoRevealClue: false,
  autoRevealMedia: false,
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

      openCard: (categoryId, question, mediaDataUrl, reveal) =>
        set((s) => {
          let mediaType: 'image' | 'audio' | 'video' | undefined
          if (mediaDataUrl) {
            if (mediaDataUrl.startsWith('data:image')) mediaType = 'image'
            else if (mediaDataUrl.startsWith('data:audio')) mediaType = 'audio'
            else if (mediaDataUrl.startsWith('data:video')) mediaType = 'video'
          }
          const clueRevealed = reveal?.clue ?? false
          const mediaRevealed = reveal?.media ?? false
          return {
            state: {
              ...s.state,
              phase: 'question',
              activeQuestion: { categoryId, question },
              buzzQueue: [],
              activeMedia: mediaDataUrl && mediaType
                ? { type: mediaType, dataUrl: mediaDataUrl }
                : null,
              clueRevealed,
              mediaRevealed,
              mediaPlayback: mediaRevealed
                ? initialMediaPlaybackForType(mediaType, questionMediaAutoplay(question))
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
            mediaPlayback: null,
            dailyDouble: null,
            clueRevealed: false,
            mediaRevealed: false,
          },
        })),

      setMediaPlayback: (playback) =>
        set((s) => ({ state: { ...s.state, mediaPlayback: playback } })),

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

      revealClue: () =>
        set((s) => ({ state: { ...s.state, clueRevealed: true } })),

      revealMedia: () =>
        set((s) => ({
          state: {
            ...s.state,
            mediaRevealed: true,
            mediaPlayback: initialMediaPlaybackForType(
              s.state.activeMedia?.type,
              questionMediaAutoplay(s.state.activeQuestion?.question),
            ),
          },
        })),

      markAnswered: (cellId) =>
        set((s) => ({
          state: {
            ...s.state,
            answeredCells: [...s.state.answeredCells, cellId],
            phase: 'board',
            activeQuestion: null,
            buzzQueue: [],
            activeMedia: null,
            mediaPlayback: null,
            dailyDouble: null,
            clueRevealed: false,
            mediaRevealed: false,
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

      revealDailyDoubleClue: (autoRevealMedia = false) =>
        set((s) => {
          const mediaRevealed = s.state.mediaRevealed || autoRevealMedia
          return {
            state: {
              ...s.state,
              phase: 'question',
              clueRevealed: true,
              mediaRevealed,
              mediaPlayback: mediaRevealed && !s.state.mediaRevealed
                ? initialMediaPlaybackForType(
                    s.state.activeMedia?.type,
                    questionMediaAutoplay(s.state.activeQuestion?.question),
                  )
                : s.state.mediaPlayback,
            },
          }
        }),

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
            mediaPlayback: null,
            boardControlId: null,
            dailyDouble: null,
            clueRevealed: false,
            mediaRevealed: false,
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
            mediaPlayback: null,
            boardControlId: null,
            dailyDouble: null,
            boardTransition: null,
            clueRevealed: false,
            mediaRevealed: false,
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
            mediaPlayback: null,
            dailyDouble: null,
            boardTransition: null,
            clueRevealed: false,
            mediaRevealed: false,
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
