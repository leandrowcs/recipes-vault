import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRecipeBackup, saveRecipes } from './services/recipeStorage'
import type { VaultSnapshot } from './services/firestoreVault'
import type { PantryItem } from './types/pantry'
import type { Recipe, RecipeDraft } from './types/recipe'

const testVault = vi.hoisted(() => ({
  snapshot: { recipes: [] as Recipe[], pantry: [] as PantryItem[] },
  subscribers: [] as Array<(snapshot: VaultSnapshot) => void>,
}))

vi.mock('./components/AuthGate', () => ({
  AuthGate: ({ children }: { children: (user: { uid: string; email: string }) => ReactNode }) =>
    children({ uid: 'owner-uid', email: 'owner@example.com' }),
}))

vi.mock('./services/firestoreVault', () => ({
  subscribeToVault: (_uid: string, next: (snapshot: VaultSnapshot) => void) => {
    testVault.subscribers.push(next)
    queueMicrotask(() => next(structuredClone(testVault.snapshot)))
    return () => {
      testVault.subscribers = testVault.subscribers.filter((subscriber) => subscriber !== next)
    }
  },
  saveVaultChanges: async (_uid: string, _previous: VaultSnapshot, next: VaultSnapshot) => {
    testVault.snapshot = structuredClone(next)
    for (const subscriber of testVault.subscribers) subscriber(structuredClone(testVault.snapshot))
  },
}))

import App from './App'

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  vi.unstubAllGlobals()
  testVault.snapshot = { recipes: [], pantry: [] }
  testVault.subscribers = []
})

