import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import type { RecipeDraft, RecipeIngredient } from '../frontend/src/types/recipe.ts'

const MAX_HTML_BYTES = 1_000_000
const MAX_BODY_BYTES = 4_096
const MAX_REDIRECTS = 4
const REQUEST_TIMEOUT_MS = 7_000

const blockedIpv4Ranges = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['168.63.129.16', 32],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const

export interface RecipePageResponse {
  statusCode: number
  location?: string
  contentType: string
  body: Buffer
}

export interface RecipeImportDependencies {
  resolve: (hostname: string) => Promise<string[]>
  request: (url: URL, address: string, signal: AbortSignal) => Promise<RecipePageResponse>
}

interface ImportDeadline {
  signal: AbortSignal
  cancel: () => void
}

class RecipeImportError extends Error {
  readonly statusCode: number

  constructor(message: string, statusCode = 422) {
    super(message)
    this.name = 'RecipeImportError'
    this.statusCode = statusCode
  }
}

function createImportDeadline(): ImportDeadline {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 9_000)
  timeout.unref()
  return { signal: controller.signal, cancel: () => clearTimeout(timeout) }
}

const dependencies: RecipeImportDependencies = {
  resolve: async (hostname) => {
    const addresses = await lookup(hostname, { all: true, family: 4, verbatim: true })
    return addresses.map(({ address }) => address)
  },
  request: requestRecipePage,
}

export function isPublicIpv4(address: string): boolean {
  if (isIP(address) !== 4) return false
  const value = address.split('.').reduce((total, part) => total * 256 + Number(part), 0)
  return blockedIpv4Ranges.every(([subnet, prefix]) => {
    const network = subnet.split('.').reduce((total, part) => total * 256 + Number(part), 0)
    const mask = 0xffff_ffff << (32 - prefix)
    return (value & mask) !== (network & mask)
  })
}

function withDeadline<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new RecipeImportError('The recipe import took too long. Try again.'))

  return new Promise((resolve, reject) => {
    const removeListener = () => signal.removeEventListener('abort', onAbort)
    const onAbort = () => {
      removeListener()
      reject(new RecipeImportError('The recipe import took too long. Try again.'))
    }
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then((value) => {
      removeListener()
      resolve(value)
    }, (error: unknown) => {
      removeListener()
      reject(error)
    })
  })
}

function parseSourceUrl(rawUrl: string): URL {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new RecipeImportError('Enter a valid, publicly accessible HTTP or HTTPS recipe URL.', 400)
  }

  const hostname = url.hostname.toLowerCase()
  const portAllowed =
    !url.port ||
    (url.protocol === 'http:' && url.port === '80') ||
    (url.protocol === 'https:' && url.port === '443')
  const validHostname =
    hostname.includes('.') &&
    !hostname.endsWith('.') &&
    !hostname.endsWith('.localhost') &&
    !hostname.endsWith('.local') &&
    !hostname.endsWith('.internal')

  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username !== '' ||
    url.password !== '' ||
    !portAllowed ||
    (!validHostname && isIP(hostname) !== 4) ||
    isIP(hostname) === 6 ||
    (isIP(hostname) === 4 && !isPublicIpv4(hostname))
  ) {
    throw new RecipeImportError('Enter a valid, publicly accessible HTTP or HTTPS recipe URL.', 400)
  }

  url.hash = ''
  return url
}

async function resolvePublicAddress(
  url: URL,
  resolve: RecipeImportDependencies['resolve'],
  deadline: AbortSignal,
): Promise<string> {
  if (isIP(url.hostname) === 4) return url.hostname

  let addresses: string[]
  try {
    addresses = await withDeadline(resolve(url.hostname), deadline)
  } catch (error) {
    if (error instanceof RecipeImportError) throw error
    throw new RecipeImportError('This recipe website could not be reached. Check the URL and try again.')
  }

  if (!addresses.length || addresses.some((address) => !isPublicIpv4(address))) {
    throw new RecipeImportError('This recipe website cannot be accessed safely. Try entering the recipe manually.')
  }

  return addresses[0]
}

