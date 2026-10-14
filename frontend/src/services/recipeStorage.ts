import { isRecipe } from '../lib/recipes'
import type { Recipe, RecipeBackup } from '../types/recipe'

const STORAGE_KEY = 'recipes-vault.data'
const SCHEMA_VERSION = 1

interface StoredRecipes {
  version: number
  recipes: unknown[]
}

export function loadRecipes(storage: Storage = window.localStorage): Recipe[] {
  const saved = storage.getItem(STORAGE_KEY)
  if (saved === null) return []

  let parsed: unknown
  try {
    parsed = JSON.parse(saved)
  } catch {
    throw new Error('Saved recipe data could not be read. No data was changed.')
  }

  if (!isStoredRecipes(parsed)) {
    throw new Error('Saved recipe data has an unsupported format. No data was changed.')
  }

  if (parsed.version !== SCHEMA_VERSION || !parsed.recipes.every(isRecipe)) {
    throw new Error('Saved recipe data is invalid or from an unsupported version. No data was changed.')
  }

  const ids = new Set(parsed.recipes.map((recipe) => (recipe as Recipe).id))
  if (ids.size !== parsed.recipes.length) {
    throw new Error('Saved recipe data contains duplicate IDs. No data was changed.')
  }

  return parsed.recipes as Recipe[]
}

export function saveRecipes(recipes: Recipe[], storage: Storage = window.localStorage): void {
  if (!recipes.every(isRecipe)) {
    throw new Error('Cannot save invalid recipe data.')
  }
  const ids = new Set(recipes.map((recipe) => recipe.id))
  if (ids.size !== recipes.length) {
    throw new Error('Cannot save recipes with duplicate IDs.')
  }

  storage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      version: SCHEMA_VERSION,
      recipes,
    }),
  )
}

export function createRecipeBackup(recipes: Recipe[], exportedAt = new Date().toISOString()): RecipeBackup {
  return { version: SCHEMA_VERSION, recipes, exportedAt }
}

export function parseRecipeBackup(json: string): Recipe[] {
  if (new TextEncoder().encode(json).byteLength > 5_000_000) {
    throw new Error('The backup is too large to restore. Choose a file smaller than 5 MB.')
  }

  let backup: unknown
  try {
    backup = JSON.parse(json)
  } catch {
    throw new Error('This file is not valid JSON. Your saved recipes were not changed.')
  }

  if (
    !backup ||
    typeof backup !== 'object' ||
    !('version' in backup) ||
    backup.version !== SCHEMA_VERSION ||
    !('exportedAt' in backup) ||
    typeof backup.exportedAt !== 'string' ||
    !Number.isFinite(Date.parse(backup.exportedAt)) ||
    !('recipes' in backup) ||
    !Array.isArray(backup.recipes) ||
    !backup.recipes.every(isRecipe)
  ) {
    throw new Error('This backup has an unsupported format or invalid recipe data. Your saved recipes were not changed.')
  }

  const recipes = backup.recipes
  const ids = new Set(recipes.map((recipe) => recipe.id))
  if (ids.size !== recipes.length) {
    throw new Error('This backup contains duplicate recipes. Your saved recipes were not changed.')
  }

  return recipes
}

function isStoredRecipes(value: unknown): value is StoredRecipes {
  return (
    value !== null &&
    typeof value === 'object' &&
    'version' in value &&
    typeof value.version === 'number' &&
    'recipes' in value &&
    Array.isArray(value.recipes)
  )
}
