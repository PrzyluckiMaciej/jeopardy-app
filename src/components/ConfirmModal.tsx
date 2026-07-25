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
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(6,11,40,0.85)' }}
      onClick={onCancel}
      role="presentation"
    >
      <div
        className="panel modal-enter flex flex-col gap-4 max-w-sm w-full text-center"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
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
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
          <button type="button" className="btn-ghost w-full" onClick={onCancel}>
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