export async function fetchRecipeHtml(
  sourceUrl: string,
  injectedDependencies: RecipeImportDependencies = dependencies,
): Promise<{ html: string; sourceUrl: string }> {
  let url = parseSourceUrl(sourceUrl)
  const originalSourceUrl = url.href
  const visited = new Set<string>()
  const deadline = createImportDeadline()

  try {
    for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
      if (visited.has(url.href)) {
        throw new RecipeImportError('This recipe website returned an invalid redirect. Try another URL.')
      }
      visited.add(url.href)

      const address = await resolvePublicAddress(url, injectedDependencies.resolve, deadline.signal)
      let response: RecipePageResponse
      try {
        response = await withDeadline(injectedDependencies.request(url, address, deadline.signal), deadline.signal)
      } catch (error) {
        if (deadline.signal.aborted) {
          throw new RecipeImportError('This recipe website took too long to respond. Try again.')
        }
        if (error instanceof RecipeImportError) throw error
        throw new RecipeImportError('This recipe website could not be reached. Try again or enter the recipe manually.')
      }

      if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
        if (!response.location || redirectCount === MAX_REDIRECTS) {
          throw new RecipeImportError('This recipe website redirected too many times. Try another URL.')
        }
        try {
          url = parseSourceUrl(new URL(response.location, url).href)
        } catch (error) {
          if (error instanceof RecipeImportError) throw error
          throw new RecipeImportError('This recipe website returned an invalid redirect.')
        }
        continue
      }

      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw new RecipeImportError('This recipe website could not provide the page. Try entering the recipe manually.')
      }
      if (!response.contentType.toLowerCase().includes('text/html')) {
        throw new RecipeImportError('This URL does not point to an HTML recipe page. Try another URL.')
      }

      return { html: response.body.toString('utf8'), sourceUrl: originalSourceUrl }
    }

    throw new RecipeImportError('This recipe website redirected too many times. Try another URL.')
  } finally {
    deadline.cancel()
  }
}

export function normalizeRecipeHtml(html: string, sourceUrl: string): RecipeDraft {
  const scripts = html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)
  let recipe: Record<string, unknown> | undefined

  for (const [, attributes, contents] of scripts) {
    const type = attributes.match(/\btype\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i)
    if ((type?.[1] ?? type?.[2] ?? type?.[3] ?? '').split(';', 1)[0].trim().toLowerCase() !== 'application/ld+json') continue

    try {
      recipe = findRecipe(JSON.parse(contents.trim()))
      if (recipe) break
    } catch {
      continue
    }
  }

  if (!recipe) {
    throw new RecipeImportError('No supported recipe metadata was found on this page. Add the recipe manually.')
  }

  const title = cleanText(recipe.name, 180)
  if (!title) {
    throw new RecipeImportError('The page does not contain a recipe name. Add the recipe manually.')
  }

  const ingredients = stringValues(recipe.recipeIngredient)
    .slice(0, 100)
    .map((value, index) => normalizeIngredient(value, index))
    .filter((ingredient): ingredient is RecipeIngredient => ingredient !== null)
  const instructions = normalizeInstructions(recipe.recipeInstructions).slice(0, 100)
  const imageUrl = normalizeImage(recipe.image, sourceUrl)
  const tags = [
    ...stringValues(recipe.keywords),
    ...stringValues(recipe.recipeCategory),
  ].flatMap((value) => value.split(',')).map((tag) => cleanText(tag, 40)).filter(Boolean).slice(0, 24)
  const servings = positiveInteger(recipe.recipeYield, 2, 1_000)
  const difficulty = parseDifficulty(recipe.keywords)

  return {
    title,
    description: cleanText(recipe.description, 1_000),
    imageUrl,
    sourceUrl,
    servings,
    prepTimeMinutes: parseDuration(recipe.prepTime),
    cookTimeMinutes: parseDuration(recipe.cookTime),
    difficulty,
    category: cleanText(stringValues(recipe.recipeCategory)[0], 80) || 'Uncategorized',
    tags: [...new Set(tags)],
    ingredients,
    instructions: instructions.map((text, index) => ({ id: `import-step-${index + 1}`, text })),
  }
}

function findRecipe(value: unknown, depth = 0, seen = new Set<object>()): Record<string, unknown> | undefined {
  if (depth > 12 || value === null || typeof value !== 'object') return undefined
  if (seen.has(value)) return undefined
  seen.add(value)

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findRecipe(item, depth + 1, seen)
      if (found) return found
    }
    return undefined
  }

  const record = value as Record<string, unknown>
  const types = Array.isArray(record['@type']) ? record['@type'] : [record['@type']]
  if (types.some((type) => typeof type === 'string' && type.toLowerCase() === 'recipe')) return record

  for (const nested of Object.values(record)) {
    const found = findRecipe(nested, depth + 1, seen)
    if (found) return found
  }
  return undefined
}

