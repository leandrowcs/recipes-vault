import { Plus, Trash2, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { parseIngredientQuantity } from '../lib/recipes'
import { translate, translateError, type Locale } from '../lib/locale'
import type { Recipe, RecipeDifficulty, RecipeDraft } from '../types/recipe'

interface IngredientFields {
  name: string
  quantityText: string
  unit: string
  optional: boolean
}

interface RecipeFormProps {
  locale: Locale
  recipe: Recipe | null
  initialDraft: RecipeDraft | null
  saveError: string
  onClose: () => void
  onSave: (draft: RecipeDraft) => Promise<boolean>
}

const blankIngredient = (): IngredientFields => ({
  name: '',
  quantityText: '',
  unit: '',
  optional: false,
})

export function RecipeForm({ locale, recipe, initialDraft, saveError, onClose, onSave }: RecipeFormProps) {
  const t = (key: string) => translate(locale, key)
  const values = recipe ?? initialDraft
  const [title, setTitle] = useState(values?.title ?? '')
  const [description, setDescription] = useState(values?.description ?? '')
  const [imageUrl, setImageUrl] = useState(values?.imageUrl ?? '')
  const [sourceUrl, setSourceUrl] = useState(values?.sourceUrl ?? '')
  const [category, setCategory] = useState(values?.category ?? '')
  const [tags, setTags] = useState(values?.tags.join(', ') ?? '')
  const [servings, setServings] = useState(String(values?.servings ?? 2))
  const [prepTimeMinutes, setPrepTimeMinutes] = useState(String(values?.prepTimeMinutes ?? 0))
  const [cookTimeMinutes, setCookTimeMinutes] = useState(String(values?.cookTimeMinutes ?? 0))
  const [difficulty, setDifficulty] = useState<RecipeDifficulty>(values?.difficulty ?? 'Easy')
  const [ingredients, setIngredients] = useState<IngredientFields[]>(
    values
      ? values.ingredients.map(({ name, quantityText, unit, optional }) => ({
          name,
          quantityText,
          unit,
          optional,
        }))
      : [blankIngredient()],
  )
  const [instructions, setInstructions] = useState(values?.instructions.map(({ text }) => text) ?? [''])
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  function updateIngredient(index: number, patch: Partial<IngredientFields>) {
    setIngredients((current) =>
      current.map((ingredient, currentIndex) =>
        currentIndex === index ? { ...ingredient, ...patch } : ingredient,
      ),
    )
  }

  function updateInstruction(index: number, value: string) {
    setInstructions((current) => current.map((step, currentIndex) => currentIndex === index ? value : step))
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')

    const servingsValue = Number(servings)
    const prepValue = Number(prepTimeMinutes)
    const cookValue = Number(cookTimeMinutes)
    const validUrl = (value: string) => {
      if (!value) return true
      try {
        return ['http:', 'https:'].includes(new URL(value).protocol)
      } catch {
        return false
      }
    }

    if (!title.trim() || !category.trim()) {
      setError(t('validationNameCategory'))
      return
    }
    if (!Number.isInteger(servingsValue) || servingsValue < 1) {
      setError(t('validationServings'))
      return
    }
    if (
      !Number.isInteger(prepValue) || prepValue < 0 ||
      !Number.isInteger(cookValue) || cookValue < 0
    ) {
      setError(t('validationTimes'))
      return
    }
    if (!validUrl(imageUrl.trim()) || !validUrl(sourceUrl.trim())) {
      setError(t('validationUrls'))
      return
    }

    const savedIngredients = ingredients
      .filter((ingredient) => ingredient.name.trim())
      .map((ingredient) => ({
        id: crypto.randomUUID(),
        name: ingredient.name.trim(),
        quantityText: ingredient.quantityText.trim(),
        quantity: parseIngredientQuantity(ingredient.quantityText),
        unit: ingredient.unit.trim(),
        optional: ingredient.optional,
      }))
    const savedInstructions = instructions
      .filter((step) => step.trim())
      .map((text) => ({ id: crypto.randomUUID(), text: text.trim() }))

    if (!savedIngredients.length || !savedInstructions.length) {
      setError(t('validationIngredients'))
      return
    }

    setIsSaving(true)
    try {
      const saved = await onSave({
        title: title.trim(),
        description: description.trim(),
        imageUrl: imageUrl.trim(),
        sourceUrl: sourceUrl.trim(),
        servings: servingsValue,
        prepTimeMinutes: prepValue,
        cookTimeMinutes: cookValue,
        difficulty,
        category: category.trim(),
        tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean),
        ingredients: savedIngredients,
        instructions: savedInstructions,
      })
      if (saved) onClose()
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <section className="recipe-form-dialog" role="dialog" aria-modal="true" aria-labelledby="recipe-form-title">
        <div className="dialog-heading">
          <div>
            <p className="eyebrow">{t(recipe ? 'editMakeYours' : initialDraft ? 'reviewSaving' : 'addCollection')}</p>
            <h2 id="recipe-form-title">{t(recipe ? 'editRecipe' : initialDraft ? 'reviewImported' : 'newRecipe')}</h2>
          </div>
          <button className="icon-button" type="button" aria-label={t('closeForm')} onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </div>
        <form className="recipe-form" onSubmit={(event) => void submit(event)}>
          <div className="form-grid">
            <label className="form-field form-field-wide">
              <span>{t('recipeName')}</span>
              <input autoFocus required value={title} onChange={(event) => setTitle(event.target.value)} placeholder={t('recipeExample')} />
            </label>
            <label className="form-field form-field-wide">
              <span>{t('shortDescription')}</span>
              <textarea rows={2} value={description} onChange={(event) => setDescription(event.target.value)} placeholder={t('descriptionPrompt')} />
            </label>
            <label className="form-field">
              <span>{t('category')}</span>
              <input required value={category} onChange={(event) => setCategory(event.target.value)} placeholder={t('categoryExample')} />
            </label>
            <label className="form-field">
              <span>{t('tags')} <small>{t('separateCommas')}</small></span>
              <input value={tags} onChange={(event) => setTags(event.target.value)} placeholder={t('tagsExample')} />
            </label>
            <label className="form-field">
              <span>{t('servings')}</span>
              <input type="number" min="1" step="1" required value={servings} onChange={(event) => setServings(event.target.value)} />
            </label>
            <label className="form-field">
              <span>{t('prepTime')} <small>{t('minutes')}</small></span>
              <input type="number" min="0" step="1" value={prepTimeMinutes} onChange={(event) => setPrepTimeMinutes(event.target.value)} />
            </label>
            <label className="form-field">
              <span>{t('cookTime')} <small>{t('minutes')}</small></span>
              <input type="number" min="0" step="1" value={cookTimeMinutes} onChange={(event) => setCookTimeMinutes(event.target.value)} />
            </label>
            <label className="form-field">
              <span>{t('difficulty')}</span>
              <select value={difficulty} onChange={(event) => setDifficulty(event.target.value as RecipeDifficulty)}>
                <option value="Easy">{t('easy')}</option>
                <option value="Medium">{t('medium')}</option>
                <option value="Hard">{t('hard')}</option>
              </select>
            </label>
            <label className="form-field form-field-wide">
              <span>{t('imageUrl')} <small>{t('optional')}</small></span>
              <input type="url" value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} placeholder="https://" />
            </label>
            <label className="form-field form-field-wide">
              <span>{t('sourceRecipeUrl')} <small>{t('optional')}</small></span>
              <input type="url" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://" />
            </label>
          </div>

          <fieldset className="editor-section">
            <legend>{t('ingredientsTitle')}</legend>
            <p className="section-hint">{t('editorIngredientsHint')}</p>
            <div className="ingredient-editor-list">
              {ingredients.map((ingredient, index) => (
                <div className="ingredient-editor-row" key={index}>
                  <label>
                    <span className="sr-only">{t('ingredientQuantity').replace('{n}', String(index + 1))}</span>
                    <input value={ingredient.quantityText} onChange={(event) => updateIngredient(index, { quantityText: event.target.value })} placeholder={t('quantityExample')} />
                  </label>
                  <label>
                    <span className="sr-only">{t('ingredientUnit').replace('{n}', String(index + 1))}</span>
                    <input value={ingredient.unit} onChange={(event) => updateIngredient(index, { unit: event.target.value })} placeholder={t('unitExample')} />
                  </label>
                  <label className="ingredient-name-field">
                    <span className="sr-only">{t('ingredient')} {index + 1}</span>
                    <input value={ingredient.name} onChange={(event) => updateIngredient(index, { name: event.target.value })} placeholder={t('ingredientExample')} />
                  </label>
                  <label className="optional-control">
                    <input type="checkbox" checked={ingredient.optional} onChange={(event) => updateIngredient(index, { optional: event.target.checked })} />
                    <span>{t('optional')}</span>
                  </label>
                  <button className="icon-button danger-icon" type="button" aria-label={t('removeIngredient').replace('{n}', String(index + 1))} disabled={ingredients.length === 1} onClick={() => setIngredients((current) => current.filter((_, currentIndex) => currentIndex !== index))}>
                    <Trash2 aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
            <button className="text-button" type="button" onClick={() => setIngredients((current) => [...current, blankIngredient()])}>
              <Plus aria-hidden="true" /> {t('addIngredient')}
            </button>
          </fieldset>

          <fieldset className="editor-section">
            <legend>{t('method')}</legend>
            <div className="instruction-editor-list">
              {instructions.map((step, index) => (
                <div className="instruction-editor-row" key={index}>
                  <span className="instruction-number">{index + 1}</span>
                  <label>
                    <span className="sr-only">{t('cookingStep').replace('{n}', String(index + 1))}</span>
                    <textarea rows={2} value={step} onChange={(event) => updateInstruction(index, event.target.value)} placeholder={t('describeStep')} />
                  </label>
                  <button className="icon-button danger-icon" type="button" aria-label={t('removeStep').replace('{n}', String(index + 1))} disabled={instructions.length === 1} onClick={() => setInstructions((current) => current.filter((_, currentIndex) => currentIndex !== index))}>
                    <Trash2 aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
            <button className="text-button" type="button" onClick={() => setInstructions((current) => [...current, ''])}>
              <Plus aria-hidden="true" /> {t('addStep')}
            </button>
          </fieldset>

          {(error || saveError) && <p className="form-error" role="alert">{error || translateError(locale, saveError)}</p>}
          <div className="form-actions">
            <button className="secondary-button" type="button" onClick={onClose}>{t('cancel')}</button>
            <button className="primary-button" type="submit" disabled={isSaving}>{isSaving ? t('saving') : recipe ? t('saveChanges') : t('saveRecipe')}</button>
          </div>
        </form>
      </section>
    </div>
  )
}
