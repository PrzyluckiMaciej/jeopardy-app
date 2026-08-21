import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { ChevronDown } from 'lucide-react'

interface Props {
  onCreate: () => void
  onImport: () => void
}

export default function AddItemButton({ onCreate, onImport }: Props) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handlePointerDown(e: Event) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  function handleToggle(e: MouseEvent) {
    e.stopPropagation()
    setOpen((v) => !v)
  }

  return (
    <div className="board-picker-add-item" ref={rootRef}>
      <button
        type="button"
        className="board-picker-new-item-btn board-picker-add-item-btn"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={handleToggle}
      >
        Add Item
        <ChevronDown size={14} aria-hidden className="board-picker-add-item-btn__chevron" />
      </button>
      {open && (
        <div className="board-picker-add-item-menu" role="menu">
          <button
            type="button"
            role="menuitem"
            className="board-picker-add-item-menu__item"
            onClick={() => {
              setOpen(false)
              onCreate()
            }}
          >
            Create
          </button>
          <button
            type="button"
            role="menuitem"
            className="board-picker-add-item-menu__item"
            onClick={() => {
              setOpen(false)
              onImport()
            }}
          >
            Import
          </button>
        </div>
      )}
    </div>
  )
}
