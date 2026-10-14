import { ExternalLink, X } from 'lucide-react'
import type { MealDetails } from '../types/food'

interface RecommendedRecipeDetailsProps {
  meal: MealDetails
  onClose: () => void
}

export function RecommendedRecipeDetails({ meal, onClose }: RecommendedRecipeDetailsProps) {
  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <section
        className="recipe-detail-dialog recommended-detail-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="recommended-recipe-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button className="icon-button detail-close" type="button" aria-label="Close recipe details" onClick={onClose}>
          <X aria-hidden="true" />
        </button>
        {meal.imageUrl && <div className="detail-image"><img src={meal.imageUrl} alt="" /></div>}
        <div className="detail-content">
          {meal.category && <p className="eyebrow">{[meal.area, meal.category].filter(Boolean).join(' · ')}</p>}
          <div className="detail-heading"><h2 id="recommended-recipe-title">{meal.name}</h2></div>
          {!meal.instructions && meal.ingredients.length === 0 ? (
            <p className="loading-state" role="status">Loading recipe details…</p>
          ) : (
            <>
              {meal.ingredients.length > 0 && (
                <section className="detail-section">
                  <h3>Ingredients</h3>
                  <ul className="recommended-ingredients">
                    {meal.ingredients.map((ingredient, index) => (
                      <li key={`${ingredient.name}-${index}`}>
                        <span>{ingredient.measure || 'As needed'}</span> {ingredient.name}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {meal.instructions && (
                <section className="detail-section">
                  <h3>Method</h3>
                  <p className="recommended-instructions">{meal.instructions}</p>
                </section>
              )}
            </>
          )}
          <div className="detail-actions">
            <a className="secondary-button source-link" href={meal.sourceUrl} target="_blank" rel="noreferrer">
              <ExternalLink aria-hidden="true" /> Original recipe
            </a>
            <button className="secondary-button" type="button" onClick={onClose}>Close</button>
          </div>
          <p className="data-attribution">Recipe and image credits: <a href="https://www.themealdb.com/" target="_blank" rel="noreferrer">TheMealDB</a> and the original recipe source.</p>
        </div>
      </section>
    </div>
  )
}
