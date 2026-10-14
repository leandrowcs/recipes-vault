import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  writeBatch,
  type DocumentData,
  type Firestore,
} from 'firebase/firestore'
import { isRecipe } from '../lib/recipes'
import { firebaseErrorMessage, getRecipeDatabase } from './firebase'
import type { PantryItem } from '../types/pantry'
import type { Recipe } from '../types/recipe'

export interface VaultSnapshot {
  recipes: Recipe[]
  pantry: PantryItem[]
}

const maximumChanges = 400

export function isPantryItem(value: unknown): value is PantryItem {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<PantryItem>
  return (
    typeof item.id === 'string' &&
    item.id.length > 0 &&
    typeof item.name === 'string' &&
    item.name.trim().length > 0 &&
    typeof item.quantity === 'number' &&
    Number.isFinite(item.quantity) &&
    item.quantity >= 0 &&
    typeof item.unit === 'string' &&
    typeof item.expirationDate === 'string' &&
    (item.expirationDate === '' || Number.isFinite(Date.parse(item.expirationDate))) &&
    typeof item.notes === 'string' &&
    typeof item.createdAt === 'string' &&
    Number.isFinite(Date.parse(item.createdAt)) &&
    typeof item.updatedAt === 'string' &&
    Number.isFinite(Date.parse(item.updatedAt))
  )
}

function assertDocumentIds<T extends { id: string }>(items: T[], kind: string): void {
  if (items.some(({ id }) => !/^[A-Za-z0-9_-]{1,128}$/.test(id))) {
    throw new Error(`The ${kind} collection contains an invalid document ID.`)
  }
  if (new Set(items.map(({ id }) => id)).size !== items.length) {
    throw new Error(`The ${kind} collection contains duplicate document IDs.`)
  }
}

function readCollection<T extends { id: string }>(
  documents: DocumentData[],
  isValid: (value: unknown) => value is T,
  kind: string,
): T[] {
  const items = documents.map((document) => {
    const value: unknown = document
    if (!isValid(value) || !('id' in value) || value.id !== document.id) {
      throw new Error(`An invalid ${kind} record was found in Firestore. Export or repair it before editing this collection.`)
    }
    return value
  })
  assertDocumentIds(items, kind)
  return items
}

export function subscribeToVault(
  uid: string,
  next: (snapshot: VaultSnapshot) => void,
  error: (message: string) => void,
  database: Firestore = getRecipeDatabase(),
): () => void {
  const recipesRef = collection(database, 'users', uid, 'recipes')
  const pantryRef = collection(database, 'users', uid, 'pantry')
  let recipes: Recipe[] | undefined
  let pantry: PantryItem[] | undefined
  let recipesServerReady = false
  let pantryServerReady = false
  let active = true
  const stopWithError = (reason: unknown) => {
    if (!active) return
    active = false
    stopRecipes()
    stopPantry()
    error(reason instanceof Error && reason.message.startsWith('An invalid')
      ? reason.message
      : firebaseErrorMessage(reason))
  }

  const stopRecipes = onSnapshot(
    recipesRef,
    { includeMetadataChanges: true },
    (snapshot) => {
      try {
        if (snapshot.metadata.fromCache) return
        recipes = readCollection(snapshot.docs, isRecipe, 'recipe')
        recipesServerReady = true
        if (recipesServerReady && pantryServerReady && pantry) next({ recipes, pantry })
      } catch (reason) {
        stopWithError(reason)
      }
    },
    stopWithError,
  )

  const stopPantry = onSnapshot(
    pantryRef,
    { includeMetadataChanges: true },
    (snapshot) => {
      try {
        if (snapshot.metadata.fromCache) return
        pantry = readCollection(snapshot.docs, isPantryItem, 'pantry')
        pantryServerReady = true
        if (recipesServerReady && pantryServerReady && recipes) next({ recipes, pantry })
      } catch (reason) {
        stopWithError(reason)
      }
    },
    stopWithError,
  )

  return () => {
    active = false
    stopRecipes()
    stopPantry()
  }
}

export async function saveVaultChanges(
  uid: string,
  previous: VaultSnapshot,
  next: VaultSnapshot,
  database: Firestore = getRecipeDatabase(),
): Promise<void> {
  assertDocumentIds(next.recipes, 'recipe')
  assertDocumentIds(next.pantry, 'pantry')
  if (!next.recipes.every(isRecipe) || !next.pantry.every(isPantryItem)) {
    throw new Error('The requested changes contain invalid recipe or pantry data.')
  }

  const batch = writeBatch(database)
  let changes = 0
  changes += queueChanges(batch, collection(database, 'users', uid, 'recipes'), previous.recipes, next.recipes)
  changes += queueChanges(batch, collection(database, 'users', uid, 'pantry'), previous.pantry, next.pantry)
  if (changes > maximumChanges) {
    throw new Error(`This operation exceeds ${maximumChanges} Firestore changes. Restore a smaller backup.`)
  }
  if (changes) await batch.commit()
}

export async function replaceRecipes(
  uid: string,
  recipes: Recipe[],
  database: Firestore = getRecipeDatabase(),
): Promise<void> {
  assertDocumentIds(recipes, 'recipe')
  if (!recipes.every(isRecipe)) throw new Error('The backup contains invalid recipe data.')

  const recipesRef = collection(database, 'users', uid, 'recipes')
  const current = await getDocs(recipesRef)
  const changes = current.size + recipes.length
  if (changes > maximumChanges) {
    throw new Error(`This backup requires more than ${maximumChanges} Firestore changes. Divide it into smaller backups.`)
  }

  const batch = writeBatch(database)
  current.docs.forEach((document) => batch.delete(document.ref))
  recipes.forEach((recipe) => batch.set(doc(recipesRef, recipe.id), recipe))
  if (changes) await batch.commit()
}

function queueChanges<T extends { id: string }>(
  batch: ReturnType<typeof writeBatch>,
  reference: ReturnType<typeof collection>,
  previous: T[],
  next: T[],
): number {
  const previousById = new Map(previous.map((item) => [item.id, item]))
  const nextById = new Map(next.map((item) => [item.id, item]))
  let changes = 0

  for (const [id, item] of nextById) {
    if (JSON.stringify(previousById.get(id)) === JSON.stringify(item)) continue
    batch.set(doc(reference, id), item)
    changes += 1
  }
  for (const [id] of previousById) {
    if (nextById.has(id)) continue
    batch.delete(doc(reference, id))
    changes += 1
  }

  return changes
}

export async function removePantryItem(
  uid: string,
  itemId: string,
  database: Firestore = getRecipeDatabase(),
): Promise<void> {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(itemId)) throw new Error('Invalid pantry item ID.')
  await deleteDoc(doc(database, 'users', uid, 'pantry', itemId))
}
