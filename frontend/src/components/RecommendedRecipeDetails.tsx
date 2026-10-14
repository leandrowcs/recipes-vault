import { Check, ExternalLink, Plus, X } from 'lucide-react'
import { useState } from 'react'
import { translate, type Locale } from '../lib/locale'
import type { MealDetails } from '../types/food'
import type { RecipeDraft } from '../types/recipe'

interface RecommendedRecipeDetailsProps {
  locale: Locale
  meal: MealDetails
  isSaved: boolean
  onSaveRecipe: (draft: RecipeDraft) => Promise<boolean>
  onClose: () => void
}

export function RecommendedRecipeDetails({ meal, locale, isSaved, onSaveRecipe, onClose }: RecommendedRecipeDetailsProps) {
  const t = (key: string) => translate(locale, key)
  const [isSaving, setIsSaving] = useState(false)
  const [hasSaved, setHasSaved] = useState(false)
  const [saveError, setSaveError] = useState('')
  const recipeIsSaved = isSaved || hasSaved
  const canSave = meal.ingredients.length > 0 && Boolean(meal.instructions.trim())

  async function saveRecipe() {
    if (!canSave || recipeIsSaved || isSaving) return
    setIsSaving(true)
    setSaveError('')
    try {
      const saved = await onSaveRecipe({
        title: meal.name,
        description: '',
        imageUrl: meal.imageUrl,
        sourceUrl: meal.sourceUrl,
        servings: 2,
        prepTimeMinutes: 0,
        cookTimeMinutes: 0,
        difficulty: 'Easy',
        category: meal.category || 'Other',
        tags: meal.area ? [meal.area] : [],
        ingredients: meal.ingredients.map((ingredient) => ({
          id: crypto.randomUUID(),
          name: ingredient.name,
          quantityText: ingredient.measure,
          quantity: null,
          unit: '',
          optional: false,
        })),
        instructions: meal.instructions
          .split(/\r?\n+/)
          .map((text) => text.trim())
          .filter(Boolean)
          .map((text) => ({ id: crypto.randomUUID(), text })),
      })
      if (saved) setHasSaved(true)
      else setSaveError(t('catalogSaveFailed'))
    } catch {
      setSaveError(t('catalogSaveFailed'))
    } finally {
      setIsSaving(false)
    }
  }

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
          <p className="catalog-data-warning" role="note">{t('catalogDataWarning')}</p>
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
            <button
              className="primary-button"
              type="button"
              disabled={!canSave || recipeIsSaved || isSaving}
              onClick={() => void saveRecipe()}
            >
              {recipeIsSaved ? <Check aria-hidden="true" /> : <Plus aria-hidden="true" />}
              {isSaving ? t('savingCatalogRecipe') : recipeIsSaved ? t('recipeInCollection') : t('addToCollection')}
            </button>
            <button className="secondary-button" type="button" onClick={onClose}>{t('close')}</button>
          </div>
          {saveError && <p className="form-error" role="alert">{saveError}</p>}
          <p className="data-attribution">{t('recipeImageCredits')} <a href="https://www.themealdb.com/" target="_blank" rel="noreferrer">TheMealDB</a> {t('originalSource')}</p>
        </div>
      </section>
    </div>
  )
}
