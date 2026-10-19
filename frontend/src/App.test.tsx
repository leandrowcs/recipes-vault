import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRecipeBackup, saveRecipes } from './services/recipeStorage'
import { firebaseErrorMessage } from './services/firebase'
import { translateError } from './lib/locale'
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
  vi.restoreAllMocks()
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
    fireEvent.click(screen.getByLabelText(/Favorites only/))
    expect(screen.getByRole('button', { name: 'View Oat pancakes' })).toBeTruthy()

    fireEvent.change(screen.getByPlaceholderText('Search recipes or ingredients...'), { target: { value: 'oat flour' } })
    expect(screen.getByRole('button', { name: 'View Oat pancakes' })).toBeTruthy()
    await waitFor(() => expect(testVault.snapshot.recipes[0].isFavorite).toBe(true))
  })

  describe('collection navigation and locale', () => {
    it('localizes authentication and application error messages', () => {
      expect(firebaseErrorMessage({ code: 'auth/network-request-failed' }, 'pt-BR')).toBe('Conecte-se à internet para entrar.')
      expect(translateError('pt-BR', 'This file is not valid JSON. Your saved recipes were not changed.')).toBe(
        'Este arquivo não é um JSON válido. Suas receitas salvas não foram alteradas.',
      )
    })

    it('uses one recipe collection with an in-place favorites filter', async () => {
      testVault.snapshot.recipes = [
        { ...backupRecipe, id: 'favorite', title: 'Favorite soup', isFavorite: true },
        { ...backupRecipe, id: 'other', title: 'Everyday salad', isFavorite: false },
      ]
      render(<App />)
      await screen.findByRole('button', { name: 'View Favorite soup' })

      expect(screen.getByRole('button', { name: 'View Everyday salad' })).toBeTruthy()
      expect(screen.queryByRole('button', { name: 'Overview' })).toBeNull()
      expect(screen.queryByRole('button', { name: /^Favorites$/ })).toBeNull()

      fireEvent.click(screen.getByLabelText(/Favorites only/))

      expect(screen.getByRole('button', { name: 'View Favorite soup' })).toBeTruthy()
      expect(screen.queryByRole('button', { name: 'View Everyday salad' })).toBeNull()
    })

    it('adds a discovered recipe and keeps it in the collection when favoriting changes', async () => {
      const meal = {
        id: '52771',
        name: 'Sirloin Steak',
        imageUrl: 'https://example.com/sirloin.jpg',
        sourceUrl: 'https://example.com/sirloin',
        category: 'Beef',
        area: 'British',
        instructions: 'Season and grill the steak.',
        ingredients: [{ name: 'Sirloin steak', measure: '750g' }],
      }
      vi.stubGlobal('fetch', vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ recipes: [{ id: meal.id, name: meal.name, imageUrl: meal.imageUrl, sourceUrl: meal.sourceUrl }] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ meal }),
        }))

      render(<App />)
      await screen.findByRole('button', { name: 'Add recipe' })
      fireEvent.click(screen.getAllByRole('button', { name: 'Discover' })[0])
      fireEvent.change(screen.getByRole('textbox', { name: 'Search catalog by one ingredient' }), {
        target: { value: 'sirloin steak' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Find recipes' }))
      fireEvent.click(await screen.findByRole('button', { name: 'View Sirloin Steak' }))
      fireEvent.click(await screen.findByRole('button', { name: 'Add to my recipes' }))

      expect(await screen.findByRole('button', { name: 'In my recipes' })).toBeTruthy()
      await waitFor(() => expect(testVault.snapshot.recipes).toHaveLength(1))
      expect(testVault.snapshot.recipes[0].ingredients[0].quantityText).toBe('750g')

      fireEvent.click(screen.getAllByRole('button', { name: 'My recipes' })[0])
      expect(await screen.findByRole('button', { name: 'View Sirloin Steak' })).toBeTruthy()
      fireEvent.click(screen.getByRole('button', { name: 'Add Sirloin Steak to favorites' }))
      await waitFor(() => expect(testVault.snapshot.recipes[0].isFavorite).toBe(true))
      expect(screen.getByRole('button', { name: 'View Sirloin Steak' })).toBeTruthy()

      fireEvent.click(screen.getByRole('button', { name: 'Remove Sirloin Steak from favorites' }))
      await waitFor(() => expect(testVault.snapshot.recipes[0].isFavorite).toBe(false))
      expect(screen.getByRole('button', { name: 'View Sirloin Steak' })).toBeTruthy()
    })

    it('switches app language and persists the selected locale', async () => {
      testVault.snapshot.recipes = [{ ...backupRecipe, id: 'sample', title: 'Favorite soup', isFavorite: true }]
      render(<App />)
      await screen.findByRole('heading', { name: 'Your recipes, all in one place.' })
      fireEvent.change(screen.getByLabelText('Language'), { target: { value: 'pt-BR' } })

      expect(screen.getByRole('heading', { name: 'Suas receitas em um só lugar.' })).toBeTruthy()
      expect(screen.getAllByRole('button', { name: 'Minhas receitas' })).toHaveLength(2)
      expect(window.localStorage.getItem('recipes-vault-locale')).toBe('pt-BR')
      expect(document.documentElement.lang).toBe('pt-BR')

      fireEvent.click(await screen.findByRole('button', { name: 'Ver Favorite soup' }))
      expect(screen.getByRole('heading', { name: 'Ingredientes' })).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Editar' })).toBeTruthy()
      fireEvent.click(screen.getByRole('button', { name: 'Editar' }))
      expect(screen.getByLabelText('Nome da receita')).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Adicionar ingrediente' })).toBeTruthy()
      fireEvent.click(screen.getByRole('button', { name: 'Fechar formulário da receita' }))

      vi.spyOn(window, 'confirm').mockReturnValue(true)
      const restoreFile = new File(['backup'], 'recipes.json', { type: 'application/json' })
      Object.defineProperty(restoreFile, 'text', { value: async () => JSON.stringify(createRecipeBackup([backupRecipe])) })
      fireEvent.change(screen.getByLabelText('Restaurar backup de receitas'), { target: { files: [restoreFile] } })
      expect(await screen.findByText('Restauradas 1 receita.')).toBeTruthy()
      expect(window.confirm).toHaveBeenCalledWith('Substituir sua coleção na nuvem por 1 receita deste backup?')

      const UrlMock = class extends URL {}
      Object.assign(UrlMock, { createObjectURL: vi.fn(() => 'blob:recipes'), revokeObjectURL: vi.fn() })
      vi.stubGlobal('URL', UrlMock)
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
      fireEvent.click(screen.getByRole('button', { name: 'Exportar backup' }))
      expect(await screen.findByText('Exportadas 1 receita.')).toBeTruthy()

      fireEvent.click(screen.getAllByRole('button', { name: 'Despensa' })[0])
      expect(await screen.findByText('Sua despensa está vazia.')).toBeTruthy()
      expect(screen.getByLabelText('Ingrediente')).toBeTruthy()

      fireEvent.click(screen.getAllByRole('button', { name: 'Descobrir' })[0])
      expect(await screen.findByText(/A API-Receitas fornece receitas em português/)).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Buscar receitas' })).toBeTruthy()
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          found: true,
          product: {
            barcode: '4006381333931',
            name: 'Source language product',
            brand: 'Source brand',
            quantity: '',
            imageUrl: '',
            productUrl: 'https://world.openfoodfacts.org/product/4006381333931',
            nutriScore: null,
            novaGroup: null,
            ingredients: 'Original contributor ingredient text',
            additives: [],
            productType: 'food',
            nutritionBasis: '100g',
            nutrients: {
              energyKcal: 150,
              proteinG: 5,
              fiberG: 3,
              fatG: 4,
              saturatedFatG: 1,
              sugarsG: 2,
              sodiumMg: 120,
              saltG: null,
            },
          },
        }),
      }))
      fireEvent.click(screen.getAllByRole('button', { name: 'Escanear alimento' })[0])
      expect(await screen.findByText(/Os campos de produtos do Open Food Facts/)).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Consultar produto' })).toBeTruthy()
      fireEvent.change(screen.getByLabelText('Código de barras do produto'), { target: { value: '123' } })
      fireEvent.click(screen.getByRole('button', { name: 'Consultar produto' }))
      expect(screen.getByRole('alert').textContent).toContain('Informe um código EAN/UPC válido')
      fireEvent.change(screen.getByLabelText('Código de barras do produto'), { target: { value: '4006381333931' } })
      fireEvent.click(screen.getByRole('button', { name: 'Consultar produto' }))
      expect(await screen.findByRole('heading', { name: 'Semáforo nutricional' })).toBeTruthy()
      expect(screen.getAllByRole('heading', { name: 'Source language product' })).toHaveLength(2)
      expect(screen.getByRole('heading', { name: 'Ingredientes e aditivos' })).toBeTruthy()
    })

    it('opens and closes the mobile account and tools drawer', async () => {
      render(<App />)
      await screen.findByRole('button', { name: 'Add recipe' })
      fireEvent.click(screen.getByRole('button', { name: 'Open menu' }))

      expect(screen.getByText('owner@example.com')).toBeTruthy()
      expect(screen.getByLabelText('Language')).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Export backup' })).toBeTruthy()
      const sidebar = screen.getByLabelText('Your kitchen')
      expect(sidebar.classList.contains('mobile-open')).toBe(true)
      fireEvent.click(screen.getAllByRole('button', { name: 'Close menu' })[1])
      expect(sidebar.classList.contains('mobile-open')).toBe(false)
    })
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
