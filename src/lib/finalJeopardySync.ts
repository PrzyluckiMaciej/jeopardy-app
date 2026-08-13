import type { GameState } from '../types'

/** Strip unrevealed Final Jeopardy wagers/answers before applying host SYNC_STATE on players. */
export function sanitizeGameStateForPlayer(state: GameState, myPlayerId: string): GameState {
  if (!state.finalJeopardy) return state
  const fj = state.finalJeopardy
  const wagers: Record<string, number> = {}
  const answers: Record<string, string> = {}

  if (fj.wagers[myPlayerId] != null) {
    wagers[myPlayerId] = fj.wagers[myPlayerId]
  }
  if (fj.answers[myPlayerId] != null) {
    answers[myPlayerId] = fj.answers[myPlayerId]
  }

  for (const id of fj.revealedPlayerIds) {
    if (fj.wagers[id] != null) wagers[id] = fj.wagers[id]
    if (fj.answers[id] != null) answers[id] = fj.answers[id]
  }

  return {
    ...state,
    finalJeopardy: {
      ...fj,
      wagers,
      answers,
    },
  }
}
