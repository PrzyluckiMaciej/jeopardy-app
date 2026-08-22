export interface PickerMassAction {
  id: string
  label: string
  onSelect: () => void
  danger?: boolean
  disabled?: boolean
}

interface Props {
  count: number
  actions: PickerMassAction[]
}

export default function PickerMassActionBar({ count, actions }: Props) {
  const noun = count === 1 ? 'item' : 'items'
  return (
    <div className="board-picker-mass-bar" role="toolbar" aria-label="Mass actions">
      <span className="board-picker-mass-bar__count">
        {count} {noun} selected
      </span>
      <div className="board-picker-mass-bar__actions">
        {actions.map((action) => (
          <button
            key={action.id}
            type="button"
            className={action.danger ? 'btn-danger' : 'btn-ghost'}
            onClick={action.onSelect}
            disabled={action.disabled}
          >
            {action.label}
          </button>
        ))}
      </div>
    </div>
  )
}
