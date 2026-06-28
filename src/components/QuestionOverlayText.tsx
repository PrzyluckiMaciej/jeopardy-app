import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useOverlayTextFontSize } from '../hooks/useOverlayTextFontSize'

interface Props {
  clue: string
  answer: string
  media?: ReactNode
  contentKey?: string | number
  clueKey?: string | number
  answerKey?: string | number
  clueClassName?: string
  answerClassName?: string
  clueStyle?: CSSProperties
  clueRevealed?: boolean
  answerRevealed?: boolean
  beforeContent?: ReactNode
}

export default function QuestionOverlayText({
  clue,
  answer,
  media,
  contentKey,
  clueKey,
  answerKey,
  clueClassName = '',
  answerClassName = '',
  clueStyle,
  clueRevealed = true,
  answerRevealed = true,
  beforeContent,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const clueRef = useRef<HTMLDivElement>(null)
  const beforeRef = useRef<HTMLDivElement>(null)
  const [reservedHeight, setReservedHeight] = useState(0)

  useLayoutEffect(() => {
    const el = beforeRef.current
    if (!el) {
      setReservedHeight(0)
      return
    }

    const measure = () => setReservedHeight(el.offsetHeight)
    measure()

    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [beforeContent])

  const fontSizePx = useOverlayTextFontSize({
    clue,
    answer,
    containerRef,
    clueRef,
    reservedHeight,
    enabled: true,
  })

  const textStyle: CSSProperties | undefined = fontSizePx
    ? { fontSize: `${fontSizePx}px` }
    : undefined

  const contentStyle = fontSizePx
    ? ({ '--overlay-text-size': `${fontSizePx}px` } as CSSProperties)
    : undefined

  return (
    <div
      key={contentKey}
      ref={containerRef}
      className="question-overlay-content w-full"
      style={contentStyle}
    >
      {beforeContent != null && (
        <div ref={beforeRef} className="w-full">
          {beforeContent}
        </div>
      )}

      {media}

      <div
        key={clueKey}
        ref={clueRef}
        className={`question-overlay-clue font-condensed font-bold w-full${
          clueRevealed ? '' : ' question-overlay-clue--pending'
        }${clueClassName ? ` ${clueClassName}` : ''}`}
        style={{ ...textStyle, ...clueStyle }}
      >
        {clue}
      </div>

      <div
        key={answerKey}
        className={`question-overlay-answer font-condensed font-bold${
          answerRevealed ? '' : ' question-overlay-answer--pending'
        }${answerClassName ? ` ${answerClassName}` : ''}`}
        style={textStyle}
      >
        {answer || '—'}
      </div>
    </div>
  )
}