function normalizeIngredient(raw: string, index: number): RecipeIngredient | null {
  const nameAndAmount = cleanText(raw, 240)
  if (!nameAndAmount) return null

  const amount = nameAndAmount.match(/^(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:[.,]\d+)?|[¼½¾⅓⅔⅛⅜⅝⅞])\s+(.+)$/)
  const parts = amount?.[2].match(/^([a-zA-Z]+)\s+(.+)$/)
  const unit = parts?.[1] ?? ''
  const knownUnits = new Set([
    'cup', 'cups', 'c', 'tablespoon', 'tablespoons', 'tbsp', 'tbs', 'teaspoon', 'teaspoons', 'tsp',
    'gram', 'grams', 'g', 'kilogram', 'kilograms', 'kg', 'milligram', 'milligrams', 'mg',
    'ounce', 'ounces', 'oz', 'pound', 'pounds', 'lb', 'lbs', 'milliliter', 'milliliters', 'ml',
    'liter', 'liters', 'l', 'pint', 'pints', 'quart', 'quarts', 'gallon', 'gallons',
    'clove', 'cloves', 'slice', 'slices', 'piece', 'pieces', 'can', 'cans', 'package', 'packages',
    'packet', 'packets', 'bunch', 'bunches', 'sprig', 'sprigs', 'pinch', 'pinches', 'dash', 'dashes',
  ])
  const parsedQuantity = amount && parseQuantity(amount[1])
  const parsedUnit = unit && knownUnits.has(unit.toLowerCase()) ? unit : ''

  return {
    id: `import-ingredient-${index + 1}`,
    name: parsedUnit ? parts?.[2] ?? nameAndAmount : nameAndAmount,
    quantityText: parsedUnit && amount ? amount[1] : '',
    quantity: parsedUnit ? parsedQuantity : null,
    unit: parsedUnit,
    optional: false,
  }
}

function normalizeInstructions(value: unknown): string[] {
  if (typeof value === 'string') return [cleanText(value, 1_200)].filter(Boolean)
  if (!Array.isArray(value)) return []

  return value.flatMap((instruction): string[] => {
    if (typeof instruction === 'string') return [cleanText(instruction, 1_200)].filter(Boolean)
    if (!instruction || typeof instruction !== 'object') return []

    const item = instruction as Record<string, unknown>
    if (item.text || item.name) return [cleanText(item.text ?? item.name, 1_200)].filter(Boolean)
    return normalizeInstructions(item.itemListElement ?? item.hasPart)
  })
}

function stringValues(value: unknown): string[] {
  if (typeof value === 'string' || typeof value === 'number') return [String(value)]
  if (Array.isArray(value)) return value.flatMap(stringValues)
  if (value && typeof value === 'object' && 'name' in value) return stringValues(value.name)
  return []
}

function cleanText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string' && typeof value !== 'number') return ''
  return decodeEntities(String(value).replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim().slice(0, maxLength)
}

function decodeEntities(value: string): string {
  return value.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (entity, encoded: string) => {
    if (encoded[0] === '#') {
      const codePoint = encoded[1].toLowerCase() === 'x'
        ? Number.parseInt(encoded.slice(2), 16)
        : Number.parseInt(encoded.slice(1), 10)
      return Number.isFinite(codePoint) && codePoint > 0 && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : entity
    }
    return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }[encoded.toLowerCase()] ?? entity
  })
}

function normalizeImage(value: unknown, sourceUrl: string): string {
  const raw = stringValues(value)[0]
  if (!raw) return ''
  try {
    const imageUrl = new URL(raw, sourceUrl)
    return ['http:', 'https:'].includes(imageUrl.protocol) ? imageUrl.href : ''
  } catch {
    return ''
  }
}

function positiveInteger(value: unknown, fallback: number, maximum: number): number {
  const raw = stringValues(value)[0]?.match(/\d+/)?.[0]
  const parsed = Number(raw)
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback
}

function parseDuration(value: unknown): number {
  if (typeof value !== 'string') return 0
  const match = value.match(/^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i)
  if (!match) return 0
  const minutes =
    Number(match[1] ?? 0) * 1_440 +
    Number(match[2] ?? 0) * 60 +
    Number(match[3] ?? 0) +
    Number(match[4] ?? 0) / 60
  return Number.isFinite(minutes) ? Math.min(10_080, Math.round(minutes)) : 0
}

function parseQuantity(value: string): number | null {
  const mixed = value.match(/^(\d+)\s+(\d+)\/(\d+)$/)
  if (mixed) {
    const denominator = Number(mixed[3])
    return denominator > 0 ? Number(mixed[1]) + Number(mixed[2]) / denominator : null
  }
  const fraction = value.match(/^(\d+)\/(\d+)$/)
  if (fraction) {
    const denominator = Number(fraction[2])
    return denominator > 0 ? Number(fraction[1]) / denominator : null
  }
  const fractions: Record<string, number> = { '¼': 0.25, '½': 0.5, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875 }
  if (fractions[value]) return fractions[value]
  const numeric = Number(value.replace(',', '.'))
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null
}

