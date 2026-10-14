import { LogIn } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { firebaseConfigured, firebaseErrorMessage, firebaseSetupMissing, listenToAuth, ownerEmail, ownerUid, signInWithGoogle, signOutGoogle } from '../services/firebase'
import { translate, type Locale } from '../lib/locale'
import type { User } from 'firebase/auth'

interface AuthGateProps {
  locale: Locale
  children: (user: User) => ReactNode
}

export function AuthGate({ children, locale }: AuthGateProps) {
  const t = (key: string) => translate(locale, key)
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
        setError(firebaseErrorMessage(reason, locale))
      },
    )
  }, [locale])

  async function signIn() {
    setError('')
    setIsSigningIn(true)
    try {
      await signInWithGoogle()
    } catch (reason) {
      setError(firebaseErrorMessage(reason, locale))
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
      setError(firebaseErrorMessage(reason, locale))
    }
  }

  if (!firebaseConfigured) {
    return (
      <AuthMessage locale={locale} title={t('firebaseSetupTitle')}>
        <p>{t('firebaseSetupBody')}</p>
        <ul>{firebaseSetupMissing.map((name) => <li key={name}><code>{name}</code></li>)}</ul>
        <p>{t('firebaseLocalBody')}</p>
      </AuthMessage>
    )
  }

  if (isLoading) {
    return <AuthMessage locale={locale} title={t('checkingAccount')}><p role="status">{t('connectingGoogle')}</p></AuthMessage>
  }

  if (!user) {
    return (
      <AuthMessage locale={locale} title={t('authWelcome')}>
        <p>{t('authPrompt')}</p>
        <button className="primary-button" type="button" disabled={isSigningIn} onClick={() => void signIn()}>
          <LogIn aria-hidden="true" /> {isSigningIn ? t('connecting') : t('continueGoogle')}
        </button>
        {error && <p className="auth-error" role="alert">{error}</p>}
      </AuthMessage>
    )
  }

  if (user.email?.toLowerCase() !== ownerEmail || !user.emailVerified) {
    return (
      <AuthMessage locale={locale} title={t('accessDenied')}>
        <p>{t('signedInAs')} <strong>{user.email ?? t('unverifiedAccount')}</strong>. {t('authorizedEmail')}</p>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button className="secondary-button" type="button" onClick={() => void signOut()}>{t('signOut')}</button>
      </AuthMessage>
    )
  }

  if (!ownerUid) {
    return (
      <AuthMessage locale={locale} title={t('finishOwnerSetup')}>
        <p>{t('ownerUidInstructions')}</p>
        <code className="auth-uid">{user.uid}</code>
        <p>{t('ownerUidVercel')}</p>
        <button className="secondary-button" type="button" onClick={() => void signOut()}>{t('signOut')}</button>
      </AuthMessage>
    )
  }

  if (user.uid !== ownerUid) {
    return (
      <AuthMessage locale={locale} title={t('accessDenied')}>
        <p>{t('unauthorizedUid')}</p>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button className="secondary-button" type="button" onClick={() => void signOut()}>{t('signOut')}</button>
      </AuthMessage>
    )
  }

  return children(user)
}

function AuthMessage({ locale, title, children }: { locale: Locale; title: string; children: ReactNode }) {
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <img className="auth-logo" src="/recipes-vault-logo.svg" alt="" />
        <p className="eyebrow">{translate(locale, 'privateCookbook')}</p>
        <h1>{title}</h1>
        {children}
      </section>
    </main>
  )
}
