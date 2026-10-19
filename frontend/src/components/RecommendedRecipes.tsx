import { ArrowUpRight, ChefHat, Search } from 'lucide-react'
import { lazy, Suspense, useEffect, useState, type FormEvent } from 'react'
import { translate, translateError, type Locale } from '../lib/locale'
import type { MealCard, MealDetails } from '../types/food'
import type { Recipe, RecipeDraft } from '../types/recipe'

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
  locale: Locale
  savedRecipes: Recipe[]
  onSaveRecipe: (draft: RecipeDraft) => Promise<boolean>
}

export function RecommendedRecipes({ favoriteRecipes, locale, savedRecipes, onSaveRecipe }: RecommendedRecipesProps) {
  const t = (key: string) => translate(locale, key)
  const isPortugueseCatalog = locale === 'pt-BR'
  const catalogEndpoint = isPortugueseCatalog ? '/api/receitas' : '/api/mealdb'
  const catalogUrl = isPortugueseCatalog
    ? 'https://github.com/DenilsonRabelo/API-receitas'
    : 'https://www.themealdb.com/'
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
      const response = await fetch(`${catalogEndpoint}?ingredient=${encodeURIComponent(ingredient.trim())}`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(12_000),
      })
      const result: unknown = await response.json()
      if (!response.ok) {
        throw new Error(
          result && typeof result === 'object' && 'error' in result && typeof result.error === 'string'
            ? result.error
            : t('discoveryCatalogError'),
        )
      }
      if (!result || typeof result !== 'object' || !('recipes' in result) || !Array.isArray(result.recipes)) {
        throw new Error(t('discoveryInvalidResponse'))
      }
      if (!result.recipes.every(isMealCard)) throw new Error(t('discoveryInvalidResponse'))
      setRecipes(result.recipes)
    } catch (reason) {
      setError(reason instanceof Error ? translateError(locale, reason.message) : t('discoveryCatalogError'))
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
      const response = await fetch(`${catalogEndpoint}?id=${encodeURIComponent(recipe.id)}`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(12_000),
      })
      const result: unknown = await response.json()
      if (!response.ok) {
        throw new Error(
          result && typeof result === 'object' && 'error' in result && typeof result.error === 'string'
            ? result.error
            : t('discoveryDetailUnavailable'),
        )
      }
      if (!result || typeof result !== 'object' || !('meal' in result)) {
        throw new Error(t('discoveryInvalidResponse'))
      }
      if (!isMealDetails(result.meal)) throw new Error(t('discoveryInvalidDetails'))
      setSelectedMeal(result.meal)
    } catch (reason) {
      setSelectedMeal(null)
      setError(reason instanceof Error ? translateError(locale, reason.message) : t('discoveryDetailUnavailable'))
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
      {isPortugueseCatalog && <p className="locale-data-notice">{t('englishMealDb')}</p>}
      <div className="collection-heading">
        <div>
          <p className="eyebrow">{t('mealCatalog')}</p>
          <h2>{t('recipesExplore')}</h2>
        </div>
      </div>
      <p className="discovery-intro">
        {t('discoveryIntro')}
      </p>
      {favoriteRecipes.length > 0 && (
        <div className="favorite-inspiration" aria-live="polite">
          <strong>{t('inspiredFavorites')}</strong>
          <span>{favoriteRecipes.slice(0, 4).join(' · ')}</span>
          <small>{t('inspiredCopy')}</small>
        </div>
      )}
      <form className="collection-controls discovery-search" onSubmit={(event) => void searchMeals(event)}>
        <label className="search-control">
          <Search aria-hidden="true" />
          <span className="sr-only">{t('catalogSearch')}</span>
          <input
            minLength={2}
            maxLength={60}
            required
            value={ingredient}
            onChange={(event) => setIngredient(event.target.value)}
            placeholder={t('tryIngredients')}
          />
        </label>
        <button className="primary-button" type="submit" disabled={isLoading}>
          <Search aria-hidden="true" /> {isLoading ? t('searching') : t('findRecipes')}
        </button>
      </form>
      {isLoading && <p className="loading-state" role="status">{t('searchingMealDb')}</p>}
      {error && <p className="form-error discovery-error" role="alert">{error}</p>}
      {!isLoading && searched && !error && recommendations.length === 0 && (
        <div className="empty-state compact-empty">
          <span className="empty-illustration"><ChefHat aria-hidden="true" /></span>
          <h3>{t('noCatalogResults')}</h3>
          <p>{t('tryAnotherIngredient')}</p>
        </div>
      )}
      {!isLoading && recommendations.length > 0 && (
        <div className="recipe-grid discovery-grid">
          {recommendations.map((recipe) => (
            <article className="recipe-card discovery-card" key={recipe.id}>
              <button className="recipe-card-open" type="button" onClick={() => void openMeal(recipe)} aria-label={t('viewRecipe').replace('{name}', recipe.name)}>
                <div className="recipe-card-image">
                  {recipe.imageUrl && <img src={recipe.imageUrl} alt="" loading="lazy" />}
                </div>
                <div className="recipe-card-content">
                  <div className="recipe-card-heading"><h3>{recipe.name}</h3></div>
                  <p>{t('mealDbRecipe')}</p>
                  <span className="catalog-open-link">{t('seeIngredientsMethod')} <ArrowUpRight aria-hidden="true" /></span>
                </div>
              </button>
            </article>
          ))}
        </div>
      )}
      <p className="data-attribution">
        {t('mealDbAttribution')} <a href={catalogUrl} target="_blank" rel="noreferrer">{t('recipeCatalogProvider')}</a>.
        {' '}{t('mealDbLicenseNotice')}
      </p>
      {selectedMeal && (
        <Suspense fallback={<div className="dialog-backdrop"><p role="status">{t('loadingDetails')}</p></div>}>
          <MealDetailsView
            meal={selectedMeal}
            locale={locale}
            isSaved={savedRecipes.some((recipe) =>
              recipe.sourceUrl === selectedMeal.sourceUrl ||
              recipe.title.trim().toLocaleLowerCase() === selectedMeal.name.trim().toLocaleLowerCase())}
            onSaveRecipe={onSaveRecipe}
            onClose={() => setSelectedMeal(null)}
          />
        </Suspense>
      )}
    </section>
  )
}
