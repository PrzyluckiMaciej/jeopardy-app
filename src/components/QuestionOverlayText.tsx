import { useRef, type CSSProperties, type ReactNode } from 'react'
import { useOverlayTextFontSize } from '../hooks/useOverlayTextFontSize'

interface Props {
  clue: string
  answer: string
  media?: ReactNode
  hasMediaSlot?: boolean
  contentKey?: string | number
  clueKey?: string | number
  answerKey?: string | number
  clueClassName?: string
  answerClassName?: string
  clueStyle?: CSSProperties
  clueRevealed?: boolean
  answerRevealed?: boolean
  showClueContent?: boolean
  showAnswerContent?: boolean
}

export default function QuestionOverlayText({
  clue,
  answer,
  media,
  hasMediaSlot = false,
  contentKey,
  clueKey,
  answerKey,
  clueClassName = '',
  answerClassName = '',
  clueStyle,
  clueRevealed = true,
  answerRevealed = true,
  showClueContent = true,
  showAnswerContent = true,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const clueRef = useRef<HTMLDivElement>(null)

  const { fontSizePx, clueMinHeight, answerMinHeight } = useOverlayTextFontSize({
    clue,
    answer,
    containerRef,
    clueRef,
    hasMediaSlot,
    enabled: true,
  })

  const textStyle: CSSProperties | undefined = fontSizePx
    ? { fontSize: `${fontSizePx}px` }
    : undefined

  const contentStyle = fontSizePx
    ? ({ '--overlay-text-size': `${fontSizePx}px` } as CSSProperties)
    : undefined

  const mediaSlot = hasMediaSlot
    ? media ?? <div className="question-overlay-media question-overlay-media--pending" aria-hidden />
    : null

  return (
    <div
      key={contentKey}
      ref={containerRef}
      className="question-overlay-content w-full"
      style={contentStyle}
    >
      <div
        key={clueKey}
        ref={clueRef}
        aria-hidden={!showClueContent}
        className={`question-overlay-clue font-condensed font-bold w-full${
          clueRevealed ? '' : ' question-overlay-clue--pending'
        }${!showClueContent ? ' question-overlay-clue--concealed' : ''}${
          clueClassName ? ` ${clueClassName}` : ''
        }`}
        style={{
          ...textStyle,
          ...clueStyle,
          ...(!showClueContent && clueMinHeight > 0 ? { minHeight: clueMinHeight } : undefined),
        }}
      >
        {showClueContent ? clue : null}
      </div>

      {mediaSlot}

      <div
        key={answerKey}
        aria-hidden={!showAnswerContent}
        className={`question-overlay-answer font-condensed font-bold${
          answerRevealed ? '' : ' question-overlay-answer--pending'
        }${!showAnswerContent ? ' question-overlay-answer--concealed' : ''}${
          answerClassName ? ` ${answerClassName}` : ''
        }`}
        style={{
          ...textStyle,
          ...(!showAnswerContent && answerMinHeight > 0 ? { minHeight: answerMinHeight } : undefined),
        }}
      >
        {showAnswerContent ? answer || '—' : null}
      </div>
    </div>
  )
}
