import type { ReactNode } from 'react'
import type { DataClient } from '@/db'
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,

} from 'react'
import { createApiClient } from '@/db'
import { pendingLessonsKey } from '@/features/lesson/application/pendingLessons'
import { clearUploadThumbnails } from '@/features/lesson/application/useUploadThumbnail'
import { apiFetch, clearTokens, hasRefreshToken, onSessionLost, setTokens } from '@/shared/lib/api'

interface Session {
  userId: string
  email: string
}

interface AuthState {
  session: Session | null | undefined // undefined = loading
  sessionCheckFailed: boolean
  db: DataClient | null
  login: (email: string, password: string) => Promise<void>
  signup: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  requestPasswordReset: (email: string) => Promise<void>
  resetPassword: (token: string, password: string) => Promise<void>
}

// eslint-disable-next-line react-refresh/only-export-components
export const AuthContext = createContext<AuthState | null>(null)

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
  const [session, setSession] = useState<Session | null | undefined>(
    () => hasRefreshToken() ? undefined : null,
  )
  const [sessionCheckFailed, setSessionCheckFailed] = useState(false)

  useEffect(() => {
    if (hasRefreshToken())
      fetchSession().then(setSession, () => setSessionCheckFailed(true))
  }, [])

  const userId = session?.userId
  const db = useMemo<DataClient | null>(
    () => userId ? { api: createApiClient() } : null,
    [userId],
  )

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

  const endLocalSession = useCallback(() => {
    if (userId)
      localStorage.removeItem(pendingLessonsKey(userId))
    clearUploadThumbnails()
    clearTokens()
    setSession(null)
  }, [userId])

  useEffect(() => {
    onSessionLost(endLocalSession)
  }, [endLocalSession])

  const logout = useCallback(async () => {
    await apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => {})
    endLocalSession()
  }, [endLocalSession])

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
    endLocalSession()
  }, [endLocalSession])

  return (
    <AuthContext
      value={{
        session,
        sessionCheckFailed,
        db,
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
