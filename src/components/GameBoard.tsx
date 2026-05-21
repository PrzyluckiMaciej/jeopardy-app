import type { Board, Question } from '../types'
import { cellId } from '../lib/utils'

interface GameBoardProps {
  board: Board
  answeredCells: string[]
  onOpenCell?: (categoryId: string, q: Question) => void
  dailyDoubleQuestionId?: string
}

export default function GameBoard({ board, answeredCells, onOpenCell, dailyDoubleQuestionId }: GameBoardProps) {
  return (
    <div className="overflow-auto">
      <div
        className="grid gap-2 min-w-max"
        style={{ gridTemplateColumns: `repeat(${board.categories.length}, minmax(140px, 1fr))` }}
      >
        {board.categories.map((cat) => (
          <div
            key={cat.id}
            className="flex items-center justify-center text-center px-2 py-4 rounded font-condensed font-bold uppercase"
            style={{ background: 'var(--navy-mid)', border: '2px solid var(--navy-light)', letterSpacing: 1, fontSize: 14, minHeight: 72 }}
          >
            {cat.name}
          </div>
        ))}

        {board.pointValues.map((pts) =>
          board.categories.map((cat) => {
            const q = cat.questions.find((q) => q.points === pts)
            if (!q) return <div key={`${cat.id}-${pts}`} />
            const isAnswered = answeredCells.includes(cellId(cat.id, q.id))
            const interactive = !!onOpenCell && !isAnswered
            return (
              <button
                key={q.id}
                className={`board-cell rounded flex flex-col items-center justify-center gap-1 ${isAnswered ? 'answered' : ''}`}
                style={{
                  minHeight: 90,
                  cursor: interactive ? 'pointer' : 'default',
                  pointerEvents: onOpenCell ? undefined : 'none',
                }}
                onClick={() => interactive && onOpenCell(cat.id, q)}
                disabled={isAnswered || !onOpenCell}
              >
                <span className="font-display text-3xl" style={{ color: isAnswered ? '#4a5580' : 'var(--gold-bright)' }}>
                  ${pts}
                </span>
                {q.mediaId && !isAnswered && (
                  <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: 'var(--gold)', opacity: 0.6 }} />
                )}
                {dailyDoubleQuestionId === q.id && !isAnswered && (
                  <div className="dd-badge">DD</div>
                )}
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
