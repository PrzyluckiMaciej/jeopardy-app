import type { Board, Question } from '../types'
import { cellId } from '../lib/utils'

interface GameBoardProps {
  board: Board
  answeredCells: string[]
  onOpenCell?: (categoryId: string, q: Question) => void
  dailyDoubleQuestionId?: string
  /** Tighter cells for host view on laptop screens */
  compact?: boolean
}

export default function GameBoard({
  board,
  answeredCells,
  onOpenCell,
  dailyDoubleQuestionId,
  compact = false,
}: GameBoardProps) {
  const colMin = compact ? 100 : 140
  const headerMinH = compact ? 48 : 72
  const cellMinH = compact ? 56 : 90
  const headerFontSize = compact ? 12 : 14
  const headerPy = compact ? 'py-2' : 'py-4'
  const valueFontSize = compact ? '1.375rem' : undefined
  const gap = compact ? 'gap-1.5' : 'gap-2'

  return (
    <div className={compact ? 'min-h-0' : 'overflow-auto'}>
      <div
        className={`grid ${gap} min-w-max`}
        style={{ gridTemplateColumns: `repeat(${board.categories.length}, minmax(${colMin}px, 1fr))` }}
      >
        {board.categories.map((cat) => (
          <div
            key={cat.id}
            className={`flex items-center justify-center text-center px-2 ${headerPy} rounded font-condensed font-bold uppercase`}
            style={{
              background: 'var(--navy-mid)',
              border: '2px solid var(--navy-light)',
              letterSpacing: 1,
              fontSize: headerFontSize,
              minHeight: headerMinH,
            }}
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
                className={`board-cell rounded flex flex-col items-center justify-center gap-0.5 ${isAnswered ? 'answered' : ''}`}
                style={{
                  minHeight: cellMinH,
                  cursor: interactive ? 'pointer' : 'default',
                  pointerEvents: onOpenCell ? undefined : 'none',
                  position: 'relative',
                }}
                onClick={() => interactive && onOpenCell(cat.id, q)}
                disabled={isAnswered || !onOpenCell}
              >
                <span
                  className={compact ? 'font-display leading-none' : 'font-display text-3xl'}
                  style={{
                    color: isAnswered ? '#4a5580' : 'var(--gold-bright)',
                    fontSize: valueFontSize,
                  }}
                >
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
