import { useEffect, useRef, useState, type AnimationEvent } from 'react'

interface Props {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmModal({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  onConfirm,
  onCancel,
}: Props) {
  const [exiting, setExiting] = useState(false)
  const pendingCloseAction = useRef<(() => void) | null>(null)

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
      pendingCloseAction.current = () => onCancel()
      setExiting(true)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [exiting, onCancel])

  return (
    <div
      className={`confirm-modal-overlay${exiting ? ' confirm-modal-overlay--exit' : ''}`}
      onClick={() => requestClose()}
      role="presentation"
    >
      <div
        className={`panel flex flex-col gap-4 max-w-sm w-full text-center${exiting ? ' modal-exit' : ' modal-enter'}`}
        onClick={(e) => e.stopPropagation()}
        onAnimationEnd={handleModalExitAnimationEnd}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        aria-describedby="confirm-modal-message"
      >
        <div
          id="confirm-modal-title"
          className="font-display text-2xl"
          style={{ color: 'var(--gold-bright)' }}
        >
          {title}
        </div>
        <div
          id="confirm-modal-message"
          className="font-condensed text-base"
          style={{ color: 'var(--white)' }}
        >
          {message}
        </div>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            className={`w-full ${danger ? 'btn-danger' : 'btn-gold'}`}
            disabled={exiting}
            onClick={() => requestClose(() => onConfirm())}
          >
            {confirmLabel}
          </button>
          <button
            type="button"
            className="btn-ghost w-full"
            disabled={exiting}
            onClick={() => requestClose()}
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
