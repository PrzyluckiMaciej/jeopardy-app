import { useEffect, useRef, useState, type AnimationEvent } from 'react'

interface Props {
  title: string
  percent: number
  label?: string
  onCancel: () => void
}

export default function TransferProgressModal({ title, percent, label, onCancel }: Props) {
  const [exiting, setExiting] = useState(false)
  const pendingCloseAction = useRef<(() => void) | null>(null)
  const clamped = Math.max(0, Math.min(100, Math.round(percent)))

  function requestClose(afterClose?: () => void) {
    if (exiting) return
    pendingCloseAction.current = afterClose ?? (() => onCancel())
    setExiting(true)
  }

  function handleModalExitAnimationEnd(e: AnimationEvent<HTMLDivElement>) {
    if (!exiting) return
    if (e.target !== e.currentTarget) return
    if (e.animationName !== 'fadeSlideDown') return
    const action = pendingCloseAction.current
    pendingCloseAction.current = null
    action?.()
  }

  useEffect(() => {
    if (exiting) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      onCancel()
      pendingCloseAction.current = () => {}
      setExiting(true)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [exiting, onCancel])

  return (
    <div
      className={`confirm-modal-overlay${exiting ? ' confirm-modal-overlay--exit' : ''}`}
      role="presentation"
    >
      <div
        className={`panel flex flex-col gap-4 max-w-sm w-full text-center${exiting ? ' modal-exit' : ' modal-enter'}`}
        onClick={(e) => e.stopPropagation()}
        onAnimationEnd={handleModalExitAnimationEnd}
        role="dialog"
        aria-modal="true"
        aria-labelledby="transfer-progress-title"
        aria-describedby="transfer-progress-status"
      >
        <div
          id="transfer-progress-title"
          className="font-display text-2xl"
          style={{ color: 'var(--gold-bright)' }}
        >
          {title}
        </div>

        <div className="transfer-progress-bar" role="progressbar" aria-valuenow={clamped} aria-valuemin={0} aria-valuemax={100}>
          <div className="transfer-progress-bar__fill" style={{ width: `${clamped}%` }} />
        </div>

        <div
          id="transfer-progress-status"
          className="font-condensed text-base"
          style={{ color: 'var(--white)' }}
        >
          {clamped}%{label ? ` — ${label}` : ''}
        </div>

        <button
          type="button"
          className="btn-ghost w-full"
          disabled={exiting}
          onClick={() => {
            onCancel()
            requestClose(() => {})
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
