import type { IncomingMessage, ServerResponse } from 'node:http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import mealDb from '../../api/mealdb'
import openFoodFacts from '../../api/open-food-facts'

interface MockResponse {
  statusCode: number
  headers: Map<string, string>
  body: string
  setHeader: (name: string, value: string) => void
  end: (body?: string) => void
}

async function invoke(
  handler: (request: IncomingMessage, response: ServerResponse) => Promise<void>,
  method: string,
  url: string,
) {
  const request = { method, url } as unknown as IncomingMessage
  const response: MockResponse = {
    statusCode: 200,
    headers: new Map(),
    body: '',
    setHeader(name, value) {
      this.headers.set(name, value)
    },
    end(body = '') {
      this.body = body
    },
  }
  await handler(request, response as unknown as ServerResponse)
  return { status: response.statusCode, headers: response.headers, body: JSON.parse(response.body) as unknown }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('Open Food Facts API handler', () => {
  it('rejects invalid barcodes without calling the upstream API', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const result = await invoke(openFoodFacts, 'GET', '/?barcode=1234')

    expect(result.status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns an explicit not-found result', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ status: 0 }) }))
    const result = await invoke(openFoodFacts, 'GET', '/?barcode=3017620422003')

    expect(result).toMatchObject({ status: 200, body: { found: false } })
  })

  it('returns missing nutrients as null and does not guess a category or basis', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 1, product: { product_name: 'Example' } }),
    }))
    const result = await invoke(openFoodFacts, 'GET', '/?barcode=3017620422003')

    expect(result.body).toMatchObject({
      found: true,
      product: {
        productType: 'unknown',
        nutritionBasis: 'unavailable',
        nutrients: { energyKcal: null, proteinG: null, saltG: null },
      },
    })
  })

  it('uses matching 100ml nutrient data for a categorized beverage', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: 1,
        product: {
          product_name: 'Drink',
          categories_tags: ['en:beverages'],
          nutriments: { 'energy-kcal_100ml': 42, sugars_100ml: 10, sodium_100ml: 0.2 },
        },
      }),
    }))
    const result = await invoke(openFoodFacts, 'GET', '/?barcode=3017620422003')

    expect(result.body).toMatchObject({
      found: true,
      product: {
        productType: 'beverage',
        nutritionBasis: '100ml',
        nutrients: { energyKcal: 42, sugarsG: 10, sodiumMg: 200 },
      },
    })
  })

  it('surfaces upstream rate limits and gateway failures', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 429 })
      .mockResolvedValueOnce({ ok: false, status: 503 })
    vi.stubGlobal('fetch', fetchMock)

    expect((await invoke(openFoodFacts, 'GET', '/?barcode=3017620422003')).status).toBe(429)
    expect((await invoke(openFoodFacts, 'GET', '/?barcode=3017620422003')).status).toBe(502)
  })
})

describe('TheMealDB API handler', () => {
  it('requires a production key in Vercel and rejects invalid methods', async () => {
    vi.stubEnv('VERCEL', '1')
    vi.stubEnv('MEALDB_API_KEY', '')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    expect((await invoke(mealDb, 'GET', '/?ingredient=tomato')).status).toBe(503)
    expect((await invoke(mealDb, 'POST', '/?ingredient=tomato')).status).toBe(405)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('normalizes recipe cards from the catalog', async () => {
    vi.stubEnv('VERCEL', '')
    vi.stubEnv('MEALDB_API_KEY', '')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        meals: [{ idMeal: '123', strMeal: 'Sample Meal', strMealThumb: 'https://example.com/meal.jpg' }],
      }),
    }))
    const result = await invoke(mealDb, 'GET', '/?ingredient=tomato')

    expect(result).toMatchObject({
      status: 200,
      body: { recipes: [{ id: '123', name: 'Sample Meal', sourceUrl: 'https://www.themealdb.com/meal/123' }] },
    })
  })
})
