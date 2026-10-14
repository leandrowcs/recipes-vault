import { Package, Plus, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import type { PantryItem, PantryItemDraft } from '../types/pantry'
import { translate, translateError, type Locale } from '../lib/locale'

interface PantryViewProps {
  locale: Locale
  items: PantryItem[]
  isLoading: boolean
  error: string
  onAdd: (draft: PantryItemDraft) => Promise<boolean>
  onDelete: (item: PantryItem) => Promise<void>
}

export function PantryView({ locale, items, isLoading, error, onAdd, onDelete }: PantryViewProps) {
  const t = (key: string) => translate(locale, key)
  const [name, setName] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [unit, setUnit] = useState('')
  const [expirationDate, setExpirationDate] = useState('')
  const [notes, setNotes] = useState('')
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [today] = useState(() => new Date().toISOString().slice(0, 10))

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError('')
    const quantityValue = Number(quantity)
    if (!name.trim() || !Number.isFinite(quantityValue) || quantityValue < 0) {
      setFormError(t('pantryValidation'))
      return
    }

    setSaving(true)
    try {
      const saved = await onAdd({
        name: name.trim(),
        quantity: quantityValue,
        unit: unit.trim(),
        expirationDate,
        notes: notes.trim(),
      })
      if (saved) {
        setName('')
        setQuantity('1')
        setUnit('')
        setExpirationDate('')
        setNotes('')
      }
    } catch {
      setFormError(t('pantrySaveError'))
    } finally {
      setSaving(false)
    }
  }

  const sortedItems = [...items].sort((left, right) => {
    if (!left.expirationDate) return right.expirationDate ? 1 : left.name.localeCompare(right.name)
    if (!right.expirationDate) return -1
    return left.expirationDate.localeCompare(right.expirationDate)
  })

  return (
    <section className="collection-section pantry-section">
      <div className="collection-heading">
        <div>
          <p className="eyebrow">{t('pantryHeading')}</p>
          <h2>{t('pantry')}</h2>
        </div>
        <span className="pantry-count">{items.length} {items.length === 1 ? t('item') : t('items')}</span>
      </div>

      <form className="pantry-form" onSubmit={(event) => void submit(event)}>
        <label className="form-field pantry-name">
          <span>{t('ingredientName')}</span>
          <input required value={name} onChange={(event) => setName(event.target.value)} placeholder={t('pantryExample')} />
        </label>
        <label className="form-field pantry-quantity">
          <span>{t('pantryQuantity')}</span>
          <input type="number" min="0" step="any" required value={quantity} onChange={(event) => setQuantity(event.target.value)} />
        </label>
        <label className="form-field pantry-unit">
          <span>{t('pantryUnit')}</span>
          <input value={unit} onChange={(event) => setUnit(event.target.value)} placeholder={t('pantryUnitsExample')} />
        </label>
        <label className="form-field pantry-expiry">
          <span>{t('bestBefore')} <small>{t('optional')}</small></span>
          <input type="date" value={expirationDate} onChange={(event) => setExpirationDate(event.target.value)} />
        </label>
        <label className="form-field pantry-notes">
          <span>{t('notes')} <small>{t('optional')}</small></span>
          <input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder={t('whereStored')} />
        </label>
        <button className="primary-button pantry-submit" type="submit" disabled={saving || isLoading}>
          <Plus aria-hidden="true" /> {saving ? t('savingIngredient') : t('addIngredientAction')}
        </button>
      </form>
      {(formError || error) && <p className="form-error pantry-error" role="alert">{formError || translateError(locale, error)}</p>}

      {isLoading ? (
        <div className="loading-state" role="status">{t('pantryLoading')}</div>
      ) : sortedItems.length > 0 ? (
        <ul className="pantry-list">
          {sortedItems.map((item) => (
            <li className="pantry-item" key={item.id}>
              <span className="pantry-item-icon"><Package aria-hidden="true" /></span>
              <div className="pantry-item-main">
                <strong>{item.name}</strong>
                {item.notes && <p>{item.notes}</p>}
              </div>
              <span className="pantry-item-quantity">{item.quantity} {item.unit}</span>
              <span className={`pantry-item-expiry ${item.expirationDate && item.expirationDate < today ? 'expired' : ''}`}>
                {item.expirationDate ? `${t('bestBefore')} ${item.expirationDate}` : t('noExpiry')}
              </span>
              <button className="icon-button danger-icon" type="button" aria-label={t('removeFromPantry').replace('{name}', item.name)} onClick={() => void onDelete(item)}>
                <Trash2 aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="empty-state compact-empty pantry-empty">
          <span className="empty-illustration"><Package aria-hidden="true" /></span>
          <h3>{t('pantryEmptyTitle')}</h3>
          <p>{t('pantryEmptyCopy')}</p>
        </div>
      )}
    </section>
  )
}
