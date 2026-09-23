import type { ReactNode } from 'react'
import type { ShadowLearnDB } from '@/db'
import type { DecryptedKeys } from '@/shared/types'
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useState,

} from 'react'
import {
  deleteCryptoData,
  getCryptoData,
  initDB,
  saveCryptoData,

} from '@/db'
import { apiFetch, clearTokens, hasRefreshToken, onSessionLost, setTokens } from '@/shared/lib/api'
import { decryptKeys, encryptKeys } from '@/shared/lib/crypto'
import { captureAuthEvent } from '@/shared/lib/posthog-events'

interface Session {
  userId: string
  email: string
}

interface AuthState {
  session: Session | null | undefined // undefined = loading
  sessionCheckFailed: boolean
  isFirstSetup: boolean | null // null = loading
  isUnlocked: boolean
  keys: DecryptedKeys | null
  db: ShadowLearnDB | null
  trialMode: boolean
  unlock: (pin: string) => Promise<void>
  setup: (keys: DecryptedKeys, pin: string) => Promise<void>
  resetKeys: () => Promise<void>
  lock: () => void
  startTrial: () => void
  login: (email: string, password: string) => Promise<void>
  signup: (email: string, password: string) => Promise<void>
  logout: () => void
  requestPasswordReset: (email: string) => Promise<void>
  resetPassword: (token: string, password: string) => Promise<void>
}

// eslint-disable-next-line react-refresh/only-export-components
export const AuthContext = createContext<AuthState | null>(null)

const TRIAL_SESSION_KEY = 'shadowlearn_trial'

async function authError(res: Response): Promise<Error> {
  const body = await res.json().catch(() => null)
  const detail = body?.detail
  const code = typeof detail === 'string' ? detail : detail?.code
  return new Error(typeof code === 'string' ? code : `HTTP_${res.status}`)
}

async function fetchSession(): Promise<Session | null> {
  const res = await apiFetch('/api/users/me')
  if (res.status === 401)
    return null
  if (!res.ok)
    throw new Error(`Session check failed: ${res.status}`)
  const me: { id: string, email: string } = await res.json()
  return { userId: me.id, email: me.email }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<ShadowLearnDB | null>(null)
  const [isFirstSetup, setIsFirstSetup] = useState<boolean | null>(null)
  const [isUnlocked, setIsUnlocked] = useState(false)
  const [keys, setKeys] = useState<DecryptedKeys | null>(null)
  const [trialMode, setTrialMode] = useState<boolean>(
    () => sessionStorage.getItem(TRIAL_SESSION_KEY) === 'trial',
  )
  const [session, setSession] = useState<Session | null | undefined>(
    () => hasRefreshToken() ? undefined : null,
  )
  const [sessionCheckFailed, setSessionCheckFailed] = useState(false)

  const lock = useCallback(() => {
    setKeys(null)
    setIsUnlocked(false)
  }, [])

  useEffect(() => {
    onSessionLost(() => {
      setSession(null)
      lock()
    })
    if (hasRefreshToken())
      fetchSession().then(setSession, () => setSessionCheckFailed(true))
  }, [lock])

  useEffect(() => {
    const connect = async (isReconnect = false) => {
      const database = await initDB(() => connect(true))
      setDb(database)
      if (!isReconnect) {
        const cryptoData = await getCryptoData(database)
        setIsFirstSetup(!cryptoData)
      }
    }
    connect()
  }, [])

  const startTrial = useCallback(() => {
    sessionStorage.setItem(TRIAL_SESSION_KEY, 'trial')
    window.history.replaceState({}, '', '/')
    setTrialMode(true)
    setIsUnlocked(true)
    captureAuthEvent('trial_started')
  }, [])

  const setup = useCallback(
    async (newKeys: DecryptedKeys, pin: string) => {
      if (!db)
        throw new Error('Database not initialized')
      const encrypted = await encryptKeys(newKeys, pin)
      await saveCryptoData(db, encrypted)
      sessionStorage.removeItem(TRIAL_SESSION_KEY)
      setKeys(newKeys)
      setIsUnlocked(true)
      setIsFirstSetup(false)
      setTrialMode(false)
      captureAuthEvent('app_setup_complete')
    },
    [db],
  )

  const unlock = useCallback(
    async (pin: string) => {
      if (!db)
        throw new Error('Database not initialized')
      const cryptoData = await getCryptoData(db)
      if (!cryptoData)
        throw new Error('No encrypted keys found')
      const decrypted = await decryptKeys(cryptoData, pin)
      setKeys(decrypted)
      setIsUnlocked(true)
      captureAuthEvent('app_unlocked')
    },
    [db],
  )

  const resetKeys = useCallback(async () => {
    if (!db)
      throw new Error('Database not initialized')
    await deleteCryptoData(db)
    setKeys(null)
    setIsUnlocked(false)
    setIsFirstSetup(true)
  }, [db])

  const login = useCallback(async (email: string, password: string) => {
    const res = await apiFetch('/api/auth/login', {
      method: 'POST',
      body: new URLSearchParams({ username: email, password }),
    })
    if (!res.ok)
      throw await authError(res)
    setTokens(await res.json())
    const signedIn = await fetchSession()
    if (!signedIn) {
      clearTokens()
      throw new Error('SESSION_UNAVAILABLE')
    }
    setSession(signedIn)
  }, [])

  const signup = useCallback(async (email: string, password: string) => {
    const res = await apiFetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    if (!res.ok)
      throw await authError(res)
    await login(email, password)
  }, [login])

  const logout = useCallback(() => {
    clearTokens()
    sessionStorage.removeItem(TRIAL_SESSION_KEY)
    setTrialMode(false)
    setSession(null)
    lock()
  }, [lock])

  const requestPasswordReset = useCallback(async (email: string) => {
    const res = await apiFetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    if (!res.ok)
      throw await authError(res)
  }, [])

  const resetPassword = useCallback(async (token: string, password: string) => {
    const res = await apiFetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password }),
    })
    if (!res.ok)
      throw await authError(res)
    logout()
  }, [logout])

  return (
    <AuthContext
      value={{
        session,
        sessionCheckFailed,
        isFirstSetup,
        isUnlocked,
        keys,
        db,
        trialMode,
        unlock,
        setup,
        resetKeys,
        lock,
        startTrial,
        login,
        signup,
        logout,
        requestPasswordReset,
        resetPassword,
      }}
    >
      {children}
    </AuthContext>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  const ctx = use(AuthContext)
  if (!ctx)
    throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
