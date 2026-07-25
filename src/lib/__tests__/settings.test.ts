import {
  categorySettingsFromGlobal,
  getCategoryGameplaySettings,
} from '../settings'
import type { Category, CategorySettings, GameSettings } from '../../types'

const globalOn: GameSettings = {
  pointDeduction: true,
  allowNegativeScore: true,
  autoBuzzQueue: true,
  autoBuzzQueueOnMedia: true,
  blurClueOnBuzz: true,
  pauseMediaOnBuzz: true,
  autoRevealClue: true,
  autoRevealMedia: true,
}

const globalOff: GameSettings = {
  pointDeduction: false,
  allowNegativeScore: false,
  autoBuzzQueue: false,
  autoBuzzQueueOnMedia: false,
  blurClueOnBuzz: false,
  pauseMediaOnBuzz: false,
  autoRevealClue: false,
  autoRevealMedia: false,
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
    const { autoBuzzQueueOnMedia: _omit, ...legacy } = categorySettingsFromGlobal(globalOff)
    expect(
      getCategoryGameplaySettings(
        category({ syncSettingsWithGlobal: false, settings: legacy as CategorySettings }),
        globalOn,
      ).autoBuzzQueueOnMedia,
    ).toBe(true)
  })
})
