import { describe, expect, it } from 'vitest'
import { createRecipeBackup, loadRecipes, parseRecipeBackup, saveRecipes } from './recipeStorage'
import type { Recipe } from '../types/recipe'

class MemoryStorage implements Storage {
  private values = new Map<string, string>()

  get length() { return this.values.size }
  clear() { this.values.clear() }
  getItem(key: string) { return this.values.get(key) ?? null }
  key(index: number) { return [...this.values.keys()][index] ?? null }
  removeItem(key: string) { this.values.delete(key) }
  setItem(key: string, value: string) { this.values.set(key, value) }
}

const recipe: Recipe = {
  id: 'recipe-1',
  title: 'Roasted tomato soup',
  description: '',
  imageUrl: '',
  sourceUrl: '',
  servings: 4,
  prepTimeMinutes: 10,
  cookTimeMinutes: 30,
  difficulty: 'Easy',
  category: 'Lunch',
  tags: [],
  ingredients: [{
    id: 'tomatoes',
    name: 'Tomatoes',
    quantityText: '6',
    quantity: 6,
    unit: '',
    optional: false,
  }],
  instructions: [{ id: 'step-1', text: 'Roast the tomatoes.' }],
  isFavorite: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

describe('recipeStorage', () => {
  it('round-trips the versioned recipe collection', () => {
    const storage = new MemoryStorage()
    saveRecipes([recipe], storage)
    expect(loadRecipes(storage)).toEqual([recipe])
  })

  it('surfaces malformed or incompatible saved data without replacing it', () => {
    const storage = new MemoryStorage()
    storage.setItem('recipes-vault.data', '{')
    expect(() => loadRecipes(storage)).toThrow('could not be read')
    expect(storage.getItem('recipes-vault.data')).toBe('{')

    storage.setItem('recipes-vault.data', JSON.stringify({ version: 2, recipes: [] }))
    expect(() => loadRecipes(storage)).toThrow('unsupported version')
  })

  it('rejects records with invalid fields and duplicate IDs', () => {
    const storage = new MemoryStorage()
    storage.setItem('recipes-vault.data', JSON.stringify({ version: 1, recipes: [{ ...recipe, servings: 0 }] }))
    expect(() => loadRecipes(storage)).toThrow('invalid or from an unsupported version')

    storage.setItem('recipes-vault.data', JSON.stringify({ version: 1, recipes: [recipe, recipe] }))
    expect(() => loadRecipes(storage)).toThrow('duplicate IDs')
  })

  it('exports and restores versioned backups without silently changing invalid data', () => {
    const backup = createRecipeBackup([recipe], '2026-01-01T00:00:00.000Z')
    expect(parseRecipeBackup(JSON.stringify(backup))).toEqual([recipe])
    expect(() => parseRecipeBackup(JSON.stringify({ ...backup, version: 2 }))).toThrow('unsupported format')
    expect(() => parseRecipeBackup(JSON.stringify({ ...backup, recipes: [recipe, recipe] }))).toThrow('duplicate recipes')
    expect(() => parseRecipeBackup('not json')).toThrow('valid JSON')
  })

  it('rejects unsafe external link protocols before a recipe is saved', () => {
    const storage = new MemoryStorage()
    expect(() => saveRecipes([{ ...recipe, sourceUrl: 'javascript:alert(1)' }], storage))
      .toThrow('invalid recipe data')
    expect(storage.getItem('recipes-vault.data')).toBeNull()
  })
})
