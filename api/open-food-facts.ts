import type { IncomingMessage, ServerResponse } from 'node:http'

const PRODUCT_FIELDS = [
  'product_name',
  'product_name_en',
  'brands',
  'quantity',
  'image_front_url',
  'image_url',
  'nutriscore_grade',
  'nova_group',
  'ingredients_text',
  'additives_tags',
  'categories_tags',
  'nutriments',
].join(',')
const REQUEST_TIMEOUT_MS = 8_000

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function readText(value: unknown, maximumLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maximumLength) : ''
}

function readNumber(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

function readHttpsUrl(value: unknown): string {
  const text = readText(value, 2_048)
  try {
    const url = new URL(text)
    return url.protocol === 'https:' ? url.href : ''
  } catch {
    return ''
  }
}

function readAdditives(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.replace(/^en:/, '').replaceAll('-', ' ').trim().slice(0, 100))
    .filter(Boolean)
    .slice(0, 100)
}

function parseProduct(rawProduct: unknown, barcode: string): Record<string, unknown> | null {
  if (!isRecord(rawProduct)) return null
  const rawNutrients = isRecord(rawProduct.nutriments) ? rawProduct.nutriments : {}
  const grade = readText(rawProduct.nutriscore_grade, 1).toLowerCase()
  const nova = readNumber(rawProduct.nova_group)
  const brand = readText(rawProduct.brands, 200)
  const name = readText(rawProduct.product_name, 200) || readText(rawProduct.product_name_en, 200)
  const categoryTags = Array.isArray(rawProduct.categories_tags)
    ? rawProduct.categories_tags.filter((tag): tag is string => typeof tag === 'string')
    : []
  const productType = categoryTags.some((tag) => /^en:(?:beverages|drinks|non-alcoholic-beverages|waters|fruit-juices|carbonated-drinks)(?:-|$)/.test(tag))
    ? 'beverage'
    : categoryTags.length > 0 ? 'food' : 'unknown'
  const hasNutrients = (basis: '100g' | '100ml') =>
    Object.keys(rawNutrients).some((key) => key.endsWith(`_${basis}`) && readNumber(rawNutrients[key]) !== null)
  const nutritionBasis = productType === 'beverage'
    ? hasNutrients('100ml') ? '100ml' : 'unavailable'
    : productType === 'food'
      ? hasNutrients('100g') ? '100g' : 'unavailable'
      : hasNutrients('100g') ? '100g' : hasNutrients('100ml') ? '100ml' : 'unavailable'
  const nutrient = (key: string) => nutritionBasis === 'unavailable'
    ? null
    : readNumber(rawNutrients[`${key}_${nutritionBasis}`])

  return {
    barcode,
    name,
    brand,
    quantity: readText(rawProduct.quantity, 100),
    imageUrl: readHttpsUrl(rawProduct.image_front_url) || readHttpsUrl(rawProduct.image_url),
    productUrl: `https://world.openfoodfacts.org/product/${encodeURIComponent(barcode)}`,
    nutriScore: /^[a-e]$/.test(grade) ? grade : null,
    novaGroup: nova !== null && Number.isInteger(nova) && nova >= 1 && nova <= 4 ? nova : null,
    ingredients: readText(rawProduct.ingredients_text, 8_000),
    additives: readAdditives(rawProduct.additives_tags),
    productType,
    nutritionBasis,
    nutrients: {
      energyKcal: nutrient('energy-kcal'),
      proteinG: nutrient('proteins'),
      fiberG: nutrient('fiber'),
      fatG: nutrient('fat'),
      saturatedFatG: nutrient('saturated-fat'),
      sugarsG: nutrient('sugars'),
      sodiumMg: (() => {
        const sodiumG = nutrient('sodium')
        return sodiumG === null ? null : sodiumG * 1_000
      })(),
      saltG: nutrient('salt'),
    },
  }
}

export default async function handler(request: IncomingMessage, response: ServerResponse): Promise<void> {
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'public, max-age=0, s-maxage=900, stale-while-revalidate=3600')
  response.setHeader('X-Content-Type-Options', 'nosniff')

  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET')
    response.statusCode = 405
    response.end(JSON.stringify({ error: 'Use GET to look up a product.' }))
    return
  }

  const url = new URL(request.url ?? '/', 'https://recipes-vault.invalid')
  const barcode = url.searchParams.get('barcode')?.trim() ?? ''
  if (!/^(?:\d{8}|\d{12}|\d{13}|\d{14})$/.test(barcode)) {
    response.statusCode = 400
    response.end(JSON.stringify({ error: 'Enter an 8, 12, 13, or 14 digit barcode.' }))
    return
  }

  const productUrl = new URL(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`)
  productUrl.searchParams.set('fields', PRODUCT_FIELDS)

  try {
    const upstream = await fetch(productUrl, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'RecipesVault/1.0 (leandrowcs@hotmail.com)',
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (upstream.status === 429) {
      response.statusCode = 429
      response.end(JSON.stringify({ error: 'Open Food Facts is rate-limiting requests. Try again in a minute.' }))
      return
    }
    if (!upstream.ok) throw new Error(`Open Food Facts responded with HTTP ${upstream.status}.`)

    const result: unknown = await upstream.json()
    const product = isRecord(result) && result.status === 1 ? parseProduct(result.product, barcode) : null
    if (!product) {
      response.statusCode = 200
      response.end(JSON.stringify({ found: false }))
      return
    }
    response.statusCode = 200
    response.end(JSON.stringify({ found: true, product }))
  } catch {
    response.statusCode = 502
    response.end(JSON.stringify({ error: 'Open Food Facts is temporarily unavailable. Try again later.' }))
  }
}
