import type { IncomingMessage, ServerResponse } from 'node:http'

const API_BASE_URL = 'https://api-receitas-pi.vercel.app'
const REQUEST_TIMEOUT_MS = 8_000
const MAX_SEARCH_RESULTS = 30
const CACHE_TTL_MS = 15 * 60 * 1_000

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

interface CatalogEntry {
  details: MealDetails
  searchText: string
}

let cache: { expiresAt: number; entries: CatalogEntry[] } | null = null

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function text(value: unknown, maximumLength = 500): string {
  return typeof value === 'string' ? value.trim().slice(0, maximumLength) : ''
}

function normalize(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('pt-BR')
}

function httpsUrl(value: unknown): string {
  try {
    const url = new URL(text(value, 2_048))
    return url.protocol === 'https:' ? url.href : ''
  } catch {
    return ''
  }
}

function parseEntry(value: unknown): CatalogEntry | null {
  if (!isRecord(value)) return null
  const id = typeof value.id === 'number' && Number.isInteger(value.id) && value.id > 0 ? String(value.id) : ''
  const name = text(value.receita, 180)
  if (!id || !name) return null

  const baseNames = isRecord(value.IngredientesBase) || !Array.isArray(value.IngredientesBase)
    ? []
    : value.IngredientesBase.flatMap((base) =>
        isRecord(base) && Array.isArray(base.nomesIngrediente)
          ? base.nomesIngrediente.map((item) => text(item, 120)).filter(Boolean)
          : [])
  const lines = text(value.ingredientes, 4_000).split(/,\s*/).map((line) => line.trim()).filter(Boolean)
  const aligned = baseNames.length > 0 && baseNames.length === lines.length
  const ingredients = aligned
    ? baseNames.map((ingredient, index) => ({ name: ingredient, measure: lines[index].slice(0, 120) }))
    : lines.map((line) => ({ name: line.slice(0, 120), measure: '' }))

  const details: MealDetails = {
    id,
    name,
    imageUrl: httpsUrl(value.link_imagem),
    sourceUrl: `${API_BASE_URL}/receitas/${encodeURIComponent(id)}`,
    category: text(value.tipo, 80),
    area: '',
    instructions: text(value.modo_preparo, 10_000),
    ingredients,
  }

  return { details, searchText: normalize(`${lines.join(' ')} ${baseNames.join(' ')}`) }
}

async function loadCatalog(): Promise<CatalogEntry[]> {
  if (cache && cache.expiresAt > Date.now()) return cache.entries

  const response = await fetch(`${API_BASE_URL}/receitas/todas?page=1&limit=100`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`Recipe catalog responded with HTTP ${response.status}.`)
  const result: unknown = await response.json()
  const items = isRecord(result) && Array.isArray(result.items) ? result.items : []
  const entries = items.map(parseEntry).filter((entry): entry is CatalogEntry => entry !== null)
  cache = { expiresAt: Date.now() + CACHE_TTL_MS, entries }
  return entries
}

function send(response: ServerResponse, status: number, body: unknown): void {
  response.statusCode = status
  response.end(JSON.stringify(body))
}

export default async function handler(request: IncomingMessage, response: ServerResponse): Promise<void> {
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'public, max-age=0, s-maxage=900, stale-while-revalidate=3600')
  response.setHeader('X-Content-Type-Options', 'nosniff')

  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET')
    send(response, 405, { error: 'Use GET to search the recipe catalog.' })
    return
  }

  const url = new URL(request.url ?? '/', 'https://recipes-vault.invalid')
  const id = url.searchParams.get('id')?.trim() ?? ''
  const ingredient = url.searchParams.get('ingredient')?.trim() ?? ''

  if (id) {
    if (!/^\d{1,10}$/.test(id)) {
      send(response, 400, { error: 'Enter a valid recipe ID.' })
      return
    }
    try {
      const entry = (await loadCatalog()).find((item) => item.details.id === id)
      if (!entry) {
        send(response, 404, { error: 'That recipe is not available in the catalog.' })
        return
      }
      send(response, 200, { meal: entry.details })
    } catch {
      send(response, 502, { error: 'The recipe catalog is temporarily unavailable. Try again later.' })
    }
    return
  }

  if (ingredient.length < 2 || ingredient.length > 60 || !/^[\p{L}\p{M}\s'-]+$/u.test(ingredient)) {
    send(response, 400, { error: 'Enter one ingredient using 2–60 letters.' })
    return
  }

  try {
    const needle = normalize(ingredient)
    const recipes = (await loadCatalog())
      .filter((entry) => entry.searchText.includes(needle) || normalize(entry.details.name).includes(needle))
      .slice(0, MAX_SEARCH_RESULTS)
      .map(({ details }): MealCard => ({
        id: details.id,
        name: details.name,
        imageUrl: details.imageUrl,
        sourceUrl: details.sourceUrl,
      }))
    send(response, 200, { recipes })
  } catch {
    send(response, 502, { error: 'The recipe catalog is temporarily unavailable. Try again later.' })
  }
}
