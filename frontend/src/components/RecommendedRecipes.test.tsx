import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RecommendedRecipes } from './RecommendedRecipes'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('recommended recipes', () => {
  it('shows the Portuguese catalog and calls its API', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ recipes: [] }),
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<RecommendedRecipes favoriteRecipes={[]} locale="pt-BR" savedRecipes={[]} onSaveRecipe={vi.fn()} />)

    expect(screen.getByText('CATÁLOGO DE RECEITAS API-RECEITAS')).toBeTruthy()
    expect(screen.getByText(/A API-Receitas fornece receitas em português/)).toBeTruthy()
    fireEvent.change(screen.getByRole('textbox', { name: 'Buscar catálogo por ingrediente' }), {
      target: { value: 'frango' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Buscar receitas' }))

    expect(await screen.findByText('Nenhuma receita encontrada para esse ingrediente.')).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/receitas?ingredient=frango',
      expect.objectContaining({ headers: { Accept: 'application/json' } }),
    )
    expect(screen.getByRole('link', { name: 'API-Receitas' }).getAttribute('href'))
      .toBe('https://github.com/DenilsonRabelo/API-receitas')
  })

  it('opens and displays the selected recipe details', async () => {
    const recipe = {
      id: '52771',
      name: 'Sirloin Steak',
      imageUrl: 'https://example.com/sirloin.jpg',
      sourceUrl: 'https://example.com/sirloin',
    }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ recipes: [recipe] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          meal: {
            ...recipe,
            category: 'Beef',
            area: 'British',
            instructions: 'Season the steak and grill until cooked.',
            ingredients: [{ name: 'Sirloin steak', measure: '1 lb' }],
          },
        }),
      })

    vi.stubGlobal('fetch', fetchMock)
    const onSaveRecipe = vi.fn().mockResolvedValue(true)
    render(<RecommendedRecipes favoriteRecipes={[]} locale="en-US" savedRecipes={[]} onSaveRecipe={onSaveRecipe} />)

    fireEvent.change(screen.getByRole('textbox', { name: 'Search catalog by one ingredient' }), {
      target: { value: 'sirloin steak' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Find recipes' }))

    fireEvent.click(await screen.findByRole('button', { name: 'View Sirloin Steak' }))

    const dialog = await screen.findByRole('dialog', { name: 'Sirloin Steak' })
    expect(dialog.textContent).toContain('1 lb')
    expect(dialog.textContent).toContain('Sirloin steak')
    expect(dialog.textContent).toContain('Season the steak and grill until cooked.')
    expect(dialog.textContent).toContain('TheMealDB data may differ from the linked publisher recipe')

    fireEvent.click(screen.getByRole('button', { name: 'Add to my recipes' }))
    expect(await screen.findByRole('button', { name: 'In my recipes' })).toBeTruthy()
    expect(onSaveRecipe).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Sirloin Steak',
      sourceUrl: recipe.sourceUrl,
      ingredients: [expect.objectContaining({ name: 'Sirloin steak', quantityText: '1 lb', quantity: null })],
    }))
  })
})
