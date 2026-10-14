import { ExternalLink, X } from 'lucide-react'
import { translate, type Locale } from '../lib/locale'
import { assessNutrition, classifyFrontOfPack } from '../services/foodRatings'
import type { FoodProduct } from '../types/food'

interface FoodProductDetailsProps {
  locale: Locale
  product: FoodProduct
  onClose: () => void
}

export function FoodProductDetails({ locale, product, onClose }: FoodProductDetailsProps) {
  const t = (key: string) => translate(locale, key)
  const format = (value: number | null, unit: string) => value === null || !Number.isFinite(value)
    ? t('notProvided')
    : `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value)} ${unit}`
  const assessment = assessNutrition(product.nutrients)
  const levelLabels = {
    low: t('nutritionLow'),
    medium: t('nutritionMedium'),
    high: t('nutritionHigh'),
    'not-rated': t('nutritionNoData'),
  } as const
  const nutrientLabels: Record<string, string> = locale === 'pt-BR'
    ? { fat: 'Gordura total', saturatedFat: 'Gordura saturada', sugars: 'Açúcares totais', salt: 'Sal', protein: 'Proteína', fiber: 'Fibra' }
    : { fat: 'Total fat', saturatedFat: 'Saturated fat', sugars: 'Total sugars', salt: 'Salt', protein: 'Protein', fiber: 'Fiber' }
  const beverageThreshold = product.productType === 'beverage'
  const basis = product.nutritionBasis === 'unavailable'
    ? t('basisUnavailable')
    : `100 ${product.nutritionBasis === '100ml' ? 'ML' : 'G'}`
  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <section
        className="recipe-detail-dialog food-detail-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="food-product-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button className="icon-button detail-close" type="button" aria-label={t('close')} onClick={onClose}>
          <X aria-hidden="true" />
        </button>
        {product.imageUrl && <div className="detail-image food-detail-image"><img src={product.imageUrl} alt="" /></div>}
        <div className="detail-content">
          <p className="eyebrow">{t('nutritionLabel')} {basis}</p>
          <div className="detail-heading"><h2 id="food-product-title">{product.name || t('unnamedProduct')}</h2></div>
          {product.brand && <p className="detail-description">{product.brand}{product.quantity ? ` · ${product.quantity}` : ''}</p>}

          <section className="detail-section">
            <h3>{t('nutritionTraffic')}</h3>
            <p className="assessment-note">
              {t('ratingGuide')} {product.productType === 'unknown' ? t('categoryUnknown') : beverageThreshold ? t('beverage') : t('productFood')} {locale === 'pt-BR' ? 'pelo catálogo.' : 'in the catalog.'}
              {product.productType === 'unknown' && ` ${t('unknownNutrients')}`}
              {' '}{t('energyRating')}
            </p>
            <dl className="nutrient-rating-list">
              {assessment.ratings.map((rating) => {
                const limits = rating.key === 'fat'
                  ? beverageThreshold ? [1.5, 8.75] : [3, 17.5]
                  : rating.key === 'saturatedFat'
                    ? beverageThreshold ? [0.75, 2.5] : [1.5, 5]
                    : rating.key === 'sugars'
                      ? beverageThreshold ? [2.5, 11.25] : [5, 22.5]
                      : beverageThreshold ? [0.3, 0.75] : [0.3, 1.5]
                    const level = product.nutritionBasis === 'unavailable' || product.productType === 'unknown'
                      ? 'not-rated'
                      : classifyFrontOfPack(rating.value, limits[0], limits[1])
                  return (
                    <div className={`nutrient-rating ${level}`} key={rating.key}>
                      <dt>{nutrientLabels[rating.key] ?? rating.label}</dt>
                      <dd>{format(rating.value, 'g')} <span>{levelLabels[level]}</span></dd>
                    </div>
                  )
              })}
              <div className="nutrient-rating neutral">
                <dt>{t('calories')}</dt>
                <dd>{format(product.nutrients.energyKcal, 'kcal')} <span>{t('declaredNoColor')}</span></dd>
              </div>
            </dl>
          </section>

          <section className="detail-section">
            <h3>{t('proteinFiber')}</h3>
            <p className="assessment-note">
              {t('euClaims')}
            </p>
            <dl className="nutrient-rating-list">
              {assessment.positives.map((fact) => (
                <div className={`nutrient-rating ${fact.claim === 'high' ? 'positive-high' : fact.claim === 'source' ? 'positive-source' : 'neutral'}`} key={fact.key}>
                  <dt>{nutrientLabels[fact.key] ?? fact.label}</dt>
                  <dd>{format(fact.value, 'g')} <span>{fact.claim === 'high' ? t('high') : fact.claim === 'source' ? t('sourceClaim') : t('noClaim')}</span></dd>
                </div>
              ))}
              <div className="nutrient-rating neutral">
                <dt>{t('sodium')}</dt>
                <dd>{format(product.nutrients.sodiumMg, 'mg')} <span>{t('declaredValue')}</span></dd>
              </div>
            </dl>
          </section>

          <section className="detail-section">
            <h3>{t('sourceRatings')}</h3>
            <dl className="source-rating-list">
              <div><dt>Nutri-Score</dt><dd>{product.nutriScore?.toUpperCase() ?? t('notProvided')}</dd></div>
              <div><dt>{t('novaGroup')}</dt><dd>{product.novaGroup ?? t('notProvided')}{product.novaGroup === null ? '' : locale === 'pt-BR' ? ' de 4' : ' of 4'}</dd></div>
            </dl>
            <p className="assessment-note">{t('sourceRatingsNote')}</p>
          </section>

          <section className="detail-section">
            <h3>{t('ingredientsAdditives')}</h3>
            {product.ingredients ? <p className="food-ingredients-text">{product.ingredients}</p> : <p className="assessment-note">{t('ingredientsNotProvided')}</p>}
            {product.additives.length > 0 ? (
              <p className="assessment-note">{t('additivesCount').replace('{n}', String(product.additives.length))}</p>
            ) : (
              <p className="assessment-note">{t('additivesEmpty')}</p>
            )}
          </section>

          <div className="food-disclaimer">
            {t('foodDetailsWarning')}
          </div>
          <div className="detail-actions">
            <a className="secondary-button source-link" href={product.productUrl} target="_blank" rel="noreferrer">
              <ExternalLink aria-hidden="true" /> {t('sourceOff')}
            </a>
            <button className="secondary-button" type="button" onClick={onClose}>Fechar</button>
          </div>
          <p className="data-attribution">
            Dados <a href="https://world.openfoodfacts.org/terms-of-use" target="_blank" rel="noreferrer">ODbL / DbCL</a> via
            {' '}<a href={product.productUrl} target="_blank" rel="noreferrer">Open Food Facts</a>. {t('photosLicense')}
          </p>
        </div>
      </section>
    </div>
  )
}
