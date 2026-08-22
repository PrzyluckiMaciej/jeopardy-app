import { useEffect, type AnimationEvent, type CSSProperties } from 'react'
import { Check, X } from 'lucide-react'
import {
  TOAST_DURATION_MS,
  TOAST_EXIT_MS,
  useToastStore,
  type ToastItem,
} from '../store/toastStore'

function ToastCard({ toast }: { toast: ToastItem }) {
  const dismiss = useToastStore((s) => s.dismiss)
  const remove = useToastStore((s) => s.remove)

  useEffect(() => {
    if (toast.exiting) return
    const timer = window.setTimeout(() => {
      dismiss(toast.id)
    }, TOAST_DURATION_MS)
    return () => window.clearTimeout(timer)
  }, [toast.id, toast.exiting, dismiss])

  useEffect(() => {
    if (!toast.exiting) return
    const timer = window.setTimeout(() => {
      remove(toast.id)
    }, TOAST_EXIT_MS + 50)
    return () => window.clearTimeout(timer)
  }, [toast.id, toast.exiting, remove])

  function handleAnimationEnd(e: AnimationEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget) return
    if (e.animationName !== 'toastOut') return
    if (!toast.exiting) return
    remove(toast.id)
  }

  return (
    <div
      className={`toast toast--${toast.variant}${toast.exiting ? ' toast--exit' : ''}`}
      role={toast.variant === 'error' ? 'alert' : 'status'}
      onAnimationEnd={handleAnimationEnd}
      style={{ '--toast-duration': `${TOAST_DURATION_MS}ms` } as CSSProperties}
    >
      <div className="toast__body">
        <span className="toast__icon" aria-hidden>
          {toast.variant === 'success' ? <Check size={16} /> : <X size={16} />}
        </span>
        <span className="toast__message">{toast.message}</span>
        <button
          type="button"
          className="toast__dismiss"
          aria-label="Dismiss"
          onClick={() => dismiss(toast.id)}
        >
          <X size={14} aria-hidden />
        </button>
      </div>
      <div className="toast__timer" aria-hidden>
        <div
          className={`toast__timer-fill${toast.exiting ? ' toast__timer-fill--paused' : ''}`}
        />
      </div>
    </div>
  )
}

export default function ToastHost() {
  const toasts = useToastStore((s) => s.toasts)

  if (toasts.length === 0) return null

  return (
    <div className="toast-host" aria-live="polite" aria-relevant="additions">
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} />
      ))}
    </div>
  )
}
