import { BrowserMultiFormatReader } from '@zxing/browser'
import { BarcodeFormat, DecodeHintType } from '@zxing/library'
import { Camera, CameraOff, Search, X } from 'lucide-react'
import { lazy, Suspense, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { translate, translateError, type Locale } from '../lib/locale'
import { isValidEanUpc, normalizeBarcode } from '../services/foodRatings'
import type { FoodProduct } from '../types/food'

const FoodProductDetails = lazy(async () => {
  const module = await import('./FoodProductDetails')
  return { default: module.FoodProductDetails }
})

export function FoodScanner({ locale }: { locale: Locale }) {
  const t = (key: string) => translate(locale, key)
  const [barcode, setBarcode] = useState('')
  const [product, setProduct] = useState<FoodProduct | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [notFound, setNotFound] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [isScanning, setIsScanning] = useState(false)
  const [error, setError] = useState('')
  const [cameraError, setCameraError] = useState('')
  const videoRef = useRef<HTMLVideoElement>(null)
  const controlsRef = useRef<{ stop: () => void } | null>(null)
  const readerRef = useRef<BrowserMultiFormatReader | null>(null)
  const handledScanRef = useRef(false)
  const scanSessionRef = useRef(0)

  function stopScanner() {
    scanSessionRef.current += 1
    controlsRef.current?.stop()
    controlsRef.current = null
    readerRef.current = null
    setIsScanning(false)
  }

  async function lookupProduct(value: string) {
    const normalized = normalizeBarcode(value)
    if (!normalized || !isValidEanUpc(normalized)) {
      setError(t('invalidBarcode'))
      setProduct(null)
      setNotFound(false)
      return
    }

    setError('')
    setNotFound(false)
    setProduct(null)
    setDetailsOpen(false)
    setBarcode(normalized)
    setIsSearching(true)
    try {
      const response = await fetch(`/api/open-food-facts?barcode=${encodeURIComponent(normalized)}`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(12_000),
      })
      const payload: unknown = await response.json()
      if (!response.ok) {
        throw new Error(
          payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
            ? payload.error
            : t('productLookupError'),
        )
      }
      if (!payload || typeof payload !== 'object' || !('found' in payload) || typeof payload.found !== 'boolean') {
        throw new Error(t('invalidCatalogResponse'))
      }
      if (!payload.found) {
        setNotFound(true)
        return
      }
      if (!('product' in payload) || !isFoodProduct(payload.product)) {
        throw new Error(t('incompleteProduct'))
      }
      setProduct(payload.product)
      setDetailsOpen(true)
    } catch (reason) {
      setError(reason instanceof Error ? translateError(locale, reason.message) : t('productLookupError'))
    } finally {
      setIsSearching(false)
    }
  }

  async function startScanner() {
    setError('')
    setCameraError('')
    handledScanRef.current = false
    const session = ++scanSessionRef.current
    setIsScanning(true)
    try {
      const reader = new BrowserMultiFormatReader(new Map([[DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.EAN_8,
        BarcodeFormat.EAN_13,
        BarcodeFormat.UPC_A,
        BarcodeFormat.UPC_E,
        BarcodeFormat.ITF,
      ]]]))
      readerRef.current = reader
      const controls = await reader.decodeFromConstraints(
        { audio: false, video: { facingMode: { ideal: 'environment' } } },
        videoRef.current ?? undefined,
        (result, reason) => {
          if (result && !handledScanRef.current && session === scanSessionRef.current) {
            handledScanRef.current = true
            const scannedBarcode = result.getText()
            stopScanner()
            void lookupProduct(scannedBarcode)
          } else if (reason && reason.name !== 'NotFoundException' && session === scanSessionRef.current) {
            setCameraError(t('cameraReadFailure'))
          }
        },
      )
      if (session !== scanSessionRef.current) {
        controls.stop()
        return
      }
      controlsRef.current = controls
    } catch (reason) {
      if (session !== scanSessionRef.current) return
      stopScanner()
      setCameraError(cameraErrorMessage(reason, locale))
    }
  }

  useEffect(() => () => {
    controlsRef.current?.stop()
    readerRef.current = null
    scanSessionRef.current += 1
  }, [])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await lookupProduct(barcode)
  }

  function onBarcodeInput(event: ChangeEvent<HTMLInputElement>) {
    setBarcode(event.target.value)
    setError('')
    setNotFound(false)
  }

  return (
    <section className="collection-section food-scanner-section">
      <p className="locale-data-notice">{t('productSource')}</p>
      <div className="collection-heading">
        <div>
          <p className="eyebrow">{t('scanCatalog')}</p>
          <h2>{t('lookupProduct')}</h2>
        </div>
      </div>
      <p className="discovery-intro">
        {t('scanIntro')}
      </p>
      <div className="food-lookup-actions">
        <form className="collection-controls food-search-form" onSubmit={(event) => void submit(event)}>
          <label className="search-control">
            <Search aria-hidden="true" />
            <span className="sr-only">{t('barcodeLabel')}</span>
            <input
              inputMode="numeric"
              autoComplete="off"
              value={barcode}
              onChange={onBarcodeInput}
              placeholder={t('barcodePlaceholder')}
              aria-label={t('barcodeLabel')}
            />
          </label>
          <button className="primary-button" type="submit" disabled={isSearching || isScanning}>
            <Search aria-hidden="true" /> {isSearching ? t('lookingUp') : t('lookup')}
          </button>
        </form>
        <button className="secondary-button scanner-toggle" type="button" disabled={isSearching} onClick={() => isScanning ? stopScanner() : void startScanner()}>
          {isScanning ? <CameraOff aria-hidden="true" /> : <Camera aria-hidden="true" />}
          {isScanning ? t('stopCamera') : t('scanCode')}
        </button>
      </div>
      {isScanning && <div className="scanner-preview"><video ref={videoRef} muted playsInline aria-label={t('cameraPreview')} /><button className="secondary-button" type="button" onClick={stopScanner}><X aria-hidden="true" /> {t('closeCamera')}</button></div>}
      {cameraError && <p className="form-error" role="alert">{cameraError}</p>}
      {error && <p className="form-error food-error" role="alert">{error}</p>}
      {isSearching && <p className="loading-state" role="status">{t('lookingUp')} Open Food Facts…</p>}
      {notFound && <div className="empty-state compact-empty"><h3>{t('productNotFound')}</h3><p>{t('productMissing')}</p></div>}
      {product && <ProductSummary locale={locale} product={product} onShowDetails={() => setDetailsOpen(true)} />}
      <div className="food-disclaimer">
        {t('communityDataWarning')}
      </div>
      <p className="data-attribution">
        {t('productData')} <a href="https://world.openfoodfacts.org/" target="_blank" rel="noreferrer">Open Food Facts</a> ·
        {' '}<a href="https://world.openfoodfacts.org/terms-of-use" target="_blank" rel="noreferrer">ODbL / DbCL</a>
      </p>
      {product && detailsOpen && (
        <Suspense fallback={null}>
          <FoodProductDetails locale={locale} product={product} onClose={() => setDetailsOpen(false)} />
        </Suspense>
      )}
    </section>
  )
}