const backupRecipe: Recipe = {
  id: 'backup-recipe',
  title: 'Backup tomato soup',
  description: '',
  imageUrl: '',
  sourceUrl: '',
  servings: 2,
  prepTimeMinutes: 5,
  cookTimeMinutes: 15,
  difficulty: 'Easy',
  category: 'Lunch',
  tags: [],
  ingredients: [{ id: 'tomato', name: 'Tomato', quantityText: '2', quantity: 2, unit: '', optional: false }],
  instructions: [{ id: 'step', text: 'Cook the tomato.' }],
  isFavorite: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

describe('recipe collection', () => {
  it('creates a recipe, scales ingredients, saves favorites, and searches ingredients', async () => {
    render(<App />)

    await waitFor(() => expect(screen.getByRole('button', { name: 'Add your first recipe' }).hasAttribute('disabled')).toBe(false))
    fireEvent.click(screen.getByRole('button', { name: 'Add your first recipe' }))
    fireEvent.change(screen.getByLabelText('Recipe name'), { target: { value: 'Oat pancakes' } })
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'Breakfast' } })
    fireEvent.change(screen.getByLabelText('Quantity for ingredient 1'), { target: { value: '1 1/2' } })
    fireEvent.change(screen.getByLabelText('Unit for ingredient 1'), { target: { value: 'cups' } })
    fireEvent.change(screen.getByLabelText('Ingredient 1'), { target: { value: 'oat flour' } })
    fireEvent.change(screen.getByLabelText('Cooking step 1'), { target: { value: 'Whisk and cook until golden.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save recipe' }))

    fireEvent.click(await screen.findByRole('button', { name: 'View Oat pancakes' }))
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Number of servings' }), { target: { value: '4' } })
    expect(screen.getByText('oat flour').closest('li')?.textContent).toContain('3 cups oat flour')

    fireEvent.click(screen.getByRole('button', { name: 'Add to favorites' }))
    fireEvent.click(screen.getByRole('button', { name: 'Close recipe details' }))
    fireEvent.click(screen.getAllByRole('button', { name: /Favorites/ })[0])
    expect(screen.getByRole('button', { name: 'View Oat pancakes' })).toBeTruthy()

    fireEvent.change(screen.getByPlaceholderText('Search recipes or ingredients...'), { target: { value: 'oat flour' } })
    expect(screen.getByRole('button', { name: 'View Oat pancakes' })).toBeTruthy()
    await waitFor(() => expect(testVault.snapshot.recipes[0].isFavorite).toBe(true))
  })

  it('imports through the server, reviews the draft, and saves only after confirmation', async () => {
    const importedRecipe: RecipeDraft = {
      ...backupRecipe,
      title: 'Imported tomato soup',
      sourceUrl: 'https://recipes.example/tomato-soup',
    }
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ recipe: importedRecipe }),
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<App />)

    fireEvent.click(screen.getAllByRole('button', { name: 'Import recipe' })[0])
    fireEvent.change(screen.getByRole('textbox', { name: 'Recipe page URL' }), {
      target: { value: 'https://recipes.example/tomato-soup' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Fetch recipe' }))

    fireEvent.click(await screen.findByRole('button', { name: 'Review and edit recipe' }))
    expect(screen.getByRole('heading', { name: 'Review imported recipe' })).toBeTruthy()
    expect(screen.getAllByDisplayValue('https://recipes.example/tomato-soup')).toHaveLength(2)
    expect(testVault.snapshot.recipes).toHaveLength(0)

    fireEvent.click(screen.getByRole('button', { name: 'Save recipe' }))
    expect(await screen.findByRole('button', { name: 'View Imported tomato soup' })).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledWith('/api/import-recipe', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ url: 'https://recipes.example/tomato-soup' }),
    }))
  })

  it('offers manual entry when a website has no supported recipe metadata', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'No supported recipe metadata was found on this page. Add the recipe manually.' }),
    }))
    render(<App />)

    fireEvent.click(screen.getAllByRole('button', { name: 'Import recipe' })[0])
    fireEvent.change(screen.getByRole('textbox', { name: 'Recipe page URL' }), {
      target: { value: 'https://recipes.example/unsupported' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Fetch recipe' }))
    expect(await screen.findByRole('alert')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Enter recipe manually' }))

    fireEvent.change(screen.getByLabelText('Recipe name'), { target: { value: 'Manual fallback' } })
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'Dinner' } })
    fireEvent.change(screen.getByLabelText('Ingredient 1'), { target: { value: 'Rice' } })
    fireEvent.change(screen.getByLabelText('Cooking step 1'), { target: { value: 'Cook the rice.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save recipe' }))

    expect(await screen.findByRole('button', { name: 'View Manual fallback' })).toBeTruthy()
    expect(screen.queryByText('No supported recipe metadata was found on this page. Add the recipe manually.')).toBeNull()
  })

  it('restores a validated backup only after explicit confirmation', async () => {
    const currentRecipe = { ...backupRecipe, id: 'current', title: 'Current recipe' }
    testVault.snapshot.recipes = [currentRecipe]
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<App />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add recipe' }).hasAttribute('disabled')).toBe(false))

    const file = new File([JSON.stringify(createRecipeBackup([backupRecipe]))], 'recipes.json', {
      type: 'application/json',
    })
    Object.defineProperty(file, 'text', { value: async () => JSON.stringify(createRecipeBackup([backupRecipe])) })
    fireEvent.change(screen.getByLabelText('Restore recipe backup'), { target: { files: [file] } })

    expect(await screen.findByRole('button', { name: 'View Backup tomato soup' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'View Current recipe' })).toBeNull()
    expect(window.confirm).toHaveBeenCalledOnce()
    await waitFor(() => expect(testVault.snapshot.recipes[0].id).toBe('backup-recipe'))
  })

  it('restores a valid backup into an empty cloud collection', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<App />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add recipe' }).hasAttribute('disabled')).toBe(false))
    const file = new File(['backup'], 'recipes.json', { type: 'application/json' })
    Object.defineProperty(file, 'text', { value: async () => JSON.stringify(createRecipeBackup([backupRecipe])) })

    fireEvent.change(screen.getByLabelText('Restore recipe backup'), { target: { files: [file] } })

    expect(await screen.findByRole('button', { name: 'View Backup tomato soup' })).toBeTruthy()
    expect(testVault.snapshot.recipes).toHaveLength(1)
  })

  it('saves and removes pantry ingredients in the cloud collection', async () => {
    render(<App />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Pantry' })[0])

    await waitFor(() => expect(screen.getByRole('button', { name: 'Add ingredient' }).hasAttribute('disabled')).toBe(false))
    fireEvent.change(screen.getByLabelText('Ingredient'), { target: { value: 'Brown rice' } })
    fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('Unit'), { target: { value: 'bags' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add ingredient' }))

    expect(await screen.findByText('Brown rice')).toBeTruthy()
    expect(testVault.snapshot.pantry[0]).toMatchObject({ name: 'Brown rice', quantity: 2, unit: 'bags' })
    fireEvent.click(screen.getByRole('button', { name: 'Remove Brown rice from pantry' }))
    await waitFor(() => expect(testVault.snapshot.pantry).toHaveLength(0))
  })

  it('offers explicit migration of recipes stored on this device', async () => {
    saveRecipes([{ ...backupRecipe, title: 'Legacy soup' }], window.localStorage)
    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: 'Import local recipes' }))
    expect(await screen.findByRole('button', { name: 'View Legacy soup' })).toBeTruthy()
    expect(testVault.snapshot.recipes).toHaveLength(1)
  })
})
