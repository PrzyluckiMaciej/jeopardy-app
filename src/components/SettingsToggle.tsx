interface Props {
  label: string
  description: string
  value: boolean
  onChange: () => void
  disabled?: boolean
}

export default function SettingsToggle({
  label,
  description,
  value,
  onChange,
  disabled,
}: Props) {
  return (
    <div
      role="switch"
      aria-checked={value}
      className={`settings-toggle${disabled ? ' settings-toggle--disabled' : ''}`}
      onClick={disabled ? undefined : onChange}
    >
      <div className="flex-1 min-w-0">
        <div className="font-condensed font-bold" style={{ fontSize: '1.0625rem', lineHeight: 1.3 }}>
          {label}
        </div>
        <div
          className="leading-relaxed"
          style={{ color: '#6b7db3', fontSize: '0.9375rem', marginTop: 'var(--space-xs)' }}
        >
          {description}
        </div>
      </div>
      <div
        className="rounded-full relative transition-colors flex-shrink-0"
        style={{
          background: value ? 'var(--gold)' : 'var(--navy-light)',
          width: 48,
          height: 26,
        }}
      >
        <div
          className="absolute rounded-full transition-transform"
          style={{
            background: 'var(--navy-mid)',
            width: 22,
            height: 22,
            top: 2,
            left: value ? 'calc(100% - 24px)' : 2,
          }}
        />
      </div>
    </div>
  )
}
