import { describe, expect, it } from 'vitest'
import { filterRecipes, formatScaledQuantity, parseIngredientQuantity } from './recipes'
import type { Recipe, RecipeIngredient } from '../types/recipe'

const ingredient: RecipeIngredient = {
  id: 'flour',
  name: 'Flour',
  quantityText: '1 1/2',
  quantity: 1.5,
  unit: 'cups',
  optional: false,
}

const recipes: Recipe[] = [
  {
    id: 'pasta',
    title: 'Garden pasta',
    description: 'A quick weeknight meal',
    imageUrl: '',
    sourceUrl: '',
    servings: 2,
    prepTimeMinutes: 10,
    cookTimeMinutes: 15,
    difficulty: 'Easy',
    category: 'Dinner',
    tags: ['vegetarian'],
    ingredients: [{ ...ingredient, name: 'zucchini' }],
    instructions: [{ id: 'step-1', text: 'Cook the pasta.' }],
    isFavorite: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
]

describe('parseIngredientQuantity', () => {
  it.each([
    ['1.5', 1.5],
    ['1,5', 1.5],
    ['1/2', 0.5],
    ['1 1/2', 1.5],
    ['1½', 1.5],
    ['to taste', null],
    ['1/0', null],
  ])('parses %s', (value, expected) => {
    expect(parseIngredientQuantity(value)).toBe(expected)
  })
})

describe('formatScaledQuantity', () => {
  it('scales supported quantities without changing the source ingredient', () => {
    expect(formatScaledQuantity(ingredient, 4, 2)).toBe('3')
    expect(ingredient.quantityText).toBe('1 1/2')
  })

  it('preserves free-text amounts', () => {
    expect(formatScaledQuantity({ ...ingredient, quantity: null, quantityText: 'to taste' }, 4, 2))
      .toBe('to taste')
  })
})

describe('filterRecipes', () => {
  it('searches recipe names, categories, tags, and ingredients and applies filters', () => {
    expect(filterRecipes(recipes, { query: 'zuc', category: 'Dinner' })).toHaveLength(1)
    expect(filterRecipes(recipes, { query: '', category: 'Breakfast' })).toHaveLength(0)
    expect(filterRecipes(recipes, { query: '', category: '', maxTotalMinutes: 20 })).toHaveLength(0)
  })
})
