import { ChefHat, LogIn } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { firebaseConfigured, firebaseErrorMessage, firebaseSetupMissing, listenToAuth, ownerEmail, ownerUid, signInWithGoogle, signOutGoogle } from '../services/firebase'
import type { User } from 'firebase/auth'

interface AuthGateProps {
  children: (user: User) => ReactNode
}

export function AuthGate({ children }: AuthGateProps) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(firebaseConfigured)
  const [isSigningIn, setIsSigningIn] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!firebaseConfigured) return
    return listenToAuth(
      (nextUser) => {
        setUser(nextUser)
        setIsLoading(false)
        setError('')
      },
      (reason) => {
        setIsLoading(false)
        setError(firebaseErrorMessage(reason))
      },
    )
  }, [])

  async function signIn() {
    setError('')
    setIsSigningIn(true)
    try {
      await signInWithGoogle()
    } catch (reason) {
      setError(firebaseErrorMessage(reason))
    } finally {
      setIsSigningIn(false)
    }
  }

  async function signOut() {
    try {
      await signOutGoogle()
      setUser(null)
      setError('')
    } catch (reason) {
      setError(firebaseErrorMessage(reason))
    }
  }

  if (!firebaseConfigured) {
    return (
      <AuthMessage title="Firebase setup required">
        <p>Add these Firebase values to <code>frontend/.env.local</code> for development and to the Vercel environment settings before deploying.</p>
        <ul>{firebaseSetupMissing.map((name) => <li key={name}><code>{name}</code></li>)}</ul>
        <p>See the repository README for the setup steps.</p>
      </AuthMessage>
    )
  }

  if (isLoading) {
    return <AuthMessage title="Checking your account"><p role="status">Connecting securely to Google…</p></AuthMessage>
  }

  if (!user) {
    return (
      <AuthMessage title="Your recipes, just for you">
        <p>Sign in with the Google account authorized for this recipe vault.</p>
        <button className="primary-button" type="button" disabled={isSigningIn} onClick={() => void signIn()}>
          <LogIn aria-hidden="true" /> {isSigningIn ? 'Connecting…' : 'Continue with Google'}
        </button>
        {error && <p className="auth-error" role="alert">{error}</p>}
      </AuthMessage>
    )
  }

  if (user.email?.toLowerCase() !== ownerEmail || !user.emailVerified) {
    return (
      <AuthMessage title="This account does not have access">
        <p>Signed in as <strong>{user.email ?? 'an unverified account'}</strong>. Use the authorized, verified Google email configured for this vault.</p>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button className="secondary-button" type="button" onClick={() => void signOut()}>Sign out</button>
      </AuthMessage>
    )
  }

  if (!ownerUid) {
    return (
      <AuthMessage title="Finish owner-only access setup">
        <p>Copy this account UID to <code>VITE_OWNER_UID</code> and <code>firestore.rules</code>. Your recipes stay locked until both values match and the rules are deployed.</p>
        <code className="auth-uid">{user.uid}</code>
        <p>Then add <code>VITE_OWNER_UID</code> to Vercel and redeploy.</p>
        <button className="secondary-button" type="button" onClick={() => void signOut()}>Sign out</button>
      </AuthMessage>
    )
  }

  if (user.uid !== ownerUid) {
    return (
      <AuthMessage title="This account does not have access">
        <p>The signed-in Google account is not the account authorized for this recipe vault.</p>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button className="secondary-button" type="button" onClick={() => void signOut()}>Sign out</button>
      </AuthMessage>
    )
  }

  return children(user)
}

function AuthMessage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <span className="brand-icon"><ChefHat aria-hidden="true" /></span>
        <p className="eyebrow">YOUR PRIVATE COOKBOOK</p>
        <h1>{title}</h1>
        {children}
      </section>
    </main>
  )
}
