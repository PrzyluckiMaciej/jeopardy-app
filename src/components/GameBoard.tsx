import type { CSSProperties } from 'react'
import type { Board, Question } from '../types'
import { cellId } from '../lib/utils'

interface GameBoardProps {
  board: Board
  answeredCells: string[]
  onOpenCell?: (categoryId: string, q: Question) => void
  dailyDoubleQuestionId?: string
  /** Stretch grid to fill parent height (host view) */
  fill?: boolean
}

export default function GameBoard({
  board,
  answeredCells,
  onOpenCell,
  dailyDoubleQuestionId,
  fill = false,
}: GameBoardProps) {
  const rowCount = board.pointValues.length

  const gridStyle = fill
    ? {
        gridTemplateColumns: `repeat(${board.categories.length}, minmax(0, 1fr))`,
        gridTemplateRows: `minmax(3rem, auto) repeat(${rowCount}, minmax(0, 1fr))`,
      }
    : {
        gridTemplateColumns: `repeat(${board.categories.length}, minmax(140px, 1fr))`,
      }

  const rootClass = [
    'game-board',
    fill ? 'game-board--fill h-full w-full min-h-0' : 'game-board--touch overflow-auto',
  ].join(' ')

  return (
    <div
      className={rootClass}
      style={{ '--board-cols': board.categories.length } as CSSProperties}
    >
      <div
        className={`game-board__grid grid gap-2 ${fill ? 'h-full w-full' : 'min-w-max'}`}
        style={gridStyle}
      >
        {board.categories.map((cat) => (
          <div
            key={cat.id}
            className={`flex items-center justify-center text-center px-2 rounded font-condensed font-bold uppercase min-h-0 ${fill ? 'py-2' : 'py-4'}`}
            style={{
              background: 'var(--navy-mid)',
              border: '2px solid var(--navy-light)',
              letterSpacing: 1,
              fontSize: fill ? 'var(--board-category-font-size)' : 14,
              minHeight: fill ? undefined : 72,
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
                className={`board-cell rounded flex flex-col items-center justify-center gap-1 min-h-0 ${isAnswered ? 'answered' : ''}`}
                style={{
                  height: fill ? '100%' : undefined,
                  minHeight: fill ? 0 : 90,
                  cursor: interactive ? 'pointer' : 'default',
                  pointerEvents: onOpenCell ? undefined : 'none',
                  position: 'relative',
                }}
                onClick={() => interactive && onOpenCell(cat.id, q)}
                disabled={isAnswered || !onOpenCell}
              >
                <span
                  className={`board-cell__value font-display leading-none${fill ? '' : ' text-3xl'}`}
                  style={{
                    color: isAnswered ? '#4a5580' : 'var(--gold-bright)',
                    fontSize: fill ? 'var(--board-cell-value-font-size)' : undefined,
                  }}
                >
                  ${pts}
                </span>
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
