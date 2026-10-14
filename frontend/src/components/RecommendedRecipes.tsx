import { ArrowUpRight, ChefHat, Search } from 'lucide-react'
import { lazy, Suspense, useEffect, useState, type FormEvent } from 'react'
import type { MealCard, MealDetails } from '../types/food'

const MealDetailsView = lazy(async () => {
  const module = await import('./RecommendedRecipeDetails')
  return { default: module.RecommendedRecipeDetails }
})

function isMealCard(value: unknown): value is MealCard {
  return Boolean(
    value &&
    typeof value === 'object' &&
    'id' in value && typeof value.id === 'string' &&
    'name' in value && typeof value.name === 'string' &&
    'imageUrl' in value && typeof value.imageUrl === 'string' &&
    'sourceUrl' in value && typeof value.sourceUrl === 'string',
  )
}

function isMealDetails(value: unknown): value is MealDetails {
  return Boolean(
    isMealCard(value) &&
    'category' in value && typeof value.category === 'string' &&
    'area' in value && typeof value.area === 'string' &&
    'instructions' in value && typeof value.instructions === 'string' &&
    'ingredients' in value && Array.isArray(value.ingredients) &&
    value.ingredients.every((ingredient) =>
      ingredient !== null && typeof ingredient === 'object' &&
      'name' in ingredient && typeof ingredient.name === 'string' &&
      'measure' in ingredient && typeof ingredient.measure === 'string'),
  )
}

interface RecommendedRecipesProps {
  favoriteRecipes: string[]
}

export function RecommendedRecipes({ favoriteRecipes }: RecommendedRecipesProps) {
  const [ingredient, setIngredient] = useState('')
  const [recipes, setRecipes] = useState<MealCard[]>([])
  const [selectedMeal, setSelectedMeal] = useState<MealDetails | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [searched, setSearched] = useState(false)

  async function searchMeals(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setSearched(true)
    setIsLoading(true)
    try {
      const response = await fetch(`/api/mealdb?ingredient=${encodeURIComponent(ingredient.trim())}`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(12_000),
      })
      const result: unknown = await response.json()
      if (!response.ok) {
        throw new Error(
          result && typeof result === 'object' && 'error' in result && typeof result.error === 'string'
            ? result.error
            : 'The recipe catalog is unavailable. Try again later.',
        )
      }
      if (!result || typeof result !== 'object' || !('recipes' in result) || !Array.isArray(result.recipes)) {
        throw new Error('The recipe catalog returned an invalid response.')
      }
      if (!result.recipes.every(isMealCard)) throw new Error('The recipe catalog returned an invalid response.')
      setRecipes(result.recipes)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The recipe catalog is unavailable. Try again later.')
      setRecipes([])
    } finally {
      setIsLoading(false)
    }
  }

  async function openMeal(recipe: MealCard) {
    setError('')
    setSelectedMeal({
      ...recipe,
      category: '',
      area: '',
      instructions: '',
      ingredients: [],
    })
    try {
      const response = await fetch(`/api/mealdb?id=${encodeURIComponent(recipe.id)}`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(12_000),
      })
      const result: unknown = await response.json()
      if (!response.ok) {
        throw new Error(
          result && typeof result === 'object' && 'error' in result && typeof result.error === 'string'
            ? result.error
            : 'Recipe details are unavailable. Try again later.',
        )
      }
      if (!result || typeof result !== 'object' || !('meal' in result)) {
        throw new Error('The recipe catalog returned an invalid response.')
      }
      if (!isMealDetails(result.meal)) throw new Error('The recipe catalog returned invalid recipe details.')
      setSelectedMeal(result.meal)
    } catch (reason) {
      setSelectedMeal(null)
      setError(reason instanceof Error ? reason.message : 'Recipe details are unavailable. Try again later.')
    }
  }

  useEffect(() => {
    if (selectedMeal) document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [selectedMeal])

  const favorites = new Set(favoriteRecipes.map((name) => name.trim().toLowerCase()).filter(Boolean))
  const recommendations = [...recipes].sort((first, second) => {
    const firstMatch = favorites.has(first.name.toLowerCase()) ? 1 : 0
    const secondMatch = favorites.has(second.name.toLowerCase()) ? 1 : 0
    return secondMatch - firstMatch || first.name.localeCompare(second.name)
  })

  return (
    <section className="collection-section discovery-section">
      <div className="collection-heading">
        <div>
          <p className="eyebrow">THEMEALDB RECIPE CATALOG</p>
          <h2>Recipes to explore</h2>
        </div>
      </div>
      <p className="discovery-intro">
        Browse community recipes by one pantry ingredient. These are ideas from TheMealDB, not recipes saved in your cookbook.
      </p>
      {favoriteRecipes.length > 0 && (
        <div className="favorite-inspiration" aria-live="polite">
          <strong>Inspired by your favorites</strong>
          <span>{favoriteRecipes.slice(0, 4).join(' · ')}</span>
          <small>Search one of these ingredient ideas to discover related dishes. Catalog results are not inferred to be similar to your personal recipes.</small>
        </div>
      )}
      <form className="collection-controls discovery-search" onSubmit={(event) => void searchMeals(event)}>
        <label className="search-control">
          <Search aria-hidden="true" />
          <span className="sr-only">Search catalog by one ingredient</span>
          <input
            minLength={2}
            maxLength={60}
            required
            value={ingredient}
            onChange={(event) => setIngredient(event.target.value)}
            placeholder="Try tomato, chicken, or lentils"
          />
        </label>
        <button className="primary-button" type="submit" disabled={isLoading}>
          <Search aria-hidden="true" /> {isLoading ? 'Searching…' : 'Find recipes'}
        </button>
      </form>
      {isLoading && <p className="loading-state" role="status">Searching TheMealDB…</p>}
      {error && <p className="form-error discovery-error" role="alert">{error}</p>}
      {!isLoading && searched && !error && recommendations.length === 0 && (
        <div className="empty-state compact-empty">
          <span className="empty-illustration"><ChefHat aria-hidden="true" /></span>
          <h3>No catalog recipes found for that ingredient.</h3>
          <p>Try another ingredient or check the spelling.</p>
        </div>
      )}
      {!isLoading && recommendations.length > 0 && (
        <div className="recipe-grid discovery-grid">
          {recommendations.map((recipe) => (
            <article className="recipe-card discovery-card" key={recipe.id}>
              <button className="recipe-card-open" type="button" onClick={() => void openMeal(recipe)} aria-label={`View ${recipe.name}`}>
                <div className="recipe-card-image">
                  {recipe.imageUrl && <img src={recipe.imageUrl} alt="" loading="lazy" />}
                </div>
                <div className="recipe-card-content">
                  <div className="recipe-card-heading"><h3>{recipe.name}</h3></div>
                  <p>Recipe from TheMealDB</p>
                  <span className="catalog-open-link">See ingredients and method <ArrowUpRight aria-hidden="true" /></span>
                </div>
              </button>
            </article>
          ))}
        </div>
      )}
      <p className="data-attribution">
        Recipe data and imagery: <a href="https://www.themealdb.com/" target="_blank" rel="noreferrer">TheMealDB</a>.
        This public web deployment uses its development key; production and public-service use may require a paid key.
      </p>
      {selectedMeal && (
        <Suspense fallback={<div className="dialog-backdrop"><p role="status">Loading recipe details…</p></div>}>
          <MealDetailsView meal={selectedMeal} onClose={() => setSelectedMeal(null)} />
        </Suspense>
      )}
    </section>
  )
}
