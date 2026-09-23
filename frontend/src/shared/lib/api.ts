import { API_BASE } from '@/shared/lib/config'

const REFRESH_KEY = 'shadowlearn.refresh'

export interface TokenPair {
  access_token: string
  refresh_token: string
}

let accessToken: string | null = null
// Bumped on sign-out so a refresh already in flight cannot sign the user back in.
let generation = 0
let refreshing: Promise<boolean> | null = null
let sessionLost = () => {}

export function setTokens(pair: TokenPair) {
  accessToken = pair.access_token
  localStorage.setItem(REFRESH_KEY, pair.refresh_token)
}

export function clearTokens() {
  accessToken = null
  generation++
  localStorage.removeItem(REFRESH_KEY)
}

export function hasRefreshToken() {
  return localStorage.getItem(REFRESH_KEY) !== null
}

export function onSessionLost(callback: () => void) {
  sessionLost = callback
}

async function refresh(): Promise<boolean> {
  const refreshToken = localStorage.getItem(REFRESH_KEY)
  if (!refreshToken)
    return false
  const started = generation
  const res = await fetch(`${API_BASE}/api/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
  })
  if (res.status === 401)
    return false
  if (!res.ok)
    throw new Error(`Token refresh failed: ${res.status}`)
  const pair: TokenPair = await res.json()
  if (generation !== started)
    return false
  setTokens(pair)
  return true
}

function refreshOnce(): Promise<boolean> {
  refreshing ??= refresh().finally(() => {
    refreshing = null
  })
  return refreshing
}

function withAuth(token: string | null, init?: RequestInit): RequestInit | undefined {
  if (!token)
    return init
  const headers = new Headers(init?.headers)
  headers.set('Authorization', `Bearer ${token}`)
  return { ...init, headers }
}

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const url = `${API_BASE}${path}`
  const sent = accessToken
  const res = await fetch(url, withAuth(sent, init))
  if (res.status !== 401 || (sent === null && !hasRefreshToken()))
    return res
  if (accessToken === sent && !(await refreshOnce())) {
    clearTokens()
    sessionLost()
    return res
  }
  return fetch(url, withAuth(accessToken, init))
}
