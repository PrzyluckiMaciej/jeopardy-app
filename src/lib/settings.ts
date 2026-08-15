import type { Category, CategorySettings, GameSettings } from '../types'

export const SETTINGS_STORAGE_KEY = 'jeopardy-settings'

export const defaultGameSettings: GameSettings = {
  pointDeduction: false,
  allowNegativeScore: false,
  dailyDoubleMinWager: 5,
  autoBuzzQueue: false,
  autoBuzzQueueOnMedia: false,
  blurClueOnBuzz: false,
  pauseMediaOnBuzz: false,
  autoRevealClue: false,
  autoRevealMedia: false,
  autoStartFinalTimer: true,
}

export function categorySettingsFromGlobal(global: GameSettings): CategorySettings {
  return {
    autoBuzzQueue: global.autoBuzzQueue,
    autoBuzzQueueOnMedia: global.autoBuzzQueueOnMedia,
    blurClueOnBuzz: global.blurClueOnBuzz,
    pauseMediaOnBuzz: global.pauseMediaOnBuzz,
    autoRevealClue: global.autoRevealClue,
    autoRevealMedia: global.autoRevealMedia,
  }
}

/** Resolve gameplay settings for a category. Missing/undefined sync = synced with global. */
export function getCategoryGameplaySettings(
  category: Category | undefined,
  global: GameSettings,
): CategorySettings {
  const fromGlobal = categorySettingsFromGlobal(global)
  if (!category || category.syncSettingsWithGlobal !== false) {
    return fromGlobal
  }
  // Merge so older saved category snapshots pick up new gameplay fields.
  return category.settings ? { ...fromGlobal, ...category.settings } : fromGlobal
}

/** Merge partial/legacy stored settings onto defaults so new fields get defaults. */
export function mergeGameSettings(partial: Partial<GameSettings> | null | undefined): GameSettings {
  if (!partial || typeof partial !== 'object') return { ...defaultGameSettings }
  return { ...defaultGameSettings, ...partial }
}

export function loadPersistedSettings(): GameSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY)
    if (!raw) return { ...defaultGameSettings }
    return mergeGameSettings(JSON.parse(raw) as Partial<GameSettings>)
  } catch {
    return { ...defaultGameSettings }
  }
}

export function savePersistedSettings(settings: GameSettings): void {
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings))
}
