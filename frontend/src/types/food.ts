import type { NutrientValues } from '../services/foodRatings'

export interface MealCard {
  id: string
  name: string
  imageUrl: string
  sourceUrl: string
}

export interface MealDetails extends MealCard {
  category: string
  area: string
  instructions: string
  ingredients: Array<{ name: string; measure: string }>
}

export interface FoodProduct {
  barcode: string
  name: string
  brand: string
  quantity: string
  imageUrl: string
  productUrl: string
  nutriScore: string | null
  novaGroup: number | null
  ingredients: string
  additives: string[]
  productType: 'food' | 'beverage' | 'unknown'
  nutritionBasis: '100g' | '100ml' | 'unavailable'
  nutrients: NutrientValues
}
