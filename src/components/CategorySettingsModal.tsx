import { useState } from 'react'
import { X } from 'lucide-react'
import type { Category, CategorySettings, GameSettings } from '../types'
import {
  categorySettingsFromGlobal,
  getCategoryGameplaySettings,
} from '../lib/settings'
import SettingsToggle from './SettingsToggle'

interface Props {
  category: Category
  globalSettings: GameSettings
  onChange: (patch: Partial<Category>) => void
  onClose: () => void
}

const sectionTitleStyle = {
  color: 'var(--gold)',
  opacity: 0.8,
  fontSize: '0.8125rem',
  letterSpacing: '0.12em',
} as const

export default function CategorySettingsModal({
  category,
  globalSettings,
  onChange,
  onClose,
}: Props) {
  const [exiting, setExiting] = useState(false)
  const synced = category.syncSettingsWithGlobal !== false
  const effective = getCategoryGameplaySettings(category, globalSettings)

  function requestClose() {
    if (exiting) return
    setExiting(true)
  }

  function handleExitAnimationEnd(e: React.AnimationEvent<HTMLDivElement>) {
    if (!exiting) return
    if (e.target !== e.currentTarget) return
    if (e.animationName !== 'fadeSlideDown') return
    onClose()
  }

  function setSync(enabled: boolean) {
    if (enabled) {
      onChange({
        syncSettingsWithGlobal: true,
        settings: categorySettingsFromGlobal(globalSettings),
      })
    } else {
      onChange({
        syncSettingsWithGlobal: false,
        settings: category.settings ?? categorySettingsFromGlobal(globalSettings),
      })
    }
  }

  function toggleSetting(key: keyof CategorySettings) {
    const base = getCategoryGameplaySettings(category, globalSettings)
    onChange({
      syncSettingsWithGlobal: false,
      settings: { ...base, [key]: !base[key] },
    })
  }

  return (
    <div
      className={`board-picker-overlay${exiting ? ' board-picker-overlay--exit' : ''}`}
      onClick={requestClose}
    >
      <div
        className={`panel flex flex-col gap-6 max-w-2xl w-full${exiting ? ' modal-exit' : ' modal-enter'}`}
        style={{ maxHeight: '90vh', overflow: 'auto' }}
        onClick={(e) => e.stopPropagation()}
        onAnimationEnd={handleExitAnimationEnd}
        role="dialog"
        aria-labelledby="category-settings-title"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-condensed font-bold uppercase mb-1" style={sectionTitleStyle}>
              Category settings
            </div>
            <h2
              id="category-settings-title"
              className="font-condensed font-bold uppercase"
              style={{ fontSize: '1.25rem', color: 'var(--gold-bright)' }}
            >
              {category.name}
            </h2>
          </div>
          <button
            type="button"
            className="board-picker-close"
            onClick={requestClose}
            aria-label="Close category settings"
          >
            <X size={18} aria-hidden />
          </button>
        </div>

        <SettingsToggle
          label="Sync with global settings"
          description="When on, this category uses the host game settings"
          value={synced}
          onChange={() => setSync(!synced)}
        />

        <div className="category-settings-toggles">
          <SettingsToggle
            label="Auto buzz queue on clue"
            description="Players can buzz immediately after the clue is revealed"
            value={effective.autoBuzzQueue}
            onChange={() => toggleSetting('autoBuzzQueue')}
          />
          <SettingsToggle
            label="Auto buzz queue on media"
            description="Players can buzz immediately after the media is revealed"
            value={effective.autoBuzzQueueOnMedia}
            onChange={() => toggleSetting('autoBuzzQueueOnMedia')}
          />
          <SettingsToggle
            label="Blur clue on buzz"
            description="Blurs the clue when any player buzzes in"
            value={effective.blurClueOnBuzz}
            onChange={() => toggleSetting('blurClueOnBuzz')}
          />
          <SettingsToggle
            label="Pause media on buzz"
            description="Pauses audio or video when the first player buzzes in"
            value={effective.pauseMediaOnBuzz}
            onChange={() => toggleSetting('pauseMediaOnBuzz')}
          />
          <SettingsToggle
            label="Auto-reveal clue"
            description="Show the clue text to players as soon as a question opens"
            value={effective.autoRevealClue}
            onChange={() => toggleSetting('autoRevealClue')}
          />
          <SettingsToggle
            label="Auto-reveal media"
            description="Show attached media to players as soon as a question opens"
            value={effective.autoRevealMedia}
            onChange={() => toggleSetting('autoRevealMedia')}
          />
        </div>
      </div>
    </div>
  )
}
