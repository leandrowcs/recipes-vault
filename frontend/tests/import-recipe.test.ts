import { Readable } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { describe, expect, it, vi } from 'vitest'
import recipeImportHandler, { fetchRecipeHtml, isPublicIpv4, normalizeRecipeHtml, type RecipeImportDependencies } from '../../api/import-recipe.ts'

const recipePage = (recipe: object) => `
  <!doctype html>
  <script type="application/ld+json">
    ${JSON.stringify({ '@context': 'https://schema.org', '@graph': [{ '@type': 'WebPage', mainEntity: recipe }] })}
  </script>
  <p>This article must not be imported.</p>
`

const publicDependencies = (
  request: RecipeImportDependencies['request'] = vi.fn(async () => ({
    statusCode: 200,
    contentType: 'text/html; charset=utf-8',
    body: Buffer.from('<html></html>'),
  })),
): RecipeImportDependencies => ({
  resolve: vi.fn(async () => ['93.184.216.34']),
  request,
})

function createRequest(body: string, method = 'POST', contentType = 'application/json'): IncomingMessage {
  const request = Readable.from([body]) as unknown as IncomingMessage
  Object.defineProperties(request, {
    method: { value: method },
    headers: { value: { 'content-type': contentType } },
  })
  return request
}

function createResponse() {
  return {
    statusCode: 200,
    setHeader: vi.fn(),
    end: vi.fn(),
  } as unknown as ServerResponse & { end: ReturnType<typeof vi.fn> }
}

describe('isPublicIpv4', () => {
  it.each([
    ['93.184.216.34', true],
    ['10.0.0.5', false],
    ['172.20.0.1', false],
    ['192.168.1.1', false],
    ['168.63.129.16', false],
    ['127.0.0.1', false],
    ['169.254.169.254', false],
    ['224.0.0.1', false],
    ['::1', false],
  ])('checks %s', (address, expected) => {
    expect(isPublicIpv4(address)).toBe(expected)
  })
})

describe('normalizeRecipeHtml', () => {
  it('normalizes Schema.org recipes from JSON-LD without importing page text', () => {
    const recipe = normalizeRecipeHtml(recipePage({
      '@type': 'Recipe',
      name: 'Crème & tomato soup',
      description: 'Comforting &amp; quick',
      image: '/soup.jpg',
      recipeCategory: ['Lunch', 'Soup'],
      keywords: ['easy', 'vegetarian'],
      recipeYield: '4 servings',
      prepTime: 'PT15M',
      cookTime: 'PT1H',
      recipeIngredient: ['2 cups diced tomatoes', 'Salt to taste'],
      recipeInstructions: [
        { '@type': 'HowToStep', text: 'Simmer the tomatoes &amp; broth.' },
        { '@type': 'HowToStep', text: 'Blend until smooth.' },
      ],
    }), 'https://recipes.example/soup')

    expect(recipe.title).toBe('Crème & tomato soup')
    expect(recipe.description).toBe('Comforting & quick')
    expect(recipe.imageUrl).toBe('https://recipes.example/soup.jpg')
    expect(recipe.sourceUrl).toBe('https://recipes.example/soup')
    expect(recipe.category).toBe('Lunch')
    expect(recipe.tags).toEqual(['easy', 'vegetarian', 'Lunch', 'Soup'])
    expect(recipe.servings).toBe(4)
    expect(recipe.prepTimeMinutes).toBe(15)
    expect(recipe.cookTimeMinutes).toBe(60)
    expect(recipe.ingredients[0]).toMatchObject({ name: 'diced tomatoes', quantityText: '2', unit: 'cups', quantity: 2 })
    expect(recipe.ingredients[1]).toMatchObject({ name: 'Salt to taste', quantity: null, quantityText: '' })
    expect(recipe.instructions.map(({ text }) => text)).toEqual([
      'Simmer the tomatoes & broth.',
      'Blend until smooth.',
    ])
    expect(JSON.stringify(recipe)).not.toContain('This article')
  })

  it('supports nested recipe graphs, section steps, and sparse review drafts', () => {
    const recipe = normalizeRecipeHtml(recipePage({
      '@type': ['Thing', 'Recipe'],
      name: 'Simple toast',
      recipeCategory: 'Breakfast',
      recipeInstructions: [{ '@type': 'HowToSection', itemListElement: [{ text: 'Toast bread.' }] }],
    }), 'https://recipes.example/toast')

    expect(recipe.category).toBe('Breakfast')
    expect(recipe.ingredients).toEqual([])
    expect(recipe.instructions.map(({ text }) => text)).toEqual(['Toast bread.'])
    expect(recipe.sourceUrl).toBe('https://recipes.example/toast')
  })

  it('rejects pages without supported recipe metadata or a recipe name', () => {
    expect(() => normalizeRecipeHtml('<html><p>Nothing structured.</p></html>', 'https://recipes.example'))
      .toThrow('No supported recipe metadata')
    expect(() => normalizeRecipeHtml(recipePage({ '@type': 'Recipe', recipeIngredient: ['2 cups flour'] }), 'https://recipes.example'))
      .toThrow('does not contain a recipe name')
  })
})

