import type { ReactNode } from 'react'
import type { ShadowLearnDB } from '../db'
import type { DecryptedKeys } from '../types'
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useState,

} from 'react'
import { decryptKeys, encryptKeys } from '../crypto'
import {
  deleteCryptoData,
  getCryptoData,
  initDB,
  saveCryptoData,

} from '../db'
import { captureAuthEvent } from '../lib/posthog-events'

interface AuthState {
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
}

const AuthContext = createContext<AuthState | null>(null)

const TRIAL_SESSION_KEY = 'shadowlearn_trial'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<ShadowLearnDB | null>(null)
  const [isFirstSetup, setIsFirstSetup] = useState<boolean | null>(null)
  const [isUnlocked, setIsUnlocked] = useState(false)
  const [keys, setKeys] = useState<DecryptedKeys | null>(null)
  const [trialMode, setTrialMode] = useState<boolean>(
    () => sessionStorage.getItem(TRIAL_SESSION_KEY) === 'trial',
  )

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

  const lock = useCallback(() => {
    setKeys(null)
    setIsUnlocked(false)
  }, [])

  const resetKeys = useCallback(async () => {
    if (!db)
      throw new Error('Database not initialized')
    await deleteCryptoData(db)
    setKeys(null)
    setIsUnlocked(false)
    setIsFirstSetup(true)
  }, [db])

  return (
    <AuthContext
      value={{ isFirstSetup, isUnlocked, keys, db, trialMode, unlock, setup, resetKeys, lock, startTrial }}
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
