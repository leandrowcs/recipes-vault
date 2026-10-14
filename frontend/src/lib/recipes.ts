import type { Recipe, RecipeDraft, RecipeFilters, RecipeIngredient } from '../types/recipe'

const unicodeFractions: Record<string, number> = {
  '¼': 0.25,
  '½': 0.5,
  '¾': 0.75,
  '⅓': 1 / 3,
  '⅔': 2 / 3,
  '⅛': 0.125,
  '⅜': 0.375,
  '⅝': 0.625,
  '⅞': 0.875,
}

export function parseIngredientQuantity(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null

  const mixedFraction = trimmed.match(/^(\d+)\s+(\d+)\/(\d+)$/)
  if (mixedFraction) {
    const whole = Number(mixedFraction[1])
    const numerator = Number(mixedFraction[2])
    const denominator = Number(mixedFraction[3])
    if (denominator === 0 || numerator >= denominator) return null
    return whole + numerator / denominator
  }

  const fraction = trimmed.match(/^(\d+)\/(\d+)$/)
  if (fraction) {
    const numerator = Number(fraction[1])
    const denominator = Number(fraction[2])
    return denominator === 0 ? null : numerator / denominator
  }

  const unicodeFraction = trimmed.match(/^(\d+)?\s*([¼½¾⅓⅔⅛⅜⅝⅞])$/)
  if (unicodeFraction) {
    return Number(unicodeFraction[1] || 0) + unicodeFractions[unicodeFraction[2]]
  }

  const decimal = Number(trimmed.replace(',', '.'))
  return Number.isFinite(decimal) && decimal >= 0 ? decimal : null
}

export function formatScaledQuantity(
  ingredient: RecipeIngredient,
  servings: number,
  originalServings: number,
): string {
  if (ingredient.quantity === null) return ingredient.quantityText
  const scaled = ingredient.quantity * (servings / originalServings)
  return new Intl.NumberFormat('en-CA', { maximumFractionDigits: 3 }).format(scaled)
}

export function filterRecipes(recipes: Recipe[], filters: RecipeFilters): Recipe[] {
  const query = filters.query.trim().toLocaleLowerCase()

  return recipes.filter((recipe) => {
    const matchesQuery =
      !query ||
      [
        recipe.title,
        recipe.description,
        recipe.category,
        ...recipe.tags,
        ...recipe.ingredients.map((ingredient) => ingredient.name),
      ].some((value) => value.toLocaleLowerCase().includes(query))
    const matchesCategory = !filters.category || recipe.category === filters.category
    const totalMinutes = recipe.prepTimeMinutes + recipe.cookTimeMinutes
    const matchesTime =
      filters.maxTotalMinutes === undefined || totalMinutes <= filters.maxTotalMinutes

    return matchesQuery && matchesCategory && matchesTime
  })
}

export function isRecipe(value: unknown): value is Recipe {
  if (!value || typeof value !== 'object') return false
  const recipe = value as Partial<Recipe>

  return (
    typeof recipe.id === 'string' &&
    recipe.id.trim().length > 0 &&
    typeof recipe.title === 'string' &&
    recipe.title.trim().length > 0 &&
    typeof recipe.description === 'string' &&
    typeof recipe.imageUrl === 'string' &&
    isHttpUrlOrEmpty(recipe.imageUrl) &&
    typeof recipe.sourceUrl === 'string' &&
    isHttpUrlOrEmpty(recipe.sourceUrl) &&
    Number.isInteger(recipe.servings) &&
    Number(recipe.servings) > 0 &&
    Number.isInteger(recipe.prepTimeMinutes) &&
    Number(recipe.prepTimeMinutes) >= 0 &&
    Number.isInteger(recipe.cookTimeMinutes) &&
    Number(recipe.cookTimeMinutes) >= 0 &&
    ['Easy', 'Medium', 'Hard'].includes(String(recipe.difficulty)) &&
    typeof recipe.category === 'string' &&
    recipe.category.trim().length > 0 &&
    Array.isArray(recipe.tags) &&
    recipe.tags.every((tag) => typeof tag === 'string') &&
    Array.isArray(recipe.ingredients) &&
    recipe.ingredients.length > 0 &&
    recipe.ingredients.every(isIngredient) &&
    new Set(recipe.ingredients.map((ingredient) => ingredient.id)).size === recipe.ingredients.length &&
    Array.isArray(recipe.instructions) &&
    recipe.instructions.length > 0 &&
    recipe.instructions.every(
      (instruction) =>
        Boolean(instruction) &&
        typeof instruction === 'object' &&
        typeof instruction.id === 'string' &&
        instruction.id.trim().length > 0 &&
        typeof instruction.text === 'string' &&
        instruction.text.trim().length > 0,
    ) &&
    new Set(recipe.instructions.map((instruction) => instruction.id)).size === recipe.instructions.length &&
    typeof recipe.isFavorite === 'boolean' &&
    typeof recipe.createdAt === 'string' &&
    Number.isFinite(Date.parse(recipe.createdAt)) &&
    typeof recipe.updatedAt === 'string' &&
    Number.isFinite(Date.parse(recipe.updatedAt))
  )
}

export function isRecipeDraft(value: unknown): value is RecipeDraft {
  if (!value || typeof value !== 'object') return false
  const draft = value as Partial<RecipeDraft>
  return isRecipe({
    ...draft,
    id: 'import-preview',
    isFavorite: false,
    createdAt: '2000-01-01T00:00:00.000Z',
    updatedAt: '2000-01-01T00:00:00.000Z',
  })
}

function isIngredient(value: unknown): value is RecipeIngredient {
  if (!value || typeof value !== 'object') return false
  const ingredient = value as Partial<RecipeIngredient>

  return (
    typeof ingredient.id === 'string' &&
    ingredient.id.trim().length > 0 &&
    typeof ingredient.name === 'string' &&
    ingredient.name.trim().length > 0 &&
    typeof ingredient.quantityText === 'string' &&
    (ingredient.quantity === null ||
      (typeof ingredient.quantity === 'number' &&
        Number.isFinite(ingredient.quantity) &&
        ingredient.quantity >= 0)) &&
    typeof ingredient.unit === 'string' &&
    typeof ingredient.optional === 'boolean'
  )
}

function isHttpUrlOrEmpty(value: string): boolean {
  if (!value) return true
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol)
  } catch {
    return false
  }
}