function ProductSummary({ locale, product, onShowDetails }: { locale: Locale; product: FoodProduct; onShowDetails: () => void }) {
  const t = (key: string) => translate(locale, key)
  const name = product.name || t('unnamedProduct')
  return (
    <article className="product-summary">
      {product.imageUrl && <img src={product.imageUrl} alt="" loading="lazy" />}
      <div className="product-summary-copy">
        <p className="eyebrow">{t('resultFor')} {product.barcode}</p>
        <h3>{name}</h3>
        {product.brand && <p>{product.brand}{product.quantity ? ` · ${product.quantity}` : ''}</p>}
        <button className="secondary-button" type="button" onClick={onShowDetails}>{t('productCriteria')}</button>
        {!product.name && <small>{t('noProductName')}</small>}
      </div>
    </article>
  )
}

function isFoodProduct(value: unknown): value is FoodProduct {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<FoodProduct>
  return (
    typeof candidate.barcode === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.brand === 'string' &&
    typeof candidate.quantity === 'string' &&
    typeof candidate.imageUrl === 'string' &&
    typeof candidate.productUrl === 'string' &&
    Array.isArray(candidate.additives) &&
    ['food', 'beverage', 'unknown'].includes(candidate.productType ?? '') &&
    ['100g', '100ml', 'unavailable'].includes(candidate.nutritionBasis ?? '') &&
    typeof candidate.ingredients === 'string' &&
    !!candidate.nutrients &&
    typeof candidate.nutrients === 'object'
  )
}

function cameraErrorMessage(reason: unknown, locale: Locale): string {
  if (reason instanceof DOMException && reason.name === 'NotAllowedError') return translate(locale, 'cameraPermission')
  if (reason instanceof DOMException && reason.name === 'NotFoundError') return translate(locale, 'cameraMissing')
  if (reason instanceof DOMException && reason.name === 'NotReadableError') return translate(locale, 'cameraBusy')
  if (window.isSecureContext === false) return translate(locale, 'cameraHttps')
  return translate(locale, 'cameraStartError')
}
