import type { Category, CategorySettings, GameSettings } from '../types'

export function categorySettingsFromGlobal(global: GameSettings): CategorySettings {
  return {
    autoBuzzQueue: global.autoBuzzQueue,
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
  if (!category || category.syncSettingsWithGlobal !== false) {
    return categorySettingsFromGlobal(global)
  }
  return category.settings ?? categorySettingsFromGlobal(global)
}
