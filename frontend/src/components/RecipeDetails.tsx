import { Clock3, ExternalLink, Heart, Pencil, Users, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { formatScaledQuantity } from '../lib/recipes'
import { translate, translateError, type Locale } from '../lib/locale'
import type { Recipe } from '../types/recipe'

interface RecipeDetailsProps {
  locale: Locale
  recipe: Recipe
  errorMessage: string
  onClose: () => void
  onEdit: (recipe: Recipe) => void
  onDelete: (recipe: Recipe) => void
  onToggleFavorite: (recipe: Recipe) => void
}

export function RecipeDetails({ locale, recipe, errorMessage, onClose, onEdit, onDelete, onToggleFavorite }: RecipeDetailsProps) {
  const t = (key: string) => translate(locale, key)
  const [servings, setServings] = useState(recipe.servings)
  const [checkedIngredients, setCheckedIngredients] = useState<Set<string>>(new Set())
  const [imageFailed, setImageFailed] = useState(false)

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className="dialog-backdrop" role="presentation">
      <article className="recipe-detail-dialog" role="dialog" aria-modal="true" aria-labelledby="recipe-detail-title">
        <button className="icon-button detail-close" type="button" aria-label={t('closeDetails')} onClick={onClose}>
          <X aria-hidden="true" />
        </button>
        <div className="detail-image">
          {recipe.imageUrl && !imageFailed ? (
            <img src={recipe.imageUrl} alt="" onError={() => setImageFailed(true)} />
          ) : (
            <span className="image-placeholder" aria-hidden="true"><span>{recipe.category.slice(0, 1) || 'R'}</span></span>
          )}
          <span className="category-pill">{recipe.category}</span>
        </div>
        <div className="detail-content">
          {errorMessage && <p className="form-error" role="alert">{translateError(locale, errorMessage)}</p>}
          <div className="detail-heading">
            <div>
              <p className="eyebrow">{t(recipe.difficulty.toLowerCase())} · {recipe.prepTimeMinutes + recipe.cookTimeMinutes} min {t('total')}</p>
              <h2 id="recipe-detail-title">{recipe.title}</h2>
            </div>
            <button
              className={`favorite-button detail-favorite ${recipe.isFavorite ? 'is-favorite' : ''}`}
              type="button"
              aria-label={t(recipe.isFavorite ? 'removeFavorites' : 'addFavorites')}
              aria-pressed={recipe.isFavorite}
              onClick={() => onToggleFavorite(recipe)}
            >
              <Heart aria-hidden="true" />
            </button>
          </div>
          {recipe.description && <p className="detail-description">{recipe.description}</p>}
          <div className="detail-meta">
            <span><Clock3 aria-hidden="true" /> {t('prep')} {recipe.prepTimeMinutes} min</span>
            <span><Clock3 aria-hidden="true" /> {t('cook')} {recipe.cookTimeMinutes} min</span>
            <label className="servings-control">
              <Users aria-hidden="true" />
              <span>{t('serves')}</span>
              <input type="number" min="1" max="100" step="1" aria-label={t('servingsAria')} value={servings} onChange={(event) => setServings(Math.min(100, Math.max(1, Number(event.target.value) || 1)))} />
            </label>
          </div>

          {recipe.tags.length > 0 && (
            <ul className="tag-list" aria-label="Recipe tags">
              {recipe.tags.map((tag) => <li key={tag}>{tag}</li>)}
            </ul>
          )}

          <section className="detail-section">
            <div className="detail-section-heading">
              <h3>{t('ingredientsTitle')}</h3>
              <span>{checkedIngredients.size}/{recipe.ingredients.length} {t('checked')}</span>
            </div>
            <ul className="ingredient-checklist">
              {recipe.ingredients.map((ingredient) => {
                const checked = checkedIngredients.has(ingredient.id)
                const quantity = formatScaledQuantity(ingredient, servings, recipe.servings)
                const amount = [quantity, ingredient.unit].filter(Boolean).join(' ')
                return (
                  <li key={ingredient.id} className={checked ? 'ingredient-checked' : ''}>
                    <label>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => setCheckedIngredients((current) => {
                          const next = new Set(current)
                          if (event.target.checked) next.add(ingredient.id)
                          else next.delete(ingredient.id)
                          return next
                        })}
                      />
                      <span>{amount && <strong>{amount} </strong>}{ingredient.name}{ingredient.optional && <small> {t('optional')}</small>}</span>
                    </label>
                  </li>
                )
              })}
            </ul>
          </section>

          <section className="detail-section">
            <h3>{t('method')}</h3>
            <ol className="method-list">
              {recipe.instructions.map((instruction, index) => (
                <li key={instruction.id}>
                  <span className="instruction-number">{index + 1}</span>
                  <p>{instruction.text}</p>
                </li>
              ))}
            </ol>
          </section>
          <div className="detail-actions">
            {recipe.sourceUrl && <a className="text-button source-link" href={recipe.sourceUrl} target="_blank" rel="noreferrer"><ExternalLink aria-hidden="true" /> {t('originalRecipe')}</a>}
            <div>
              <button className="secondary-button" type="button" onClick={() => onEdit(recipe)}><Pencil aria-hidden="true" /> {t('edit')}</button>
              <button className="delete-button" type="button" onClick={() => onDelete(recipe)}>{t('delete')}</button>
            </div>
          </div>
        </div>
      </article>
    </div>
  )
}
