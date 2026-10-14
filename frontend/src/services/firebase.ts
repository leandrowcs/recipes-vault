import { getApp, getApps, initializeApp } from 'firebase/app'
import {
  browserLocalPersistence,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  setPersistence,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth'
import { initializeFirestore, memoryLocalCache } from 'firebase/firestore'
import { translate, type Locale } from '../lib/locale'

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

export const ownerEmail = (import.meta.env.VITE_OWNER_EMAIL ?? '').trim().toLowerCase()
export const ownerUid = (import.meta.env.VITE_OWNER_UID ?? '').trim()
export const firebaseConfigured = Object.values(config).every(Boolean) && Boolean(ownerEmail)
export const firebaseSetupMissing: string[] = [
  ...[
    ['VITE_FIREBASE_API_KEY', config.apiKey],
    ['VITE_FIREBASE_AUTH_DOMAIN', config.authDomain],
    ['VITE_FIREBASE_PROJECT_ID', config.projectId],
    ['VITE_FIREBASE_APP_ID', config.appId],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name),
  ...(!ownerEmail ? ['VITE_OWNER_EMAIL'] : []),
]

const app = firebaseConfigured
  ? (getApps().length > 0 ? getApp() : initializeApp(config))
  : null

export const firebaseAuth = app ? getAuth(app) : null

let database: ReturnType<typeof initializeFirestore> | undefined

export function getRecipeDatabase() {
  if (!app) throw new Error('Firebase is not configured. Complete the setup before loading recipes.')
  database ??= initializeFirestore(app, { localCache: memoryLocalCache() })
  return database
}

export function listenToAuth(
  next: (user: User | null) => void,
  error: (reason: unknown) => void,
): () => void {
  if (!firebaseAuth) return () => undefined
  return onAuthStateChanged(firebaseAuth, next, error)
}

export async function signInWithGoogle(): Promise<void> {
  if (!firebaseAuth) throw new Error('Firebase is not configured.')
  await setPersistence(firebaseAuth, browserLocalPersistence)
  const provider = new GoogleAuthProvider()
  provider.setCustomParameters({ prompt: 'select_account' })
  await signInWithPopup(firebaseAuth, provider)
}

export async function signOutGoogle(): Promise<void> {
  if (!firebaseAuth) throw new Error('Firebase is not configured.')
  await signOut(firebaseAuth)
}

export function firebaseErrorMessage(error: unknown, locale: Locale = 'en-US'): string {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : ''
  const messages: Record<string, string> = {
    'auth/popup-closed-by-user': 'signInCancelled',
    'auth/popup-blocked': 'allowPopups',
    'auth/unauthorized-domain': 'authorizeDomain',
    'auth/operation-not-allowed': 'enableGoogle',
    'auth/network-request-failed': 'authNetwork',
    'permission-denied': 'cloudDenied',
    unavailable: 'firebaseUnavailable',
  }
  return translate(locale, messages[code] ?? 'authConnectionError')
}