describe('fetchRecipeHtml', () => {
  it('pins requests to validated public IPv4 addresses', async () => {
    const request = vi.fn(async () => ({
      statusCode: 200,
      contentType: 'text/html',
      body: Buffer.from('<html>recipe</html>'),
    }))
    const dependencies = publicDependencies(request)

    const result = await fetchRecipeHtml('https://recipes.example/cake', dependencies)

    expect(result.sourceUrl).toBe('https://recipes.example/cake')
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({ hostname: 'recipes.example' }),
      '93.184.216.34',
      expect.any(AbortSignal),
    )
  })

  it('rejects private destinations, forbidden ports, and private redirects', async () => {
    const request = vi.fn(async () => ({
      statusCode: 200,
      contentType: 'text/html',
      body: Buffer.from(''),
    }))
    const privateDns = publicDependencies(request)
    privateDns.resolve = vi.fn(async () => ['93.184.216.34', '10.0.0.1'])

    await expect(fetchRecipeHtml('https://recipes.example/cake', privateDns)).rejects.toThrow('cannot be accessed safely')
    expect(request).not.toHaveBeenCalled()
    await expect(fetchRecipeHtml('http://recipes.example:8080/cake', publicDependencies())).rejects.toThrow('publicly accessible')

    const redirect = publicDependencies(vi.fn(async () => ({
      statusCode: 302,
      location: 'http://127.0.0.1/admin',
      contentType: '',
      body: Buffer.alloc(0),
    })))
    await expect(fetchRecipeHtml('https://recipes.example/cake', redirect)).rejects.toThrow('publicly accessible')
  })

  it('validates each public redirect, rejects loops and non-HTML pages', async () => {
    const dependencies: RecipeImportDependencies = {
      resolve: vi.fn(async () => ['93.184.216.34']),
      request: vi.fn()
        .mockResolvedValueOnce({
          statusCode: 302,
          location: 'https://cdn.example/recipe',
          contentType: '',
          body: Buffer.alloc(0),
        })
        .mockResolvedValueOnce({
          statusCode: 200,
          contentType: 'text/html',
          body: Buffer.from('recipe page'),
        }),
    }

    const page = await fetchRecipeHtml('https://recipes.example/cake', dependencies)
    expect(page.sourceUrl).toBe('https://recipes.example/cake')
    expect(dependencies.resolve).toHaveBeenCalledTimes(2)
    expect(dependencies.request).toHaveBeenCalledTimes(2)

    const nonHtml = publicDependencies(vi.fn(async () => ({
      statusCode: 200,
      contentType: 'application/pdf',
      body: Buffer.alloc(0),
    })))
    await expect(fetchRecipeHtml('https://recipes.example/cake', nonHtml)).rejects.toThrow('does not point to an HTML')

    const redirectLoop = publicDependencies(vi.fn(async (url) => ({
      statusCode: 302,
      location: url.href,
      contentType: '',
      body: Buffer.alloc(0),
    })))
    await expect(fetchRecipeHtml('https://recipes.example/cake', redirectLoop)).rejects.toThrow('invalid redirect')
  })
})

describe('importRecipeHandler', () => {
  it('rejects unsupported methods, content types, malformed JSON, and private URLs', async () => {
    const methodResponse = createResponse()
    await recipeImportHandler(createRequest('', 'GET'), methodResponse)
    expect(methodResponse.statusCode).toBe(405)

    const typeResponse = createResponse()
    await recipeImportHandler(createRequest('{}', 'POST', 'text/plain'), typeResponse)
    expect(typeResponse.statusCode).toBe(415)

    const bodyResponse = createResponse()
    await recipeImportHandler(createRequest('{'), bodyResponse)
    expect(bodyResponse.statusCode).toBe(400)

    const privateUrlResponse = createResponse()
    await recipeImportHandler(createRequest(JSON.stringify({ url: 'http://127.0.0.1/admin' })), privateUrlResponse)
    expect(privateUrlResponse.statusCode).toBe(400)
    expect(JSON.parse(privateUrlResponse.end.mock.calls[0][0])).toMatchObject({
      error: expect.stringContaining('publicly accessible'),
    })
  })
})
