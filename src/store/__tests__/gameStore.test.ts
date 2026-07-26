import { useBoardStore, useGameStore } from '../gameStore'
import type { Board, Player, Question } from '../../types'

function makeBoard(overrides: Partial<Board> = {}): Board {
  return {
    id: 'board-1',
    name: 'Test Board',
    categories: [],
    pointValues: [200, 400, 600, 800, 1000],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  }
}

function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: 'player-1',
    name: 'Alice',
    score: 0,
    isConnected: true,
    ...overrides,
  }
}

function makeQuestion(overrides: Partial<Question> = {}): Question {
  return {
    id: 'q-1',
    question: 'What is 2+2?',
    answer: '4',
    points: 200,
    ...overrides,
  }
}

// ---- BoardStore ----

describe('useBoardStore', () => {
  beforeEach(() => {
    useBoardStore.setState({ boards: [], games: [], folders: [] })
  })

  describe('saveBoard', () => {
    it('adds a new board', () => {
      const board = makeBoard()
      useBoardStore.getState().saveBoard(board)
      expect(useBoardStore.getState().boards).toHaveLength(1)
      expect(useBoardStore.getState().boards[0]).toEqual(board)
    })

    it('updates an existing board by id', () => {
      const board = makeBoard()
      useBoardStore.getState().saveBoard(board)

      const updated = { ...board, name: 'Updated Board' }
      useBoardStore.getState().saveBoard(updated)

      expect(useBoardStore.getState().boards).toHaveLength(1)
      expect(useBoardStore.getState().boards[0].name).toBe('Updated Board')
    })
  })

  describe('deleteBoard', () => {
    it('removes a board by id', () => {
      const board = makeBoard()
      useBoardStore.getState().saveBoard(board)
      useBoardStore.getState().deleteBoard('board-1')
      expect(useBoardStore.getState().boards).toHaveLength(0)
    })

    it('does nothing for a non-existent id', () => {
      const board = makeBoard()
      useBoardStore.getState().saveBoard(board)
      useBoardStore.getState().deleteBoard('non-existent')
      expect(useBoardStore.getState().boards).toHaveLength(1)
    })
  })

  describe('getBoard', () => {
    it('returns the board when found', () => {
      const board = makeBoard()
      useBoardStore.getState().saveBoard(board)
      expect(useBoardStore.getState().getBoard('board-1')).toEqual(board)
    })

    it('returns undefined when not found', () => {
      expect(useBoardStore.getState().getBoard('missing')).toBeUndefined()
    })
  })

  describe('folders', () => {
    it('creates a folder at root', () => {
      const id = useBoardStore.getState().createFolder('My Folder')
      const folders = useBoardStore.getState().folders
      expect(folders).toHaveLength(1)
      expect(folders[0].id).toBe(id)
      expect(folders[0].name).toBe('My Folder')
      expect(folders[0].parentId).toBeNull()
    })

    it('creates a nested folder', () => {
      const parentId = useBoardStore.getState().createFolder('Parent')
      const childId = useBoardStore.getState().createFolder('Child', parentId)
      const child = useBoardStore.getState().folders.find((f) => f.id === childId)
      expect(child?.parentId).toBe(parentId)
    })

    it('renames a folder', () => {
      const id = useBoardStore.getState().createFolder('Old')
      expect(useBoardStore.getState().renameFolder(id, 'New')).toBe(true)
      expect(useBoardStore.getState().folders[0].name).toBe('New')
    })

    it('auto-suffixes duplicate folder names in the same parent', () => {
      const a = useBoardStore.getState().createFolder('Docs')
      const b = useBoardStore.getState().createFolder('Docs')
      const folders = useBoardStore.getState().folders
      expect(folders.find((f) => f.id === a)?.name).toBe('Docs')
      expect(folders.find((f) => f.id === b)?.name).toBe('Docs (2)')
    })

    it('allows the same folder name under different parents', () => {
      const parentA = useBoardStore.getState().createFolder('A')
      const parentB = useBoardStore.getState().createFolder('B')
      useBoardStore.getState().createFolder('Shared', parentA)
      const id = useBoardStore.getState().createFolder('Shared', parentB)
      expect(useBoardStore.getState().folders.find((f) => f.id === id)?.name).toBe('Shared')
    })

    it('rejects renaming to a sibling folder name (case-insensitive)', () => {
      const a = useBoardStore.getState().createFolder('Alpha')
      const b = useBoardStore.getState().createFolder('Beta')
      expect(useBoardStore.getState().renameFolder(b, 'alpha')).toBe(false)
      expect(useBoardStore.getState().folders.find((f) => f.id === b)?.name).toBe('Beta')
      expect(useBoardStore.getState().renameFolder(a, 'Alpha')).toBe(true)
    })

    it('suffixes a moved folder when the destination has the same name', () => {
      const dest = useBoardStore.getState().createFolder('Dest')
      useBoardStore.getState().createFolder('Twin', dest)
      const twin = useBoardStore.getState().createFolder('Twin')
      useBoardStore.getState().moveFolder(twin, dest)
      expect(useBoardStore.getState().folders.find((f) => f.id === twin)?.name).toBe('Twin (2)')
      expect(useBoardStore.getState().folders.find((f) => f.id === twin)?.parentId).toBe(dest)
    })

    it('uniquifies promoted children when deleting a folder', () => {
      const root = useBoardStore.getState().createFolder('Root')
      useBoardStore.getState().createFolder('Clash', root)
      const mid = useBoardStore.getState().createFolder('Mid', root)
      const nested = useBoardStore.getState().createFolder('Clash', mid)
      useBoardStore.getState().deleteFolder(mid)
      expect(useBoardStore.getState().folders.find((f) => f.id === nested)?.parentId).toBe(root)
      expect(useBoardStore.getState().folders.find((f) => f.id === nested)?.name).toBe('Clash (2)')
    })

    it('deletes a folder and reparents children to its parent', () => {
      const rootId = useBoardStore.getState().createFolder('Root')
      const midId = useBoardStore.getState().createFolder('Mid', rootId)
      const nestedId = useBoardStore.getState().createFolder('Nested', midId)
      useBoardStore.getState().saveBoard(makeBoard({ id: 'b1', folderId: midId }))

      useBoardStore.getState().deleteFolder(midId)

      expect(useBoardStore.getState().folders.find((f) => f.id === midId)).toBeUndefined()
      expect(useBoardStore.getState().folders.find((f) => f.id === nestedId)?.parentId).toBe(rootId)
      expect(useBoardStore.getState().boards.find((b) => b.id === 'b1')?.folderId).toBe(rootId)
    })

    it('moves a board into a folder', () => {
      const folderId = useBoardStore.getState().createFolder('F')
      useBoardStore.getState().saveBoard(makeBoard({ id: 'b1' }))
      useBoardStore.getState().moveBoardToFolder('b1', folderId)
      expect(useBoardStore.getState().boards[0].folderId).toBe(folderId)
    })

    it('moves a board to root', () => {
      const folderId = useBoardStore.getState().createFolder('F')
      useBoardStore.getState().saveBoard(makeBoard({ id: 'b1', folderId }))
      useBoardStore.getState().moveBoardToFolder('b1', null)
      expect(useBoardStore.getState().boards[0].folderId).toBeNull()
    })

    it('moves a folder under another folder', () => {
      const a = useBoardStore.getState().createFolder('A')
      const b = useBoardStore.getState().createFolder('B')
      useBoardStore.getState().moveFolder(b, a)
      expect(useBoardStore.getState().folders.find((f) => f.id === b)?.parentId).toBe(a)
    })

    it('rejects moving a folder into itself', () => {
      const a = useBoardStore.getState().createFolder('A')
      useBoardStore.getState().moveFolder(a, a)
      expect(useBoardStore.getState().folders.find((f) => f.id === a)?.parentId).toBeNull()
    })

    it('rejects moving a folder into its descendant', () => {
      const a = useBoardStore.getState().createFolder('A')
      const b = useBoardStore.getState().createFolder('B', a)
      const c = useBoardStore.getState().createFolder('C', b)
      useBoardStore.getState().moveFolder(a, c)
      expect(useBoardStore.getState().folders.find((f) => f.id === a)?.parentId).toBeNull()
    })
  })
})

