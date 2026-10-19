import type { Firestore } from 'firebase/firestore'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Recipe } from '../types/recipe'

const recipe: Recipe = {
  id: 'recipe-1',
  title: 'Bolo de Chocolate',
  description: '',
  imageUrl: '',
  sourceUrl: 'https://api-receitas-pi.vercel.app/receitas/5',
  servings: 2,
  prepTimeMinutes: 0,
  cookTimeMinutes: 0,
  difficulty: 'Easy',
  category: 'doce',
  tags: [],
  ingredients: [{ id: 'i-1', name: 'farinha', quantityText: '2 xícaras', quantity: null, unit: '', optional: false }],
  instructions: [{ id: 's-1', text: 'Misture e asse.' }],
  isFavorite: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

afterEach(() => {
  vi.resetModules()
  vi.doUnmock('firebase/firestore')
})

async function subscribe(docs: Array<{ id: string; data: () => unknown }>) {
  vi.doMock('firebase/firestore', () => ({
    collection: (_db: unknown, ...path: string[]) => ({ path: path.join('/') }),
    onSnapshot: (
      ref: { path: string },
      _options: unknown,
      next: (snapshot: { metadata: { fromCache: boolean }; docs: unknown[] }) => void,
    ) => {
      queueMicrotask(() => next({ metadata: { fromCache: false }, docs: ref.path.endsWith('recipes') ? docs : [] }))
      return () => undefined
    },
    writeBatch: vi.fn(),
    doc: vi.fn(),
    getDocs: vi.fn(),
    deleteDoc: vi.fn(),
  }))
  const { subscribeToVault } = await import('./firestoreVault')
  const next = vi.fn()
  const error = vi.fn()
  subscribeToVault('uid', next, error, {} as Firestore)
  await new Promise((resolve) => setTimeout(resolve, 0))
  return { next, error }
}

describe('subscribeToVault', () => {
  it('reads recipe data from Firestore document snapshots', async () => {
    const { next, error } = await subscribe([{ id: recipe.id, data: () => ({ ...recipe }) }])

    expect(error).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalledWith({ recipes: [recipe], pantry: [] })
  })

  it('reports invalid records and ID mismatches', async () => {
    const { next, error } = await subscribe([{ id: 'other', data: () => ({ ...recipe }) }])

    expect(next).not.toHaveBeenCalled()
    expect(error).toHaveBeenCalledWith(expect.stringContaining('An invalid recipe record'))
  })
})
