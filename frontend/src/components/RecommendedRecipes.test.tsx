import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RecommendedRecipes } from './RecommendedRecipes'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('recommended recipes', () => {
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
    render(<RecommendedRecipes favoriteRecipes={[]} locale="en-US" />)

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
  })
})
