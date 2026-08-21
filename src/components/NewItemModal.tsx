import { useRef, useState, type AnimationEvent } from 'react'
import {
  PICKER_ITEM_TYPE_LABELS,
  type PickerItemType,
} from '../lib/pickerItemType'
import StyledDropdown from './StyledDropdown'

interface Props {
  allowedTypes: readonly PickerItemType[]
  onConfirm: (type: PickerItemType) => void
  onCancel: () => void
}

export default function NewItemModal({ allowedTypes, onConfirm, onCancel }: Props) {
  const [selectedType, setSelectedType] = useState<PickerItemType>(
    () => allowedTypes[0] ?? 'folder',
  )
  const [exiting, setExiting] = useState(false)
  const pendingCloseAction = useRef<(() => void) | null>(null)

  const canCreate = allowedTypes.includes(selectedType)

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

  function handleCreate() {
    if (!canCreate || exiting) return
    const type = selectedType
    requestClose(() => onConfirm(type))
  }

  return (
    <div
      className={`add-to-game-modal-overlay${exiting ? ' add-to-game-modal-overlay--exit' : ''}`}
      onClick={() => requestClose()}
      role="presentation"
    >
      <div
        className={`panel flex flex-col gap-4 max-w-sm w-full${exiting ? ' modal-exit' : ' modal-enter'}`}
        onClick={(e) => e.stopPropagation()}
        onAnimationEnd={handleModalExitAnimationEnd}
        role="dialog"
        aria-labelledby="new-item-title"
      >
        <div
          id="new-item-title"
          className="font-display text-2xl text-center"
          style={{ color: 'var(--gold-bright)' }}
        >
          New item
        </div>

        <div className="flex flex-col gap-2">
          <span className="font-condensed text-sm text-muted" id="new-item-type-label">
            Type
          </span>
          <StyledDropdown
            value={selectedType}
            onChange={(value) => setSelectedType(value as PickerItemType)}
            placeholder="Select a type"
            ariaLabelledBy="new-item-type-label"
            options={allowedTypes.map((type) => ({
              value: type,
              label: PICKER_ITEM_TYPE_LABELS[type],
            }))}
          />
        </div>

        <div className="flex flex-col gap-2">
          <button
            type="button"
            className="w-full btn-gold"
            onClick={handleCreate}
            disabled={!canCreate || exiting}
          >
            Create
          </button>
          <button
            type="button"
            className="btn-ghost w-full"
            onClick={() => requestClose()}
            disabled={exiting}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
