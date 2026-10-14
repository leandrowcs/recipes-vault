import { Clock3, Heart, Users } from 'lucide-react'
import { useState } from 'react'
import { translate, type Locale } from '../lib/locale'
import type { Recipe } from '../types/recipe'

interface RecipeCardProps {
  locale: Locale
  recipe: Recipe
  onOpen: (recipe: Recipe) => void
  onToggleFavorite: (recipe: Recipe) => void
}

export function RecipeCard({ locale, recipe, onOpen, onToggleFavorite }: RecipeCardProps) {
  const t = (key: string) => translate(locale, key)
  const [imageFailed, setImageFailed] = useState(false)
  const totalTime = recipe.prepTimeMinutes + recipe.cookTimeMinutes

  return (
    <article className="recipe-card">
      <button
        className="recipe-card-open"
        type="button"
        onClick={() => onOpen(recipe)}
        aria-label={t('viewRecipe').replace('{name}', recipe.title)}
      >
        <div className="recipe-card-image">
          {recipe.imageUrl && !imageFailed ? (
            <img
              src={recipe.imageUrl}
              alt=""
              loading="lazy"
              onError={() => setImageFailed(true)}
            />
          ) : (
            <span className="image-placeholder" aria-hidden="true">
              <span>{recipe.category.slice(0, 1) || 'R'}</span>
            </span>
          )}
          <span className="category-pill">{recipe.category}</span>
        </div>
        <div className="recipe-card-content">
          <div className="recipe-card-heading">
            <h3>{recipe.title}</h3>
            <span className="difficulty-label">{t(recipe.difficulty.toLowerCase())}</span>
          </div>
          <p>{recipe.description || t('favoriteForTable')}</p>
          <div className="recipe-meta">
            <span><Clock3 aria-hidden="true" /> {totalTime} {t('minutesShort')}</span>
            <span><Users aria-hidden="true" /> {recipe.servings} {t('servingsShort')}</span>
          </div>
        </div>
      </button>
      <button
        className={`favorite-button ${recipe.isFavorite ? 'is-favorite' : ''}`}
        type="button"
        aria-label={(recipe.isFavorite ? t('unfavoriteRecipe') : t('favoriteRecipe')).replace('{title}', recipe.title)}
        aria-pressed={recipe.isFavorite}
        onClick={() => onToggleFavorite(recipe)}
      >
        <Heart aria-hidden="true" />
      </button>
    </article>
  )
}
