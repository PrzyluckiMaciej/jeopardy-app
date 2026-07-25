import type { Category, CategorySettings, GameSettings } from '../types'

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