function parseDifficulty(value: unknown): RecipeDraft['difficulty'] {
  const keywords = stringValues(value).join(' ').toLowerCase()
  if (/\b(hard|difficult|advanced)\b/.test(keywords)) return 'Hard'
  if (/\b(medium|moderate|intermediate)\b/.test(keywords)) return 'Medium'
  return 'Easy'
}

async function requestRecipePage(url: URL, address: string, signal: AbortSignal): Promise<RecipePageResponse> {
  return new Promise((resolve, reject) => {
    const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(url, {
      method: 'GET',
      agent: false,
      headers: {
        accept: 'text/html',
        'accept-encoding': 'identity',
        'user-agent': 'RecipesVault/1.0 (+recipe metadata importer)',
      },
      signal,
      lookup: (_hostname, _options, callback) => callback(null, address, 4),
    }, (response) => {
      const statusCode = response.statusCode ?? 502
      const contentLength = Number(response.headers['content-length'] ?? 0)
      if (contentLength > MAX_HTML_BYTES) {
        response.destroy()
        reject(new RecipeImportError('This recipe page is too large to import.'))
        return
      }

      if ([301, 302, 303, 307, 308].includes(statusCode)) {
        response.resume()
        resolve({
          statusCode,
          location: response.headers.location,
          contentType: '',
          body: Buffer.alloc(0),
        })
        return
      }

      if (response.headers['content-encoding'] && response.headers['content-encoding'] !== 'identity') {
        response.destroy()
        reject(new RecipeImportError('This recipe page uses an unsupported response format.'))
        return
      }

      const chunks: Buffer[] = []
      let totalBytes = 0
      response.on('data', (chunk: Buffer | string) => {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
        totalBytes += buffer.length
        if (totalBytes > MAX_HTML_BYTES) {
          response.destroy(new RecipeImportError('This recipe page is too large to import.'))
          return
        }
        chunks.push(buffer)
      })
      response.on('end', () => resolve({
        statusCode,
        contentType: response.headers['content-type'] ?? '',
        body: Buffer.concat(chunks),
      }))
      response.on('error', reject)
    })

    request.setTimeout(REQUEST_TIMEOUT_MS, () => request.destroy(new Error('Recipe page request timed out')))
    request.on('error', reject)
    request.end()
  })
}

async function readRequestBody(request: IncomingMessage): Promise<unknown> {
  if ('body' in request && request.body !== undefined) {
    let serializedBody: string
    try {
      serializedBody = typeof request.body === 'string' ? request.body : JSON.stringify(request.body) ?? ''
    } catch {
      throw new RecipeImportError('Send a valid recipe URL to import.', 400)
    }
    if (Buffer.byteLength(serializedBody, 'utf8') > MAX_BODY_BYTES) {
      throw new RecipeImportError('The import request is too large.', 413)
    }
    if (typeof request.body !== 'string') return request.body
    try {
      return JSON.parse(request.body)
    } catch {
      throw new RecipeImportError('Send a valid recipe URL to import.', 400)
    }
  }

  const contentLength = Number(request.headers['content-length'] ?? 0)
  if (contentLength > MAX_BODY_BYTES) {
    throw new RecipeImportError('The import request is too large.', 413)
  }

  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > MAX_BODY_BYTES) throw new RecipeImportError('The import request is too large.', 413)
    chunks.push(buffer)
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new RecipeImportError('Send a valid recipe URL to import.', 400)
  }
}

export default async function handler(request: IncomingMessage, response: ServerResponse): Promise<void> {
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'no-store')
  response.setHeader('X-Content-Type-Options', 'nosniff')

  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    response.statusCode = 405
    response.end(JSON.stringify({ error: 'Use POST to import a recipe URL.' }))
    return
  }

  if (!request.headers['content-type']?.toLowerCase().startsWith('application/json')) {
    response.statusCode = 415
    response.end(JSON.stringify({ error: 'Send the recipe URL as JSON.' }))
    return
  }

  try {
    const body = await readRequestBody(request)
    const sourceUrl = body && typeof body === 'object' && 'url' in body && typeof body.url === 'string'
      ? body.url.trim()
      : ''
    if (!sourceUrl || sourceUrl.length > 2_048) {
      throw new RecipeImportError('Enter a valid recipe URL.', 400)
    }

    const page = await fetchRecipeHtml(sourceUrl)
    const recipe = normalizeRecipeHtml(page.html, page.sourceUrl)
    response.statusCode = 200
    response.end(JSON.stringify({ recipe }))
  } catch (error) {
    const knownError = error instanceof RecipeImportError
    response.statusCode = knownError ? error.statusCode : 500
    response.end(JSON.stringify({
      error: knownError ? error.message : 'The recipe could not be imported. Add it manually or try again later.',
    }))
  }
}
