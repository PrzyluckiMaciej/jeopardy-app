import { beforeEach, describe, expect, it } from 'vitest'
import {
  categorySettingsFromGlobal,
  defaultGameSettings,
  getCategoryGameplaySettings,
  loadPersistedSettings,
  mergeGameSettings,
  savePersistedSettings,
  SETTINGS_STORAGE_KEY,
} from '../settings'
import type { Category, CategorySettings, GameSettings } from '../../types'

const globalOn: GameSettings = {
  pointDeduction: true,
  allowNegativeScore: true,
  dailyDoubleMinWager: 5,
  autoBuzzQueue: true,
  autoBuzzQueueOnMedia: true,
  blurClueOnBuzz: true,
  pauseMediaOnBuzz: true,
  autoRevealClue: true,
  autoRevealMedia: true,
  autoStartFinalTimer: true,
}

const globalOff: GameSettings = {
  pointDeduction: false,
  allowNegativeScore: false,
  dailyDoubleMinWager: 5,
  autoBuzzQueue: false,
  autoBuzzQueueOnMedia: false,
  blurClueOnBuzz: false,
  pauseMediaOnBuzz: false,
  autoRevealClue: false,
  autoRevealMedia: false,
  autoStartFinalTimer: false,
}

function category(partial: Partial<Category> = {}): Category {
  return {
    id: 'cat-1',
    name: 'Test',
    questions: [],
    ...partial,
  }
}

describe('categorySettingsFromGlobal', () => {
  it('copies only the gameplay fields', () => {
    expect(categorySettingsFromGlobal(globalOn)).toEqual({
      autoBuzzQueue: true,
      autoBuzzQueueOnMedia: true,
      blurClueOnBuzz: true,
      pauseMediaOnBuzz: true,
      autoRevealClue: true,
      autoRevealMedia: true,
    })
  })
})

describe('getCategoryGameplaySettings', () => {
  it('uses live global settings when category is undefined', () => {
    expect(getCategoryGameplaySettings(undefined, globalOn)).toEqual(
      categorySettingsFromGlobal(globalOn),
    )
  })

  it('treats missing syncSettingsWithGlobal as synced (backward compatible)', () => {
    expect(getCategoryGameplaySettings(category(), globalOn)).toEqual(
      categorySettingsFromGlobal(globalOn),
    )
  })

  it('treats syncSettingsWithGlobal true as synced', () => {
    expect(
      getCategoryGameplaySettings(
        category({
          syncSettingsWithGlobal: true,
          settings: categorySettingsFromGlobal(globalOff),
        }),
        globalOn,
      ),
    ).toEqual(categorySettingsFromGlobal(globalOn))
  })

  it('uses category settings when sync is off', () => {
    const overrides = categorySettingsFromGlobal(globalOn)
    expect(
      getCategoryGameplaySettings(
        category({ syncSettingsWithGlobal: false, settings: overrides }),
        globalOff,
      ),
    ).toEqual(overrides)
  })

  it('falls back to global when sync is off but settings are missing', () => {
    expect(
      getCategoryGameplaySettings(
        category({ syncSettingsWithGlobal: false }),
        globalOn,
      ),
    ).toEqual(categorySettingsFromGlobal(globalOn))
  })

  it('follows global changes while synced (continuous sync)', () => {
    const cat = category({ syncSettingsWithGlobal: true })
    expect(getCategoryGameplaySettings(cat, globalOff).autoBuzzQueue).toBe(false)
    expect(getCategoryGameplaySettings(cat, globalOn).autoBuzzQueue).toBe(true)
  })

  it('fills in new gameplay fields missing from older category snapshots', () => {
    const legacy: Partial<CategorySettings> = { ...categorySettingsFromGlobal(globalOff) }
    delete legacy.autoBuzzQueueOnMedia
    expect(
      getCategoryGameplaySettings(
        category({ syncSettingsWithGlobal: false, settings: legacy as CategorySettings }),
        globalOn,
      ).autoBuzzQueueOnMedia,
    ).toBe(true)
  })
})

describe('mergeGameSettings', () => {
  it('returns defaults for null/undefined', () => {
    expect(mergeGameSettings(null)).toEqual(defaultGameSettings)
    expect(mergeGameSettings(undefined)).toEqual(defaultGameSettings)
  })

  it('fills missing fields from defaults', () => {
    expect(mergeGameSettings({ pointDeduction: true, autoBuzzQueue: true })).toEqual({
      ...defaultGameSettings,
      pointDeduction: true,
      autoBuzzQueue: true,
    })
  })
})

describe('persisted settings', () => {
  beforeEach(() => {
    localStorage.removeItem(SETTINGS_STORAGE_KEY)
  })

  it('loadPersistedSettings returns defaults when nothing stored', () => {
    expect(loadPersistedSettings()).toEqual(defaultGameSettings)
  })

  it('savePersistedSettings writes and loadPersistedSettings restores', () => {
    savePersistedSettings(globalOn)
    expect(JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY)!)).toEqual(globalOn)
    expect(loadPersistedSettings()).toEqual(globalOn)
  })

  it('loadPersistedSettings merges legacy partial snapshots onto defaults', () => {
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({ pointDeduction: true, autoBuzzQueue: true }),
    )
    expect(loadPersistedSettings()).toEqual({
      ...defaultGameSettings,
      pointDeduction: true,
      autoBuzzQueue: true,
    })
  })

  it('loadPersistedSettings returns defaults for invalid JSON', () => {
    localStorage.setItem(SETTINGS_STORAGE_KEY, '{not-json')
    expect(loadPersistedSettings()).toEqual(defaultGameSettings)
  })
})
