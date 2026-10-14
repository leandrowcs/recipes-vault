import { describe, expect, it } from 'vitest'
import { assessNutrition, classifyFrontOfPack, isValidEanUpc, normalizeBarcode } from './foodRatings'

describe('front-of-pack food ratings', () => {
  it('uses UK traffic-light thresholds for solid packaged foods', () => {
    expect(classifyFrontOfPack(3, 3, 17.5)).toBe('low')
    expect(classifyFrontOfPack(3.1, 3, 17.5)).toBe('medium')
    expect(classifyFrontOfPack(17.5, 3, 17.5)).toBe('medium')
    expect(classifyFrontOfPack(17.6, 3, 17.5)).toBe('high')
    expect(classifyFrontOfPack(null, 3, 17.5)).toBe('not-rated')
  })

  it('derives salt from sodium when salt is missing and never classifies calories as high/low', () => {
    const nutrition = assessNutrition({
      energyKcal: 300,
      proteinG: 10,
      fiberG: 6,
      fatG: 3,
      saturatedFatG: null,
      sugarsG: 0,
      sodiumMg: 600,
      saltG: null,
    })
    expect(nutrition.ratings.find(({ key }) => key === 'salt')?.value).toBe(1.5)
    expect(nutrition.ratings.find(({ key }) => key === 'saturatedFat')?.level).toBe('not-rated')
    expect(nutrition.positives).toMatchObject([{ claim: 'source' }, { claim: 'high' }])
  })

  it('normalizes and validates UPC/EAN check digits before lookup', () => {
    expect(normalizeBarcode(' 3017 6204-2200 3 ')).toBe('3017620422003')
    expect(isValidEanUpc('3017620422003')).toBe(true)
    expect(isValidEanUpc('3017620422004')).toBe(false)
    expect(isValidEanUpc('1234567890123')).toBe(false)
  })
})
