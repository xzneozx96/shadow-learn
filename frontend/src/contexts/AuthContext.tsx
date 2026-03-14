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

interface AuthState {
  isFirstSetup: boolean | null // null = loading
  isUnlocked: boolean
  keys: DecryptedKeys | null
  db: ShadowLearnDB | null
  unlock: (pin: string) => Promise<void>
  setup: (keys: DecryptedKeys, pin: string) => Promise<void>
  resetKeys: () => Promise<void>
  lock: () => void
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<ShadowLearnDB | null>(null)
  const [isFirstSetup, setIsFirstSetup] = useState<boolean | null>(null)
  const [isUnlocked, setIsUnlocked] = useState(false)
  const [keys, setKeys] = useState<DecryptedKeys | null>(null)

  useEffect(() => {
    initDB().then(async (database) => {
      setDb(database)
      const cryptoData = await getCryptoData(database)
      setIsFirstSetup(!cryptoData)
    })
  }, [])

  const setup = useCallback(
    async (newKeys: DecryptedKeys, pin: string) => {
      if (!db)
        throw new Error('Database not initialized')
      const encrypted = await encryptKeys(newKeys, pin)
      await saveCryptoData(db, encrypted)
      setKeys(newKeys)
      setIsUnlocked(true)
      setIsFirstSetup(false)
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
      value={{ isFirstSetup, isUnlocked, keys, db, unlock, setup, resetKeys, lock }}
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
