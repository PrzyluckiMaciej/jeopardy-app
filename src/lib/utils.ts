export function generateId(): string {
  return crypto.randomUUID()
}

export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
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
      questions: pointValues.map((points) => ({
        id: generateId(),
        question: '',
        answer: '',
        points,
      })),
    })),
  }
}
