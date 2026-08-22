import { useEffect, useRef, type ChangeEvent, type MouseEvent, type PointerEvent } from 'react'

interface Props {
  checked: boolean
  indeterminate?: boolean
  onChange: (checked: boolean) => void
  ariaLabel: string
  disabled?: boolean
}

function stopRowGestures(e: MouseEvent | PointerEvent) {
  e.stopPropagation()
}

export default function PickerCheckbox({
  checked,
  indeterminate = false,
  onChange,
  ariaLabel,
  disabled = false,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (inputRef.current) inputRef.current.indeterminate = indeterminate
  }, [indeterminate])

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    onChange(e.target.checked)
  }

  return (
    <label
      className="board-picker-checkbox"
      draggable={false}
      onClick={stopRowGestures}
      onMouseDown={stopRowGestures}
      onPointerDown={stopRowGestures}
    >
      <input
        ref={inputRef}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={handleChange}
        onClick={stopRowGestures}
        aria-label={ariaLabel}
      />
    </label>
  )
}
