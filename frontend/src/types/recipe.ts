export type RecipeDifficulty = 'Easy' | 'Medium' | 'Hard'

export interface RecipeIngredient {
  id: string
  name: string
  quantityText: string
  quantity: number | null
  unit: string
  optional: boolean
}

export interface RecipeInstruction {
  id: string
  text: string
}

export interface Recipe {
  id: string
  title: string
  description: string
  imageUrl: string
  sourceUrl: string
  servings: number
  prepTimeMinutes: number
  cookTimeMinutes: number
  difficulty: RecipeDifficulty
  category: string
  tags: string[]
  ingredients: RecipeIngredient[]
  instructions: RecipeInstruction[]
  isFavorite: boolean
  createdAt: string
  updatedAt: string
}

export type RecipeDraft = Omit<Recipe, 'id' | 'isFavorite' | 'createdAt' | 'updatedAt'>

export interface RecipeFilters {
  query: string
  category: string
  maxTotalMinutes?: number
}

export interface RecipeBackup {
  version: 1
  recipes: Recipe[]
  exportedAt: string
}
