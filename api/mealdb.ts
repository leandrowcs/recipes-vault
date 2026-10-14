import type { IncomingMessage, ServerResponse } from 'node:http'

const MAX_SEARCH_RESULTS = 30
const REQUEST_TIMEOUT_MS = 8_000

function getMealDbApiUrl(path: string): URL {
  const apiKey = process.env.MEALDB_API_KEY?.trim() || (process.env.VERCEL ? '' : '1')
  if (!apiKey) throw new Error('A production TheMealDB API key is required.')
  return new URL(path, `https://www.themealdb.com/api/json/v1/${encodeURIComponent(apiKey)}/`)
}

interface MealCard {
  id: string
  name: string
  imageUrl: string
  sourceUrl: string
}

interface MealDetails extends MealCard {
  category: string
  area: string
  instructions: string
  ingredients: Array<{ name: string; measure: string }>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function text(value: unknown, maximumLength = 500): string {
  return typeof value === 'string' ? value.trim().slice(0, maximumLength) : ''
}

function mealSource(id: string, value: unknown): string {
  const source = text(value, 2_048)
  try {
    const url = new URL(source)
    if (url.protocol === 'https:' || url.protocol === 'http:') return url.href
  } catch {
    return `https://www.themealdb.com/meal/${encodeURIComponent(id)}`
  }
  return `https://www.themealdb.com/meal/${encodeURIComponent(id)}`
}

function parseMealCard(value: unknown): MealCard | null {
  if (!isRecord(value)) return null
  const id = text(value.idMeal, 20)
  const name = text(value.strMeal, 180)
  const imageUrl = text(value.strMealThumb, 2_048)
  if (!/^\d{1,20}$/.test(id) || !name) return null

  return { id, name, imageUrl, sourceUrl: mealSource(id, value.strSource) }
}

function parseMealDetails(value: unknown): MealDetails | null {
  const card = parseMealCard(value)
  if (!card || !isRecord(value)) return null
  const ingredients: MealDetails['ingredients'] = []

  for (let index = 1; index <= 20; index += 1) {
    const name = text(value[`strIngredient${index}`], 120)
    if (name) ingredients.push({ name, measure: text(value[`strMeasure${index}`], 80) })
  }

  return {
    ...card,
    category: text(value.strCategory, 80),
    area: text(value.strArea, 80),
    instructions: text(value.strInstructions, 10_000),
    ingredients,
  }
}

async function fetchMeals(path: string): Promise<unknown> {
  const response = await fetch(getMealDbApiUrl(path), {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`Meal database responded with HTTP ${response.status}.`)
  return response.json()
}

export default async function handler(request: IncomingMessage, response: ServerResponse): Promise<void> {
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'public, max-age=0, s-maxage=900, stale-while-revalidate=3600')
  response.setHeader('X-Content-Type-Options', 'nosniff')

  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET')
    response.statusCode = 405
    response.end(JSON.stringify({ error: 'Use GET to search the recipe catalog.' }))
    return
  }

  const url = new URL(request.url ?? '/', 'https://recipes-vault.invalid')
  const id = url.searchParams.get('id')?.trim() ?? ''
  const ingredient = url.searchParams.get('ingredient')?.trim() ?? ''

  if (id) {
    if (!/^\d{1,20}$/.test(id)) {
      response.statusCode = 400
      response.end(JSON.stringify({ error: 'Enter a valid recipe ID.' }))
      return
    }

    if (!process.env.MEALDB_API_KEY?.trim() && process.env.VERCEL) {
      response.statusCode = 503
      response.end(JSON.stringify({ error: 'Recipe discovery requires a production TheMealDB API key. See the deployment setup guide.' }))
      return
    }

    try {
      const result: unknown = await fetchMeals(`lookup.php?i=${encodeURIComponent(id)}`)
      const meals = isRecord(result) && Array.isArray(result.meals) ? result.meals : []
      const meal = parseMealDetails(meals[0])
      if (!meal) {
        response.statusCode = 404
        response.end(JSON.stringify({ error: 'That recipe is not available in the catalog.' }))
        return
      }
      response.statusCode = 200
      response.end(JSON.stringify({ meal }))
    } catch {
      response.statusCode = 502
      response.end(JSON.stringify({ error: 'The recipe catalog is temporarily unavailable. Try again later.' }))
    }
    return
  }

  if (ingredient.length < 2 || ingredient.length > 60 || !/^[\p{L}\p{M}\s'-]+$/u.test(ingredient)) {
    response.statusCode = 400
    response.end(JSON.stringify({ error: 'Enter one ingredient using 2–60 letters.' }))
    return
  }

  if (!process.env.MEALDB_API_KEY?.trim() && process.env.VERCEL) {
    response.statusCode = 503
    response.end(JSON.stringify({ error: 'Recipe discovery requires a production TheMealDB API key. See the deployment setup guide.' }))
    return
  }

  try {
    const normalizedIngredient = ingredient.replace(/\s+/g, '_')
    const result: unknown = await fetchMeals(`filter.php?i=${encodeURIComponent(normalizedIngredient)}`)
    const meals = isRecord(result) && Array.isArray(result.meals) ? result.meals : []
    const recipes = meals
      .map(parseMealCard)
      .filter((meal): meal is MealCard => meal !== null)
      .slice(0, MAX_SEARCH_RESULTS)
    response.statusCode = 200
    response.end(JSON.stringify({ recipes }))
  } catch {
    response.statusCode = 502
    response.end(JSON.stringify({ error: 'The recipe catalog is temporarily unavailable. Try again later.' }))
  }
}
