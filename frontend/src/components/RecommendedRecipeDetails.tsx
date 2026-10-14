import { ExternalLink, X } from 'lucide-react'
import { translate, type Locale } from '../lib/locale'
import type { MealDetails } from '../types/food'

interface RecommendedRecipeDetailsProps {
  locale: Locale
  meal: MealDetails
  onClose: () => void
}

export function RecommendedRecipeDetails({ meal, locale, onClose }: RecommendedRecipeDetailsProps) {
  const t = (key: string) => translate(locale, key)
  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <section
        className="recipe-detail-dialog recommended-detail-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="recommended-recipe-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button className="icon-button detail-close" type="button" aria-label={t('closeDetails')} onClick={onClose}>
          <X aria-hidden="true" />
        </button>
        {meal.imageUrl && <div className="detail-image"><img src={meal.imageUrl} alt="" /></div>}
        <div className="detail-content">
          {meal.category && <p className="eyebrow">{[meal.area, meal.category].filter(Boolean).join(' · ')}</p>}
          <div className="detail-heading"><h2 id="recommended-recipe-title">{meal.name}</h2></div>
          {!meal.instructions && meal.ingredients.length === 0 ? (
            <p className="loading-state" role="status">{t('loadingDetails')}</p>
          ) : (
            <>
              {meal.ingredients.length > 0 && (
                <section className="detail-section">
                  <h3>{t('ingredientsTitle')}</h3>
                  <ul className="recommended-ingredients">
                    {meal.ingredients.map((ingredient, index) => (
                      <li key={`${ingredient.name}-${index}`}>
                        <span>{ingredient.measure || t('asNeeded')}</span> {ingredient.name}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {meal.instructions && (
                <section className="detail-section">
                  <h3>{t('method')}</h3>
                  <p className="recommended-instructions">{meal.instructions}</p>
                </section>
              )}
            </>
          )}
          <div className="detail-actions">
            <a className="secondary-button source-link" href={meal.sourceUrl} target="_blank" rel="noreferrer">
              <ExternalLink aria-hidden="true" /> {t('originalRecipe')}
            </a>
            <button className="secondary-button" type="button" onClick={onClose}>{t('close')}</button>
          </div>
          <p className="data-attribution">{t('recipeImageCredits')} <a href="https://www.themealdb.com/" target="_blank" rel="noreferrer">TheMealDB</a> {t('originalSource')}</p>
        </div>
      </section>
    </div>
  )
}
