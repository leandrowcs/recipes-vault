import {
  BookHeart,
  BookOpen,
  ChefHat,
  Clock3,
  Download,
  Heart,
  LogOut,
  Menu,
  Package,
  Plus,
  ScanBarcode,
  Search,
  SlidersHorizontal,
  Sparkles,
  Utensils,
  Upload,
  X,
} from 'lucide-react'
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import type { User } from 'firebase/auth'
import { AuthGate } from './components/AuthGate'
import { PantryView } from './components/PantryView'
import { RecommendedRecipes } from './components/RecommendedRecipes'
import { RecipeCard } from './components/RecipeCard'
import { RecipeDetails } from './components/RecipeDetails'
import { RecipeForm } from './components/RecipeForm'
import { filterRecipes, isRecipeDraft } from './lib/recipes'
import { getInitialLocale, saveLocale, translate, translateError, type Locale } from './lib/locale'
import { createRecipeBackup, loadRecipes, parseRecipeBackup } from './services/recipeStorage'
import { firebaseErrorMessage, signOutGoogle } from './services/firebase'
import { saveVaultChanges, subscribeToVault, type VaultSnapshot } from './services/firestoreVault'
import type { PantryItem, PantryItemDraft } from './types/pantry'
import type { Recipe, RecipeDraft } from './types/recipe'
import './App.css'

const FoodScanner = lazy(async () => {
  const module = await import('./components/FoodScanner')
  return { default: module.FoodScanner }
})

type View = 'recipes' | 'import' | 'pantry' | 'discover' | 'food'
interface CollectionState {
  recipes: Recipe[]
  pantry: PantryItem[]
  storageReady: boolean
  storageError: string
}

const navigation: { id: View; labelKey: string; icon: typeof BookOpen }[] = [
  { id: 'recipes', labelKey: 'recipes', icon: Utensils },
  { id: 'pantry', labelKey: 'pantry', icon: Package },
  { id: 'discover', labelKey: 'discover', icon: Search },
  { id: 'food', labelKey: 'food', icon: ScanBarcode },
]

function App() {
  const [locale, setLocale] = useState<Locale>(getInitialLocale)
  useEffect(() => {
    document.documentElement.lang = locale
    saveLocale(locale)
  }, [locale])
  return <AuthGate locale={locale}>{(user) => <RecipeVault user={user} locale={locale} onLocaleChange={setLocale} />}</AuthGate>
}

