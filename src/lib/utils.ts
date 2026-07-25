export function generateId(): string {
  return crypto.randomUUID()
}

export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

import type { Player } from '../types'

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

export function cellId(categoryId: string, questionId: string): string {
  return `${categoryId}-${questionId}`
}

export function createDefaultBoard(): import('../types').Board {
  const id = generateId()
  const pointValues = [200, 400, 600, 800, 1000]
  return {
    id,
    name: 'New Board',
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
