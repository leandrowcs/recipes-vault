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
  ...Object.entries(config)
    .filter(([, value]) => !value)
    .map(([key]) => key),
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

export function firebaseErrorMessage(error: unknown): string {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : ''
  const messages: Record<string, string> = {
    'auth/popup-closed-by-user': 'Login cancelled. Try again when you are ready.',
    'auth/popup-blocked': 'Allow pop-ups for this site, then try again.',
    'auth/unauthorized-domain': 'Add this site domain under Firebase Authentication → Settings → Authorized domains.',
    'auth/operation-not-allowed': 'Enable Google under Firebase Authentication → Sign-in method.',
    'auth/network-request-failed': 'Connect to the internet to sign in.',
    'permission-denied': 'Cloud access denied. Verify the owner UID in Firestore Rules.',
    unavailable: 'Firebase is temporarily unavailable. Check your connection and retry.',
  }
  return messages[code] ?? 'Unable to connect to your account. Check Firebase setup and try again.'
}
