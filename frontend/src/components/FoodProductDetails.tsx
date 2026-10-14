import { ExternalLink, X } from 'lucide-react'
import { assessNutrition, classifyFrontOfPack, formatNutrition } from '../services/foodRatings'
import type { FoodProduct } from '../types/food'

interface FoodProductDetailsProps {
  product: FoodProduct
  onClose: () => void
}

export function FoodProductDetails({ product, onClose }: FoodProductDetailsProps) {
  const assessment = assessNutrition(product.nutrients)
  const levelLabels = {
    low: 'Baixo',
    medium: 'Médio',
    high: 'Alto',
    'not-rated': 'Sem dado',
  } as const
  const beverageThreshold = product.productType === 'beverage'
  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <section
        className="recipe-detail-dialog food-detail-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="food-product-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button className="icon-button detail-close" type="button" aria-label="Fechar dados do produto" onClick={onClose}>
          <X aria-hidden="true" />
        </button>
        {product.imageUrl && <div className="detail-image food-detail-image"><img src={product.imageUrl} alt="" /></div>}
        <div className="detail-content">
          <p className="eyebrow">OPEN FOOD FACTS · POR {product.nutritionBasis === 'unavailable' ? 'BASE NÃO INFORMADA' : `100 ${product.nutritionBasis === '100ml' ? 'ML' : 'G'}`}</p>
          <div className="detail-heading"><h2 id="food-product-title">{product.name || 'Produto sem nome cadastrado'}</h2></div>
          {product.brand && <p className="detail-description">{product.brand}{product.quantity ? ` · ${product.quantity}` : ''}</p>}

          <section className="detail-section">
            <h3>Semáforo nutricional</h3>
            <p className="assessment-note">
              Baixo, médio e alto seguem o guia britânico de rotulagem frontal (2016) para produtos embalados. Categoria {product.productType === 'unknown' ? 'não identificada' : beverageThreshold ? 'bebida' : 'alimento'} pelo catálogo.
              {product.productType === 'unknown' && ' Os nutrientes são exibidos, mas não recebem classificação sem categoria confiável.'}
              Energia é sempre exibida como valor, sem classificação por cor. Critérios por porção não são aplicados.
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
                      <dt>{rating.label}</dt>
                      <dd>{formatNutrition(rating.value, 'g')} <span>{levelLabels[level]}</span></dd>
                    </div>
                  )
              })}
              <div className="nutrient-rating neutral">
                <dt>Calorias</dt>
                <dd>{formatNutrition(product.nutrients.energyKcal, 'kcal')} <span>Valor declarado, sem cor</span></dd>
              </div>
            </dl>
          </section>

          <section className="detail-section">
            <h3>Proteínas e fibras</h3>
            <p className="assessment-note">
              “Fonte” e “alto” seguem os critérios de alegação nutricional da UE. Proteína: pelo percentual da energia; fibra: ≥ 3 / ≥ 6 g por 100 g ou ≥ 1,5 / ≥ 3 g por 100 kcal. Não é uma escala de qualidade geral.
            </p>
            <dl className="nutrient-rating-list">
              {assessment.positives.map((fact) => (
                <div className={`nutrient-rating ${fact.claim === 'high' ? 'positive-high' : fact.claim === 'source' ? 'positive-source' : 'neutral'}`} key={fact.key}>
                  <dt>{fact.label}</dt>
                  <dd>{formatNutrition(fact.value, 'g')} <span>{fact.claim === 'high' ? 'Alto' : fact.claim === 'source' ? 'Fonte' : 'Sem alegação'}</span></dd>
                </div>
              ))}
              <div className="nutrient-rating neutral">
                <dt>Sódio</dt>
                <dd>{formatNutrition(product.nutrients.sodiumMg, 'mg')} <span>Valor declarado</span></dd>
              </div>
            </dl>
          </section>

          <section className="detail-section">
            <h3>Classificações da fonte</h3>
            <dl className="source-rating-list">
              <div><dt>Nutri-Score</dt><dd>{product.nutriScore?.toUpperCase() ?? 'Não informado'}</dd></div>
              <div><dt>Grupo NOVA</dt><dd>{product.novaGroup ?? 'Não informado'}{product.novaGroup === null ? '' : ' de 4'}</dd></div>
            </dl>
            <p className="assessment-note">As classificações Nutri-Score e NOVA são apresentadas conforme os dados cadastrados no Open Food Facts.</p>
          </section>

          <section className="detail-section">
            <h3>Ingredientes e aditivos</h3>
            {product.ingredients ? <p className="food-ingredients-text">{product.ingredients}</p> : <p className="assessment-note">Lista de ingredientes não informada.</p>}
            {product.additives.length > 0 ? (
              <p className="assessment-note">A base lista {product.additives.length} aditivo{product.additives.length === 1 ? '' : 's'}. A presença de aditivos, por si só, não recebe pontuação negativa: este app não infere risco ou segurança individual.</p>
            ) : (
              <p className="assessment-note">A lista de aditivos está vazia ou não foi informada; isso não confirma ausência de aditivos.</p>
            )}
          </section>

          <div className="food-disclaimer">
            Dados colaborativos, potencialmente incompletos ou incorretos. Informação geral e educativa; não é aconselhamento médico ou nutricional. Consulte o rótulo físico e um profissional para decisões de saúde.
          </div>
          <div className="detail-actions">
            <a className="secondary-button source-link" href={product.productUrl} target="_blank" rel="noreferrer">
              <ExternalLink aria-hidden="true" /> Fonte Open Food Facts
            </a>
            <button className="secondary-button" type="button" onClick={onClose}>Fechar</button>
          </div>
          <p className="data-attribution">
            Dados <a href="https://world.openfoodfacts.org/terms-of-use" target="_blank" rel="noreferrer">ODbL / DbCL</a> via
            {' '}<a href={product.productUrl} target="_blank" rel="noreferrer">Open Food Facts</a>. Fotos sob CC BY-SA quando aplicável.
          </p>
        </div>
      </section>
    </div>
  )
}