// ---- GameStore ----

describe('useGameStore', () => {
  beforeEach(() => {
    useGameStore.getState().reset()
  })

  describe('addPlayer', () => {
    it('adds a player to the state', () => {
      const player = makePlayer()
      useGameStore.getState().addPlayer(player)
      expect(useGameStore.getState().state.players).toHaveLength(1)
      expect(useGameStore.getState().state.players[0]).toEqual(player)
    })

    it('does not add a duplicate player id', () => {
      const player = makePlayer()
      useGameStore.getState().addPlayer(player)
      useGameStore.getState().addPlayer(player)
      expect(useGameStore.getState().state.players).toHaveLength(1)
    })
  })

  describe('removePlayer', () => {
    it('removes a player by id', () => {
      const player = makePlayer()
      useGameStore.getState().addPlayer(player)
      useGameStore.getState().removePlayer('player-1')
      expect(useGameStore.getState().state.players).toHaveLength(0)
    })

    it('also removes the player from the buzz queue', () => {
      const player = makePlayer()
      useGameStore.getState().addPlayer(player)
      useGameStore.getState().addBuzz('player-1')
      useGameStore.getState().removePlayer('player-1')
      expect(useGameStore.getState().state.buzzQueue).not.toContain('player-1')
    })

    it('clears board control when the controlling player is removed', () => {
      useGameStore.getState().addPlayer(makePlayer())
      useGameStore.getState().setBoardControl('player-1')
      useGameStore.getState().removePlayer('player-1')
      expect(useGameStore.getState().state.boardControlId).toBeNull()
    })

    it('keeps board control when a different player is removed', () => {
      useGameStore.getState().addPlayer(makePlayer())
      useGameStore.getState().addPlayer(makePlayer({ id: 'player-2', name: 'Bob' }))
      useGameStore.getState().setBoardControl('player-1')
      useGameStore.getState().removePlayer('player-2')
      expect(useGameStore.getState().state.boardControlId).toBe('player-1')
    })
  })

  describe('updatePlayer', () => {
    it('replaces the matching player', () => {
      useGameStore.getState().addPlayer(makePlayer())
      useGameStore.getState().updatePlayer(makePlayer({ name: 'Bob' }))
      expect(useGameStore.getState().state.players[0].name).toBe('Bob')
    })
  })

  describe('setPlayerConnected', () => {
    it('toggles connection flag', () => {
      useGameStore.getState().addPlayer(makePlayer())
      useGameStore.getState().setPlayerConnected('player-1', false)
      expect(useGameStore.getState().state.players[0].isConnected).toBe(false)
    })
  })

  describe('openCard', () => {
    it('sets phase to question and populates activeQuestion', () => {
      const question = makeQuestion()
      useGameStore.getState().openCard('cat-1', question)
      const { state } = useGameStore.getState()
      expect(state.phase).toBe('question')
      expect(state.activeQuestion).toEqual({ categoryId: 'cat-1', question })
      expect(state.buzzQueue).toEqual([])
    })

    it('detects image media type', () => {
      useGameStore.getState().openCard('cat-1', makeQuestion(), 'data:image/png;base64,abc')
      expect(useGameStore.getState().state.activeMedia).toEqual({
        type: 'image',
        dataUrl: 'data:image/png;base64,abc',
      })
    })

    it('detects audio media type', () => {
      useGameStore.getState().openCard('cat-1', makeQuestion(), 'data:audio/mp3;base64,abc')
      expect(useGameStore.getState().state.activeMedia?.type).toBe('audio')
    })

    it('detects video media type', () => {
      useGameStore.getState().openCard('cat-1', makeQuestion(), 'data:video/mp4;base64,abc')
      expect(useGameStore.getState().state.activeMedia?.type).toBe('video')
    })

    it('sets activeMedia to null when no media provided', () => {
      useGameStore.getState().openCard('cat-1', makeQuestion())
      expect(useGameStore.getState().state.activeMedia).toBeNull()
    })

    it('autoplays audio when media is revealed by default', () => {
      useGameStore.getState().openCard(
        'cat-1',
        makeQuestion({ mediaType: 'audio' }),
        'data:audio/mp3;base64,abc',
        { media: true },
      )
      expect(useGameStore.getState().state.mediaPlayback).toEqual({
        paused: false,
        currentTime: 0,
        playbackRate: 1,
      })
    })

    it('keeps audio paused on reveal when autoplayMedia is false', () => {
      useGameStore.getState().openCard(
        'cat-1',
        makeQuestion({ mediaType: 'audio', autoplayMedia: false }),
        'data:audio/mp3;base64,abc',
        { media: true },
      )
      expect(useGameStore.getState().state.mediaPlayback).toEqual({
        paused: true,
        currentTime: 0,
        playbackRate: 1,
      })
    })
  })

  describe('revealMedia', () => {
    it('respects autoplayMedia when revealing media after open', () => {
      useGameStore.getState().openCard(
        'cat-1',
        makeQuestion({ mediaType: 'video', autoplayMedia: false }),
        'data:video/mp4;base64,abc',
      )
      useGameStore.getState().revealMedia()
      expect(useGameStore.getState().state.mediaRevealed).toBe(true)
      expect(useGameStore.getState().state.mediaPlayback?.paused).toBe(true)
    })
  })

  describe('closeCard', () => {
    it('resets to board phase and clears question/buzz/media', () => {
      useGameStore.getState().openCard('cat-1', makeQuestion(), 'data:image/png;base64,abc')
      useGameStore.getState().closeCard()
      const { state } = useGameStore.getState()
      expect(state.phase).toBe('board')
      expect(state.activeQuestion).toBeNull()
      expect(state.buzzQueue).toEqual([])
      expect(state.activeMedia).toBeNull()
    })
  })

  describe('startBuzzing', () => {
    it('sets phase to buzzing and clears the buzz queue', () => {
      useGameStore.getState().startBuzzing()
      const { state } = useGameStore.getState()
      expect(state.phase).toBe('buzzing')
      expect(state.buzzQueue).toEqual([])
    })
  })

  describe('addBuzz', () => {
    it('appends a player to the buzz queue', () => {
      useGameStore.getState().addBuzz('player-1')
      expect(useGameStore.getState().state.buzzQueue).toEqual(['player-1'])
    })

    it('ignores duplicate buzzes', () => {
      useGameStore.getState().addBuzz('player-1')
      useGameStore.getState().addBuzz('player-1')
      expect(useGameStore.getState().state.buzzQueue).toEqual(['player-1'])
    })

    it('preserves order for multiple players', () => {
      useGameStore.getState().addBuzz('player-1')
      useGameStore.getState().addBuzz('player-2')
      useGameStore.getState().addBuzz('player-3')
      expect(useGameStore.getState().state.buzzQueue).toEqual([
        'player-1',
        'player-2',
        'player-3',
      ])
    })
  })

  describe('clearBuzzQueue', () => {
    it('empties the queue and stays in buzzing phase', () => {
      useGameStore.getState().addBuzz('player-1')
      useGameStore.getState().clearBuzzQueue()
      const { state } = useGameStore.getState()
      expect(state.buzzQueue).toEqual([])
      expect(state.phase).toBe('buzzing')
    })
  })

  describe('judgeAnswer', () => {
    beforeEach(() => {
      useGameStore.getState().addPlayer(makePlayer())
      useGameStore.getState().addPlayer(makePlayer({ id: 'player-2', name: 'Bob' }))
      useGameStore.getState().addBuzz('player-1')
      useGameStore.getState().addBuzz('player-2')
    })

    it('adds points and moves to revealed on correct answer', () => {
      useGameStore.getState().judgeAnswer('player-1', true, 200)
      const { state } = useGameStore.getState()
      expect(state.phase).toBe('revealed')
      expect(state.players.find((p) => p.id === 'player-1')?.score).toBe(200)
    })

    it('subtracts points and stays in buzzing on incorrect answer', () => {
      useGameStore.getState().judgeAnswer('player-1', false, -200)
      const { state } = useGameStore.getState()
      expect(state.phase).toBe('buzzing')
      expect(state.players.find((p) => p.id === 'player-1')?.score).toBe(-200)
    })

    it('removes incorrect player from buzz queue', () => {
      useGameStore.getState().judgeAnswer('player-1', false, -200)
      expect(useGameStore.getState().state.buzzQueue).not.toContain('player-1')
      expect(useGameStore.getState().state.buzzQueue).toContain('player-2')
    })

    it('keeps buzz queue intact on correct answer', () => {
      useGameStore.getState().judgeAnswer('player-1', true, 200)
      expect(useGameStore.getState().state.buzzQueue).toContain('player-1')
    })
  })

  describe('revealAnswer', () => {
    it('sets phase to revealed', () => {
      useGameStore.getState().revealAnswer()
      expect(useGameStore.getState().state.phase).toBe('revealed')
    })
  })

  describe('markAnswered', () => {
    it('adds cell id and resets phase/question/buzz/media', () => {
      useGameStore.getState().openCard('cat-1', makeQuestion(), 'data:image/png;base64,abc')
      useGameStore.getState().addBuzz('player-1')
      useGameStore.getState().markAnswered('cat-1-q-1')

      const { state } = useGameStore.getState()
      expect(state.answeredCells).toContain('cat-1-q-1')
      expect(state.phase).toBe('board')
      expect(state.activeQuestion).toBeNull()
      expect(state.buzzQueue).toEqual([])
      expect(state.activeMedia).toBeNull()
    })
  })

  describe('reset', () => {
    it('returns to full default state', () => {
      useGameStore.getState().setIsHost(true)
      useGameStore.getState().setRoomCode('ABC123')
      useGameStore.getState().setMyPlayerId('player-1')
      useGameStore.getState().addPlayer(makePlayer())
      useGameStore.getState().reset()

      const s = useGameStore.getState()
      expect(s.isHost).toBe(false)
      expect(s.roomCode).toBeNull()
      expect(s.myPlayerId).toBeNull()
      expect(s.state.phase).toBe('lobby')
      expect(s.state.players).toEqual([])
      expect(s.state.buzzQueue).toEqual([])
      expect(s.state.board).toBeNull()
      expect(s.state.answeredCells).toEqual([])
      expect(s.state.activeQuestion).toBeNull()
      expect(s.state.activeMedia).toBeNull()
    })
  })
})