function RecipeVault({ user, locale, onLocaleChange }: { user: User; locale: Locale; onLocaleChange: (locale: Locale) => void }) {
  const [collection, setCollection] = useState<CollectionState>({
    recipes: [],
    pantry: [],
    storageReady: false,
    storageError: '',
  })
  const snapshotRef = useRef<VaultSnapshot>({ recipes: [], pantry: [] })
  const persistedRef = useRef<VaultSnapshot>({ recipes: [], pantry: [] })
  const writeQueueRef = useRef<Promise<void>>(Promise.resolve())
  const legacyCheckedUidRef = useRef('')
  const [refreshVersion, setRefreshVersion] = useState(0)
  const [signOutError, setSignOutError] = useState('')
  const [legacyRecipes, setLegacyRecipes] = useState<Recipe[]>([])
  const [legacyError, setLegacyError] = useState('')
  const [legacyDismissed, setLegacyDismissed] = useState(false)
  const { recipes, pantry, storageReady, storageError } = collection
  const [view, setView] = useState<View>('recipes')
  const localeRef = useRef(locale)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [quickOnly, setQuickOnly] = useState(false)
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [formRecipe, setFormRecipe] = useState<Recipe | null | undefined>(undefined)
  const [formInitialDraft, setFormInitialDraft] = useState<RecipeDraft | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [importUrl, setImportUrl] = useState('')
  const [importedDraft, setImportedDraft] = useState<RecipeDraft | null>(null)
  const [importError, setImportError] = useState('')
  const [isImporting, setIsImporting] = useState(false)
  const [backupError, setBackupError] = useState('')
  const [backupMessage, setBackupMessage] = useState('')
  const t = (key: string) => translate(locale, key)

  function changeLocale(nextLocale: Locale) {
    localeRef.current = nextLocale
    onLocaleChange(nextLocale)
  }

  useEffect(() => {
    snapshotRef.current = { recipes: [], pantry: [] }
    persistedRef.current = { recipes: [], pantry: [] }
    return subscribeToVault(
      user.uid,
      (snapshot) => {
        snapshotRef.current = snapshot
        persistedRef.current = snapshot
        setCollection({ ...snapshot, storageReady: true, storageError: '' })
        if (legacyCheckedUidRef.current !== user.uid) {
          legacyCheckedUidRef.current = user.uid
          if (snapshot.recipes.length === 0) {
            try {
              setLegacyRecipes(loadRecipes())
            } catch (error) {
              setLegacyError(error instanceof Error ? translateError(localeRef.current, error.message) : translate(localeRef.current, 'legacyReadError'))
            }
          }
        }
      },
      (message) => setCollection((current) => ({ ...current, storageReady: false, storageError: translateError(localeRef.current, message) })),
    )
  }, [refreshVersion, user.uid])

  function refreshRecipes() {
    setCollection((current) => ({ ...current, storageReady: false, storageError: '' }))
    setRefreshVersion((current) => current + 1)
  }

  const favoriteCount = recipes.filter((recipe) => recipe.isFavorite).length
  const categories = [...new Set(recipes.map((recipe) => recipe.category))].sort((a, b) => a.localeCompare(b))
  const selectedRecipe = recipes.find((recipe) => recipe.id === detailId) ?? null
  const favoriteRecipeNames = recipes.filter((recipe) => recipe.isFavorite).map((recipe) => recipe.title)
  const visibleRecipes = useMemo(() => {
    const pageRecipes = favoritesOnly ? recipes.filter((recipe) => recipe.isFavorite) : recipes
    const filtered = filterRecipes(pageRecipes, {
      query,
      category,
      ...(quickOnly ? { maxTotalMinutes: 30 } : {}),
    })
    return filtered.sort((a, b) => a.title.localeCompare(b.title))
  }, [category, favoritesOnly, query, quickOnly, recipes])

  async function commitVault(next: VaultSnapshot): Promise<boolean> {
    if (!storageReady) {
      setCollection((current) => ({
        ...current,
        storageError: t('importStorageError'),
      }))
      return false
    }
    snapshotRef.current = next
    setCollection({ ...next, storageReady: true, storageError: '' })
    const write = writeQueueRef.current.then(async () => {
      await saveVaultChanges(user.uid, persistedRef.current, next)
      persistedRef.current = next
    })
    writeQueueRef.current = write.catch(() => undefined)
    try {
      await write
      return true
    } catch (error) {
      const message = error instanceof Error && !('code' in error) ? translateError(locale, error.message) : firebaseErrorMessage(error, locale)
      if (snapshotRef.current === next) {
        snapshotRef.current = persistedRef.current
        setCollection((current) => ({
          ...persistedRef.current,
          storageReady: current.storageReady,
          storageError: message,
        }))
      } else {
        setCollection((current) => ({ ...current, storageError: message }))
      }
      return false
    }
  }

  async function commitRecipes(nextRecipes: Recipe[]): Promise<boolean> {
    return commitVault({ ...snapshotRef.current, recipes: nextRecipes })
  }

  async function addPantryItem(draft: PantryItemDraft): Promise<boolean> {
    const now = new Date().toISOString()
    const item: PantryItem = {
      ...draft,
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    }
    return commitVault({ ...snapshotRef.current, pantry: [...snapshotRef.current.pantry, item] })
  }

  async function deletePantryItem(item: PantryItem) {
    await commitVault({ ...snapshotRef.current, pantry: snapshotRef.current.pantry.filter(({ id }) => id !== item.id) })
  }

  async function migrateLegacyRecipes() {
    if (!legacyRecipes.length) return
    if (await commitVault({ ...snapshotRef.current, recipes: legacyRecipes })) {
      setLegacyRecipes([])
      setLegacyDismissed(true)
    }
  }

  async function signOut() {
    setSignOutError('')
    try {
      await signOutGoogle()
    } catch (error) {
      setSignOutError(firebaseErrorMessage(error, locale))
    }
  }

  async function saveRecipe(draft: RecipeDraft): Promise<boolean> {
    const duplicate = recipes.some((recipe) =>
      recipe.id !== formRecipe?.id && recipe.title.trim().toLocaleLowerCase() === draft.title.trim().toLocaleLowerCase(),
    )
    if (duplicate) {
      setCollection((current) => ({
        ...current,
        storageError: t('duplicateRecipe'),
      }))
      return false
    }
    const now = new Date().toISOString()
    const savedRecipe: Recipe = formRecipe
      ? { ...formRecipe, ...draft, updatedAt: now }
      : {
          ...draft,
          id: crypto.randomUUID(),
          isFavorite: false,
          createdAt: now,
          updatedAt: now,
        }
    const nextRecipes = formRecipe
      ? recipes.map((recipe) => recipe.id === formRecipe.id ? savedRecipe : recipe)
      : [savedRecipe, ...recipes]

    const saved = await commitRecipes(nextRecipes)
    if (saved && (formInitialDraft || view === 'import')) {
      setFormInitialDraft(null)
      setImportedDraft(null)
      setImportUrl('')
      setImportError('')
      setView('recipes')
    }
    return saved
  }

  function toggleFavorite(recipe: Recipe) {
    const nextRecipes = recipes.map((item) =>
      item.id === recipe.id ? { ...item, isFavorite: !item.isFavorite, updatedAt: new Date().toISOString() } : item,
    )
    void commitRecipes(nextRecipes)
  }

  function deleteRecipe(recipe: Recipe) {
    if (!window.confirm(t('deleteConfirm').replace('{title}', recipe.title))) return
    void commitRecipes(recipes.filter((item) => item.id !== recipe.id)).then((saved) => {
      if (saved) setDetailId(null)
    })
  }

  async function importRecipe(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setImportError('')
    setImportedDraft(null)
    let url: URL
    try {
      url = new URL(importUrl.trim())
    } catch {
      setImportError(t('completeUrl'))
      return
    }
    if (!['http:', 'https:'].includes(url.protocol)) {
      setImportError(t('protocols'))
      return
    }

    setIsImporting(true)
    try {
      const response = await fetch('/api/import-recipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.href }),
        signal: AbortSignal.timeout(20_000),
      })
      let payload: unknown
      try {
        payload = await response.json()
      } catch {
        throw new Error(t('importUnreadable'))
      }
      if (!response.ok) {
        const message = payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
          ? translateError(locale, payload.error)
          : t('importFallback')
        throw new Error(message)
      }
      if (!payload || typeof payload !== 'object' || !('recipe' in payload) || !isRecipeDraft(payload.recipe)) {
        throw new Error(t('incompleteImport'))
      }
      setImportedDraft(payload.recipe)
    } catch (error) {
      setImportError(error instanceof Error ? translateError(locale, error.message) : t('importFallback'))
    } finally {
      setIsImporting(false)
    }
  }

  function openImportedRecipeReview() {
    if (!importedDraft) return
    setFormRecipe(null)
    setFormInitialDraft(importedDraft)
  }

  async function restoreBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    setBackupError('')
    setBackupMessage('')
    if (!file) return
    if (file.size > 5_000_000) {
      setBackupError(t('backupTooLarge'))
      return
    }

    try {
      const restoredRecipes = parseRecipeBackup(await file.text())
      const countLabel = t(restoredRecipes.length === 1 ? 'recipe' : 'recipesPlural')
      if (!window.confirm(`${t('restoreConfirm')} ${restoredRecipes.length} ${countLabel} ${t('fromBackup')}`)) return
      if (await commitVault({ ...snapshotRef.current, recipes: restoredRecipes })) {
        setBackupMessage(`${t('restored')} ${restoredRecipes.length} ${restoredRecipes.length === 1 ? t('recipe') : t('recipesPlural')}.`)
        setView('recipes')
        setQuery('')
        setCategory('')
        setQuickOnly(false)
      }
    } catch (error) {
      setBackupError(error instanceof Error ? translateError(locale, error.message) : t('backupRestoreError'))
    }
  }

  function downloadBackup() {
    setBackupError('')
    setBackupMessage('')
    try {
      const backup = createRecipeBackup(recipes)
      const file = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(file)
      const link = document.createElement('a')
      link.href = url
      link.download = `recipes-vault-${new Date().toISOString().slice(0, 10)}.json`
      document.body.append(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
      setBackupMessage(`${t('exported')} ${recipes.length} ${recipes.length === 1 ? t('recipe') : t('recipesPlural')}.`)
    } catch {
      setBackupError(t('exportError'))
    }
  }

  const pageTitle = view === 'import'
    ? t('importTitle')
    : view === 'pantry'
      ? t('pantryTitle')
      : view === 'discover'
        ? t('discoverTitle')
        : view === 'food'
          ? t('foodTitle')
          : t('collectionTitle')

  return (
    <div className="app-shell">
      {mobileSidebarOpen && <button className="sidebar-backdrop" type="button" aria-label={t('closeMenu')} onClick={() => setMobileSidebarOpen(false)} />}
      <aside className={`sidebar ${mobileSidebarOpen ? 'mobile-open' : ''}`} aria-label={t('kitchen')}>
        <a className="brand" href="#" onClick={(event) => { event.preventDefault(); setView('recipes'); setMobileSidebarOpen(false) }}>
          <img className="brand-logo" src="/recipes-vault-logo.svg" alt="" />
          <span className="brand-name">Recipes <strong>Vault</strong></span>
        </a>
        <button className="sidebar-close" type="button" aria-label={t('closeMenu')} onClick={() => setMobileSidebarOpen(false)}><X aria-hidden="true" /></button>

        <p className="nav-label">{t('kitchen')}</p>
        <nav className="side-navigation" aria-label={t('mainNavigation')}>
          {navigation.map(({ id, labelKey, icon: Icon }) => (
            <button key={id} type="button" className={`nav-item ${view === id ? 'active' : ''}`} aria-current={view === id ? 'page' : undefined} onClick={() => { setView(id); setMobileSidebarOpen(false) }}>
              <Icon aria-hidden="true" />
              <span>{t(labelKey)}</span>
            </button>
          ))}
        </nav>

        <p className="nav-label sidebar-tools-label">{t('tools')}</p>
        <div className="sidebar-tools">
          <button className={`nav-item ${view === 'import' ? 'active' : ''}`} type="button" aria-current={view === 'import' ? 'page' : undefined} onClick={() => { setView('import'); setMobileSidebarOpen(false) }}>
            <Download aria-hidden="true" /><span>{t('importRecipe')}</span>
          </button>
          <button className="nav-item" type="button" disabled={!storageReady} onClick={downloadBackup}>
            <Upload aria-hidden="true" /><span>{t('export')}</span>
          </button>
          <label className="nav-item restore-sidebar">
            <input type="file" accept="application/json,.json" aria-label={t('restoreLabel')} onChange={(event) => void restoreBackup(event)} />
            <Download aria-hidden="true" /><span>{t('restore')}</span>
          </label>
        </div>
        {(backupError || backupMessage) && (
          <p className={backupError ? 'sidebar-feedback sidebar-feedback-error' : 'sidebar-feedback'} role={backupError ? 'alert' : 'status'}>
            {backupError || backupMessage}
          </p>
        )}

        <div className="sidebar-note">
          <span className="note-icon"><BookHeart aria-hidden="true" /></span>
          <strong>{t('madeForKitchen')}</strong>
          <p>{t('secureSync')}</p>
        </div>
        <div className="sidebar-account">
          <p className="nav-label">{t('account')}</p>
          <span className="account-email">{user.email}</span>
          <label className="language-control">
            <span>{t('language')}</span>
            <select aria-label={t('language')} value={locale} onChange={(event) => changeLocale(event.target.value as Locale)}>
              <option value="en-US">English (US)</option>
              <option value="pt-BR">Português (Brasil)</option>
            </select>
          </label>
          <button className="secondary-button sign-out-button" type="button" onClick={() => void signOut()}><LogOut aria-hidden="true" /> {t('signOut')}</button>
        </div>
        <div className="sidebar-footer"><span className="privacy-dot" /> {t('private')}</div>
      </aside>

      <div className="main-column">
        <header className="topbar">
          <div className="topbar-leading">
            <button className="mobile-menu-button" type="button" aria-label={t('openMenu')} aria-expanded={mobileSidebarOpen} onClick={() => setMobileSidebarOpen(true)}><Menu aria-hidden="true" /></button>
            <div className="mobile-brand"><img src="/recipes-vault-logo.svg" alt="" /><strong>Recipes Vault</strong></div>
          </div>
          <div className="topbar-caption">{t('caption')}</div>
          <div className="topbar-actions">
            <button className="primary-button topbar-add" type="button" disabled={!storageReady} onClick={() => { setFormInitialDraft(null); setFormRecipe(null) }}>
              <Plus aria-hidden="true" /> {t('addRecipe')}
            </button>
          </div>
        </header>

        <main className="main-content">
          {(storageError || signOutError) && (
            <div className="storage-alert" role="alert">
              <span>{storageError || signOutError}</span>
              {storageError && <button type="button" onClick={refreshRecipes}>{t('tryAgain')}</button>}
            </div>
          )}
          {legacyError && <div className="storage-alert" role="alert">{legacyError}</div>}
          {legacyRecipes.length > 0 && storageReady && !legacyDismissed && (
            <div className="legacy-migration" role="status">
              <p>{legacyRecipes.length} {t('foundLocal')}</p>
              <button className="primary-button" type="button" onClick={() => void migrateLegacyRecipes()}>{t('importLocal')}</button>
              <button className="text-button" type="button" onClick={() => setLegacyDismissed(true)}>{t('notNow')}</button>
            </div>
          )}

          <section className="welcome-row">
            <div>
              <p className="eyebrow"><Sparkles aria-hidden="true" /> {t('cookbook')}</p>
              <h1>{pageTitle}</h1>
              <p className="welcome-copy">
                {view === 'import' ? t('importCopy') : view === 'pantry' ? t('pantryCopy') : view === 'discover' ? t('discoverCopy') : view === 'food' ? t('foodCopy') : t('collectionCopy')}
              </p>
            </div>
            {view === 'recipes' && <div className="collection-count">
              <span>{recipes.length.toString().padStart(2, '0')}</span>
              <small>{t('recipesSaved')}</small>
            </div>}
          </section>

          {view === 'recipes' && <section className="stats-row" aria-label={t('collectionSummary')}>
            <article className="stat-card">
              <span className="stat-icon"><Utensils aria-hidden="true" /></span>
              <div><strong>{recipes.length}</strong><span>{t('saved')}</span></div>
            </article>
            <article className="stat-card">
              <span className="stat-icon"><Heart aria-hidden="true" /></span>
              <div><strong>{favoriteCount}</strong><span>{t('favorites')}</span></div>
            </article>
            <article className="stat-card">
              <span className="stat-icon"><Clock3 aria-hidden="true" /></span>
              <div><strong>{recipes.filter((recipe) => recipe.prepTimeMinutes + recipe.cookTimeMinutes <= 30).length}</strong><span>{t('ready30')}</span></div>
            </article>
          </section>}

          {view === 'discover' ? (
            <RecommendedRecipes favoriteRecipes={favoriteRecipeNames} locale={locale} />
          ) : view === 'food' ? (
            <Suspense fallback={<p className="loading-state" role="status">{t('scannerLoading')}</p>}>
              <FoodScanner locale={locale} />
            </Suspense>
          ) : view === 'pantry' ? (
            <PantryView locale={locale} items={pantry} isLoading={!storageReady} error={storageError} onAdd={addPantryItem} onDelete={deletePantryItem} />
          ) : view === 'import' ? (
            <section className="collection-section import-section">
              <div className="collection-heading">
                <div>
                  <p className="eyebrow">{t('structuredRecipeData')}</p>
                  <h2>{t('imported')}</h2>
                </div>
              </div>
              <p className="import-intro">{t('importIntro')}</p>
              <form className="import-form" onSubmit={(event) => void importRecipe(event)}>
                <label className="form-field">
                  <span>{t('recipeUrl')}</span>
                  <input
                    type="url"
                    required
                    aria-label={t('recipeUrl')}
                    value={importUrl}
                    onChange={(event) => { setImportUrl(event.target.value); setImportError(''); setImportedDraft(null) }}
                    placeholder="https://example.com/recipes/..."
                  />
                </label>
                <button className="primary-button" type="submit" disabled={isImporting}>
                  <Download aria-hidden="true" /> {isImporting ? t('importing') : t('fetchRecipe')}
                </button>
              </form>
              {isImporting && <p className="import-status" role="status">{t('checkingPage')}</p>}
              {importError && (
                <div className="import-error" role="alert">
                  <p>{importError}</p>
                  <button className="secondary-button" type="button" disabled={!storageReady} onClick={() => { setImportError(''); setFormInitialDraft(null); setFormRecipe(null) }}>{t('manualEntry')}</button>
                </div>
              )}
              {importedDraft && (
                <article className="import-preview">
                  <div className="import-preview-copy">
                    <p className="eyebrow">{t('reviewReady')}</p>
                    <h3>{importedDraft.title}</h3>
                    <p>{importedDraft.description || t('importedReviewCopy')}</p>
                    <div className="import-preview-meta">
                      <span>{importedDraft.ingredients.length} {t('ingredients')}</span>
                      <span>{importedDraft.instructions.length} {t('steps')}</span>
                      <span>{importedDraft.servings} {t('servings')}</span>
                    </div>
                    <button className="primary-button" type="button" disabled={!storageReady} onClick={openImportedRecipeReview}>{t('reviewEdit')}</button>
                  </div>
                  {importedDraft.imageUrl && <img src={importedDraft.imageUrl} alt="" loading="lazy" />}
                </article>
              )}
              <div className="import-limits">
                <strong>{t('aboutImports')}</strong>
                <p>{t('importLimits')}</p>
              </div>
            </section>
          ) : (
          <section className="collection-section">
            <div className="collection-heading">
              <div>
                <p className="eyebrow">{t('allInOne')}</p>
                <h2>{t('allRecipes')}</h2>
              </div>
              <div className="collection-actions">
              </div>
            </div>

            <div className="collection-controls">
              <label className="search-control">
                <Search aria-hidden="true" />
                <span className="sr-only">{t('searchRecipes')}</span>
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('search')} />
                {query && <button type="button" aria-label={t('clearSearch')} onClick={() => setQuery('')}>×</button>}
              </label>
              <label className="category-control">
                <SlidersHorizontal aria-hidden="true" />
                <span className="sr-only">{t('categoryFilter')}</span>
                <select value={category} onChange={(event) => setCategory(event.target.value)}>
                  <option value="">{t('allCategories')}</option>
                  {categories.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
              <label className={`quick-filter favorites-filter ${favoritesOnly ? 'selected' : ''}`}>
                <input type="checkbox" checked={favoritesOnly} onChange={(event) => setFavoritesOnly(event.target.checked)} />
                <Heart aria-hidden="true" />
                {t('favoriteOnly')} ({favoriteCount})
              </label>
              <label className={`quick-filter ${quickOnly ? 'selected' : ''}`}>
                <input type="checkbox" checked={quickOnly} onChange={(event) => setQuickOnly(event.target.checked)} />
                <Clock3 aria-hidden="true" />
                {t('under30')}
              </label>
            </div>

            {!storageReady ? (
              <div className="loading-state" role="status">{t('loadingRecipes')}</div>
            ) : visibleRecipes.length > 0 ? (
              <div className="recipe-grid">
                {visibleRecipes.map((recipe) => (
                  <RecipeCard key={recipe.id} locale={locale} recipe={recipe} onOpen={(item) => setDetailId(item.id)} onToggleFavorite={toggleFavorite} />
                ))}
              </div>
            ) : recipes.length === 0 && !favoritesOnly ? (
              <div className="empty-state">
                <span className="empty-illustration"><ChefHat aria-hidden="true" /></span>
                <p className="eyebrow">{t('freshStart')}</p>
                <h3>{t('emptyTitle')}</h3>
                <p>{t('emptyCopy')}</p>
                <button className="primary-button" type="button" disabled={!storageReady} onClick={() => { setFormInitialDraft(null); setFormRecipe(null) }}><Plus aria-hidden="true" /> {t('addFirst')}</button>
              </div>
            ) : (
              <div className="empty-state compact-empty">
                <span className="empty-illustration"><Search aria-hidden="true" /></span>
                <h3>{favoritesOnly && favoriteCount === 0 ? t('noFavorites') : t('noMatches')}</h3>
                <p>{favoritesOnly && favoriteCount === 0 ? t('favoriteTip') : t('tryFilters')}</p>
                <button className="secondary-button" type="button" onClick={() => { setQuery(''); setCategory(''); setQuickOnly(false); setFavoritesOnly(false) }}>
                  {favoritesOnly && favoriteCount === 0 ? t('browseRecipes') : t('clearFilters')}
                </button>
              </div>
            )}
          </section>
          )}
        </main>
      </div>

      <nav className="mobile-navigation" aria-label={t('mainNavigation')}>
        {navigation.slice(0, 4).map(({ id, labelKey, icon: Icon }) => (
          <button key={id} type="button" className={`mobile-nav-item ${view === id ? 'active' : ''}`} aria-current={view === id ? 'page' : undefined} onClick={() => setView(id)}>
            <Icon aria-hidden="true" /><span>{t(labelKey)}</span>
          </button>
        ))}
      </nav>

      {formRecipe !== undefined && (
        <RecipeForm
          locale={locale}
          key={formRecipe?.id ?? (formInitialDraft ? 'import-review' : 'new-recipe')}
          recipe={formRecipe}
          initialDraft={formInitialDraft}
          saveError={storageError}
          onClose={() => { setFormRecipe(undefined); setFormInitialDraft(null) }}
          onSave={saveRecipe}
        />
      )}
      {selectedRecipe && (
        <RecipeDetails
          locale={locale}
          key={selectedRecipe.id}
          recipe={selectedRecipe}
          errorMessage={storageError}
          onClose={() => setDetailId(null)}
          onEdit={(recipe) => { setDetailId(null); setFormRecipe(recipe) }}
          onDelete={deleteRecipe}
          onToggleFavorite={toggleFavorite}
        />
      )}
    </div>
  )
}

export default App
