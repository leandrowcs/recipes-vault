import { Clock3, Heart, Users } from 'lucide-react'
import { useState } from 'react'
import type { Recipe } from '../types/recipe'

interface RecipeCardProps {
  recipe: Recipe
  onOpen: (recipe: Recipe) => void
  onToggleFavorite: (recipe: Recipe) => void
}

export function RecipeCard({ recipe, onOpen, onToggleFavorite }: RecipeCardProps) {
  const [imageFailed, setImageFailed] = useState(false)
  const totalTime = recipe.prepTimeMinutes + recipe.cookTimeMinutes

  return (
    <article className="recipe-card">
      <button
        className="recipe-card-open"
        type="button"
        onClick={() => onOpen(recipe)}
        aria-label={`View ${recipe.title}`}
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
            <span className="difficulty-label">{recipe.difficulty}</span>
          </div>
          <p>{recipe.description || 'A new favorite for your table.'}</p>
          <div className="recipe-meta">
            <span><Clock3 aria-hidden="true" /> {totalTime} min</span>
            <span><Users aria-hidden="true" /> {recipe.servings} servings</span>
          </div>
        </div>
      </button>
      <button
        className={`favorite-button ${recipe.isFavorite ? 'is-favorite' : ''}`}
        type="button"
        aria-label={recipe.isFavorite ? `Remove ${recipe.title} from favorites` : `Add ${recipe.title} to favorites`}
        aria-pressed={recipe.isFavorite}
        onClick={() => onToggleFavorite(recipe)}
      >
        <Heart aria-hidden="true" />
      </button>
    </article>
  )
}
