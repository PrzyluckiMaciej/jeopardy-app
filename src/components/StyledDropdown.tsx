import { useCallback, useEffect, useRef, useState, type AnimationEvent, type ReactNode } from 'react'
import { Check, ChevronDown } from 'lucide-react'

export interface StyledDropdownOption {
  value: string
  label: string
  description?: string
}

interface Props {
  options: StyledDropdownOption[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  ariaLabelledBy?: string
  triggerIcon?: ReactNode
  optionIcon?: ReactNode
  showCheckOnSelected?: boolean
}

export default function StyledDropdown({
  options,
  value,
  onChange,
  placeholder = 'Select…',
  disabled = false,
  ariaLabelledBy,
  triggerIcon,
  optionIcon,
  showCheckOnSelected = true,
}: Props) {
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [dropdownExiting, setDropdownExiting] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const selectedOption = options.find((o) => o.value === value)
  const dropdownVisible = dropdownOpen || dropdownExiting
  const dropdownActive = dropdownOpen && !dropdownExiting

  function openDropdown() {
    if (disabled) return
    setDropdownExiting(false)
    setDropdownOpen(true)
  }

  const closeDropdown = useCallback(() => {
    if (!dropdownOpen || dropdownExiting) return
    setDropdownExiting(true)
  }, [dropdownOpen, dropdownExiting])

  function handleMenuAnimationEnd(e: AnimationEvent<HTMLUListElement>) {
    if (!dropdownExiting) return
    if (e.target !== e.currentTarget) return
    if (e.animationName !== 'addToGameDropdownOut') return
    setDropdownOpen(false)
    setDropdownExiting(false)
  }

  useEffect(() => {
    if (!dropdownActive) return
    function handlePointerDown(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        closeDropdown()
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') closeDropdown()
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [dropdownActive, closeDropdown])

  return (
    <div className="add-to-game-dropdown" ref={dropdownRef}>
      <button
        type="button"
        className={`add-to-game-dropdown__trigger${dropdownActive ? ' add-to-game-dropdown__trigger--open' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={dropdownActive}
        aria-labelledby={ariaLabelledBy}
        disabled={disabled}
        onClick={() => {
          if (dropdownActive) closeDropdown()
          else openDropdown()
        }}
      >
        <span className="add-to-game-dropdown__value">
          {triggerIcon}
          <span className="truncate">{selectedOption?.label ?? placeholder}</span>
          {selectedOption?.description && (
            <span className="add-to-game-dropdown__path truncate" title={selectedOption.description}>
              {selectedOption.description}
            </span>
          )}
        </span>
        <ChevronDown
          size={16}
          className={`add-to-game-dropdown__chevron${dropdownActive ? ' add-to-game-dropdown__chevron--open' : ''}`}
        />
      </button>
      {dropdownVisible && (
        <ul
          className={`add-to-game-dropdown__menu${dropdownExiting ? ' add-to-game-dropdown__menu--exit' : ' add-to-game-dropdown__menu--enter'}`}
          role="listbox"
          aria-labelledby={ariaLabelledBy}
          onAnimationEnd={handleMenuAnimationEnd}
        >
          {options.map((o) => {
            const selected = o.value === value
            return (
              <li key={o.value || '__empty__'} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={`add-to-game-dropdown__option${selected ? ' add-to-game-dropdown__option--selected' : ''}`}
                  onClick={() => {
                    onChange(o.value)
                    closeDropdown()
                  }}
                >
                  <span className="add-to-game-dropdown__option-label">
                    {optionIcon}
                    <span className="truncate">{o.label}</span>
                    {o.description && (
                      <span className="add-to-game-dropdown__path truncate" title={o.description}>
                        {o.description}
                      </span>
                    )}
                  </span>
                  {showCheckOnSelected && selected && (
                    <Check size={14} className="flex-shrink-0 text-gold" />
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
