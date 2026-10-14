import {
  BookHeart,
  BookOpen,
  ChefHat,
  Clock3,
  Download,
  Heart,
  Link,
  LogOut,
  Package,
  Plus,
  ScanBarcode,
  Search,
  SlidersHorizontal,
  Sparkles,
  Utensils,
  Upload,
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

type View = 'home' | 'recipes' | 'favorites' | 'import' | 'pantry' | 'discover' | 'food'
interface CollectionState {
  recipes: Recipe[]
  pantry: PantryItem[]
  storageReady: boolean
  storageError: string
}

const navigation: { id: View; label: string; icon: typeof BookOpen }[] = [
  { id: 'home', label: 'Overview', icon: BookOpen },
  { id: 'recipes', label: 'My recipes', icon: Utensils },
  { id: 'favorites', label: 'Favorites', icon: Heart },
  { id: 'pantry', label: 'Pantry', icon: Package },
  { id: 'discover', label: 'Discover', icon: Search },
  { id: 'food', label: 'Scan food', icon: ScanBarcode },
  { id: 'import', label: 'Import recipe', icon: Link },
]

function App() {
  return <AuthGate>{(user) => <RecipeVault user={user} />}</AuthGate>
}

function RecipeVault({ user }: { user: User }) {
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
  const [view, setView] = useState<View>('home')
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [quickOnly, setQuickOnly] = useState(false)
  const [formRecipe, setFormRecipe] = useState<Recipe | null | undefined>(undefined)
  const [formInitialDraft, setFormInitialDraft] = useState<RecipeDraft | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [importUrl, setImportUrl] = useState('')
  const [importedDraft, setImportedDraft] = useState<RecipeDraft | null>(null)
  const [importError, setImportError] = useState('')
  const [isImporting, setIsImporting] = useState(false)
  const [backupError, setBackupError] = useState('')
  const [backupMessage, setBackupMessage] = useState('')

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
              setLegacyError(error instanceof Error ? error.message : 'Saved recipes on this device could not be read.')
            }
          }
        }
      },
      (message) => setCollection((current) => ({ ...current, storageReady: false, storageError: message })),
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
    const pageRecipes = view === 'favorites' ? recipes.filter((recipe) => recipe.isFavorite) : recipes
    const filtered = filterRecipes(pageRecipes, {
      query,
      category,
      ...(quickOnly ? { maxTotalMinutes: 30 } : {}),
    })
    return view === 'home'
      ? filtered.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 4)
      : filtered.sort((a, b) => a.title.localeCompare(b.title))
  }, [category, query, quickOnly, recipes, view])

  async function commitVault(next: VaultSnapshot): Promise<boolean> {
    if (!storageReady) {
      setCollection((current) => ({
        ...current,
        storageError: 'Cloud storage is unavailable. Reconnect and reload your collection before making changes.',
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
      const message = error instanceof Error && !('code' in error) ? error.message : firebaseErrorMessage(error)
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
      setSignOutError(firebaseErrorMessage(error))
    }
  }

  async function saveRecipe(draft: RecipeDraft): Promise<boolean> {
    const duplicate = recipes.some((recipe) =>
      recipe.id !== formRecipe?.id && recipe.title.trim().toLocaleLowerCase() === draft.title.trim().toLocaleLowerCase(),
    )
    if (duplicate) {
      setCollection((current) => ({
        ...current,
        storageError: 'A recipe with this name is already in your collection.',
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
    if (!window.confirm(`Delete "${recipe.title}" from your collection?`)) return
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
      setImportError('Enter a complete recipe website URL.')
      return
    }
    if (!['http:', 'https:'].includes(url.protocol)) {
      setImportError('Only HTTP and HTTPS recipe URLs are supported.')
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
        throw new Error('The recipe importer returned an unreadable response. Try manual entry instead.')
      }
      if (!response.ok) {
        const message = payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
          ? payload.error
          : 'This recipe could not be imported. Try manual entry instead.'
        throw new Error(message)
      }
      if (!payload || typeof payload !== 'object' || !('recipe' in payload) || !isRecipeDraft(payload.recipe)) {
        throw new Error('The imported recipe was incomplete. Try manual entry instead.')
      }
      setImportedDraft(payload.recipe)
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'The recipe could not be imported. Try manual entry instead.')
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
      setBackupError('Choose a backup file smaller than 5 MB.')
      return
    }

    try {
      const restoredRecipes = parseRecipeBackup(await file.text())
      if (!window.confirm(`Replace your cloud recipe collection with ${restoredRecipes.length} recipes from this backup?`)) return
      if (await commitVault({ ...snapshotRef.current, recipes: restoredRecipes })) {
        setBackupMessage(`Restored ${restoredRecipes.length} ${restoredRecipes.length === 1 ? 'recipe' : 'recipes'}.`)
        setView('recipes')
        setQuery('')
        setCategory('')
        setQuickOnly(false)
      }
    } catch (error) {
      setBackupError(error instanceof Error ? error.message : 'This backup could not be restored. Your saved recipes were not changed.')
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
      setBackupMessage(`Exported ${recipes.length} ${recipes.length === 1 ? 'recipe' : 'recipes'}.`)
    } catch {
      setBackupError('Your recipes could not be exported. Check browser download permissions and try again.')
    }
  }

  const pageTitle = view === 'home'
    ? 'A little inspiration, every day.'
    : view === 'favorites'
      ? 'Your favorites'
      : view === 'import'
        ? 'Bring a recipe along.'
        : view === 'pantry'
          ? 'What’s in your kitchen?'
          : view === 'discover'
            ? 'Find your next dish.'
            : view === 'food'
              ? 'Know what’s on the label.'
        : 'My recipes'
  const filteredTotal = view === 'favorites' ? favoriteCount : recipes.length

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#" onClick={(event) => { event.preventDefault(); setView('home') }}>
          <img className="brand-logo" src="/recipes-vault-logo.svg" alt="" />
          <span className="brand-name">Recipes <strong>Vault</strong></span>
        </a>

        <p className="nav-label">Your kitchen</p>
        <nav className="side-navigation" aria-label="Main navigation">
          {navigation.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" className={`nav-item ${view === id ? 'active' : ''}`} aria-current={view === id ? 'page' : undefined} onClick={() => setView(id)}>
              <Icon aria-hidden="true" />
              <span>{label}</span>
              {id === 'favorites' && favoriteCount > 0 && <small>{favoriteCount}</small>}
            </button>
          ))}
        </nav>

        <div className="sidebar-note">
          <span className="note-icon"><BookHeart aria-hidden="true" /></span>
          <strong>Made for your kitchen</strong>
          <p>Your recipes and pantry sync securely to your account.</p>
        </div>
        <div className="sidebar-footer"><span className="privacy-dot" /> Private by design</div>
      </aside>

      <div className="main-column">
        <header className="topbar">
          <div className="mobile-brand"><img src="/recipes-vault-logo.svg" alt="" /><strong>Recipes Vault</strong></div>
          <div className="topbar-caption">A home for the things you love to cook</div>
          <div className="topbar-actions">
            <span className="account-email">{user.email}</span>
            <button className="secondary-button sign-out-button" type="button" onClick={() => void signOut()}><LogOut aria-hidden="true" /> Sign out</button>
            <button className="primary-button topbar-add" type="button" disabled={!storageReady} onClick={() => { setFormInitialDraft(null); setFormRecipe(null) }}>
              <Plus aria-hidden="true" /> Add recipe
            </button>
          </div>
        </header>

        <main className="main-content">
          {(storageError || signOutError) && (
            <div className="storage-alert" role="alert">
              <span>{storageError || signOutError}</span>
              {storageError && <button type="button" onClick={refreshRecipes}>Try again</button>}
            </div>
          )}
          {legacyError && <div className="storage-alert" role="alert">{legacyError}</div>}
          {legacyRecipes.length > 0 && storageReady && !legacyDismissed && (
            <div className="legacy-migration" role="status">
              <p>Found {legacyRecipes.length} recipe{legacyRecipes.length === 1 ? '' : 's'} saved on this device. Import them into your private cloud collection?</p>
              <button className="primary-button" type="button" onClick={() => void migrateLegacyRecipes()}>Import local recipes</button>
              <button className="text-button" type="button" onClick={() => setLegacyDismissed(true)}>Not now</button>
            </div>
          )}

          <section className="welcome-row">
            <div>
              <p className="eyebrow"><Sparkles aria-hidden="true" /> YOUR PERSONAL COOKBOOK</p>
              <h1>{pageTitle}</h1>
              <p className="welcome-copy">
                {view === 'import'
                  ? 'Import available recipe details from a website.'
                  : view === 'pantry'
                    ? 'Keep track of ingredients you already have.'
                    : view === 'discover'
                      ? 'Explore catalog recipes and get inspiration from your favorites.'
                      : view === 'food'
                        ? 'Scan a product and review its declared nutrition information.'
                        : 'Keep the recipes you love close at hand.'}
              </p>
            </div>
            {['home', 'recipes', 'favorites'].includes(view) && <div className="collection-count">
              <span>{filteredTotal.toString().padStart(2, '0')}</span>
              <small>{view === 'favorites' ? 'favorites' : 'recipes saved'}</small>
            </div>}
          </section>

          {view !== 'import' && view !== 'pantry' && view !== 'discover' && view !== 'food' && <section className="stats-row" aria-label="Collection summary">
            <article className="stat-card">
              <span className="stat-icon"><Utensils aria-hidden="true" /></span>
              <div><strong>{recipes.length}</strong><span>Recipes saved</span></div>
            </article>
            <article className="stat-card">
              <span className="stat-icon"><Heart aria-hidden="true" /></span>
              <div><strong>{favoriteCount}</strong><span>Favorites</span></div>
            </article>
            <article className="stat-card">
              <span className="stat-icon"><Clock3 aria-hidden="true" /></span>
              <div><strong>{recipes.filter((recipe) => recipe.prepTimeMinutes + recipe.cookTimeMinutes <= 30).length}</strong><span>Ready in 30 min</span></div>
            </article>
          </section>}

          {view === 'discover' ? (
            <RecommendedRecipes favoriteRecipes={favoriteRecipeNames} />
          ) : view === 'food' ? (
            <Suspense fallback={<p className="loading-state" role="status">Loading barcode scanner…</p>}>
              <FoodScanner />
            </Suspense>
          ) : view === 'pantry' ? (
            <PantryView items={pantry} isLoading={!storageReady} error={storageError} onAdd={addPantryItem} onDelete={deletePantryItem} />
          ) : view === 'import' ? (
            <section className="collection-section import-section">
              <div className="collection-heading">
                <div>
                  <p className="eyebrow">STRUCTURED RECIPE DATA</p>
                  <h2>Import a recipe</h2>
                </div>
              </div>
              <p className="import-intro">Paste a recipe page URL. Supported pages share Schema.org recipe data; the page is fetched securely and reviewed before saving.</p>
              <form className="import-form" onSubmit={(event) => void importRecipe(event)}>
                <label className="form-field">
                  <span>Recipe page URL</span>
                  <input
                    type="url"
                    required
                    aria-label="Recipe page URL"
                    value={importUrl}
                    onChange={(event) => { setImportUrl(event.target.value); setImportError(''); setImportedDraft(null) }}
                    placeholder="https://example.com/recipes/..."
                  />
                </label>
                <button className="primary-button" type="submit" disabled={isImporting}>
                  <Download aria-hidden="true" /> {isImporting ? 'Importing recipe…' : 'Fetch recipe'}
                </button>
              </form>
              {isImporting && <p className="import-status" role="status">Checking the page for structured recipe details…</p>}
              {importError && (
                <div className="import-error" role="alert">
                  <p>{importError}</p>
                  <button className="secondary-button" type="button" disabled={!storageReady} onClick={() => { setImportError(''); setFormInitialDraft(null); setFormRecipe(null) }}>Enter recipe manually</button>
                </div>
              )}
              {importedDraft && (
                <article className="import-preview">
                  <div className="import-preview-copy">
                    <p className="eyebrow">READY FOR REVIEW</p>
                    <h3>{importedDraft.title}</h3>
                    <p>{importedDraft.description || 'Review the imported ingredients and cooking steps before saving.'}</p>
                    <div className="import-preview-meta">
                      <span>{importedDraft.ingredients.length} ingredients</span>
                      <span>{importedDraft.instructions.length} steps</span>
                      <span>{importedDraft.servings} servings</span>
                    </div>
                    <button className="primary-button" type="button" disabled={!storageReady} onClick={openImportedRecipeReview}>Review and edit recipe</button>
                  </div>
                  {importedDraft.imageUrl && <img src={importedDraft.imageUrl} alt="" loading="lazy" />}
                </article>
              )}
              <div className="import-limits">
                <strong>About recipe imports</strong>
                <p>Some websites block automated requests or do not provide structured recipe details. Imports never bypass those protections. If a page cannot be imported, add the recipe manually instead.</p>
              </div>
            </section>
          ) : (
          <section className="collection-section">
            <div className="collection-heading">
              <div>
                <p className="eyebrow">{view === 'home' ? 'RECENTLY ADDED' : view === 'favorites' ? 'THE ONES YOU LOVE' : 'ALL IN ONE PLACE'}</p>
                <h2>{view === 'home' ? 'Your collection' : view === 'favorites' ? 'Favorites' : 'Every recipe'}</h2>
              </div>
              <div className="collection-actions">
                {view === 'home' && recipes.length > 4 && (
                  <button className="text-button view-all-button" type="button" onClick={() => setView('recipes')}>View all <span aria-hidden="true">→</span></button>
                )}
                <button className="secondary-button backup-button" type="button" disabled={!storageReady} onClick={downloadBackup}><Upload aria-hidden="true" /> Export backup</button>
                <label className="secondary-button backup-button restore-button">
                  <input type="file" accept="application/json,.json" aria-label="Restore recipe backup" onChange={(event) => void restoreBackup(event)} />
                  <Download aria-hidden="true" /> Restore backup
                </label>
              </div>
            </div>
            {backupError && <p className="form-error backup-message" role="alert">{backupError}</p>}
            {backupMessage && <p className="backup-success" role="status">{backupMessage}</p>}

            <div className="collection-controls">
              <label className="search-control">
                <Search aria-hidden="true" />
                <span className="sr-only">Search recipes and ingredients</span>
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search recipes or ingredients..." />
                {query && <button type="button" aria-label="Clear search" onClick={() => setQuery('')}>×</button>}
              </label>
              <label className="category-control">
                <SlidersHorizontal aria-hidden="true" />
                <span className="sr-only">Filter by category</span>
                <select value={category} onChange={(event) => setCategory(event.target.value)}>
                  <option value="">All categories</option>
                  {categories.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
              <label className={`quick-filter ${quickOnly ? 'selected' : ''}`}>
                <input type="checkbox" checked={quickOnly} onChange={(event) => setQuickOnly(event.target.checked)} />
                <Clock3 aria-hidden="true" />
                Under 30 min
              </label>
            </div>

            {!storageReady ? (
              <div className="loading-state" role="status">Your saved recipes are unavailable. Retry before making changes.</div>
            ) : visibleRecipes.length > 0 ? (
              <div className="recipe-grid">
                {visibleRecipes.map((recipe) => (
                  <RecipeCard key={recipe.id} recipe={recipe} onOpen={(item) => setDetailId(item.id)} onToggleFavorite={toggleFavorite} />
                ))}
              </div>
            ) : recipes.length === 0 && view !== 'favorites' ? (
              <div className="empty-state">
                <span className="empty-illustration"><ChefHat aria-hidden="true" /></span>
                <p className="eyebrow">A FRESH START</p>
                <h3>Your recipe box is ready.</h3>
                <p>Save a favorite from your kitchen, a family recipe, or something new you want to try.</p>
                <button className="primary-button" type="button" disabled={!storageReady} onClick={() => { setFormInitialDraft(null); setFormRecipe(null) }}><Plus aria-hidden="true" /> Add your first recipe</button>
              </div>
            ) : (
              <div className="empty-state compact-empty">
                <span className="empty-illustration"><Search aria-hidden="true" /></span>
                <h3>{view === 'favorites' && favoriteCount === 0 ? 'No favorites just yet.' : 'No recipes match those filters.'}</h3>
                <p>{view === 'favorites' && favoriteCount === 0 ? 'Tap the heart on a recipe to keep it close.' : 'Try another search or clear your filters.'}</p>
                <button className="secondary-button" type="button" onClick={() => { setQuery(''); setCategory(''); setQuickOnly(false); if (view === 'favorites' && favoriteCount === 0) setView('recipes') }}>
                  {view === 'favorites' && favoriteCount === 0 ? 'Browse recipes' : 'Clear filters'}
                </button>
              </div>
            )}
          </section>
          )}
        </main>
      </div>

      <nav className="mobile-navigation" aria-label="Main navigation">
        {navigation.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" className={`mobile-nav-item ${view === id ? 'active' : ''}`} aria-current={view === id ? 'page' : undefined} onClick={() => setView(id)}>
            <Icon aria-hidden="true" /><span>{label}</span>
          </button>
        ))}
      </nav>

      {formRecipe !== undefined && (
        <RecipeForm
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
