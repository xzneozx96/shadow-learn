import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/shared/lib/config', () => ({ API_BASE: 'http://api.test' }))

function json(status: number, body: unknown = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function authOf(init?: RequestInit) {
  return new Headers(init?.headers).get('Authorization')
}

async function loadApi() {
  vi.resetModules()
  return import('@/shared/lib/api')
}

describe('apiFetch', () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    localStorage.clear()
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('refreshes once on a 401 and retries with the new access token', async () => {
    const api = await loadApi()
    api.setTokens({ access_token: 'old-access', refresh_token: 'refresh-1' })
    fetchMock.mockImplementation(async (input, init) => {
      if (input === 'http://api.test/api/auth/refresh')
        return json(200, { access_token: 'new-access', refresh_token: 'refresh-2' })
      return authOf(init) === 'Bearer new-access' ? json(200, { ok: true }) : json(401)
    })

    const res = await api.apiFetch('/api/jobs/abc')

    expect(res.status).toBe(200)
    const refreshCalls = fetchMock.mock.calls.filter(([url]) => url === 'http://api.test/api/auth/refresh')
    expect(refreshCalls).toHaveLength(1)
    expect(JSON.parse(refreshCalls[0][1]!.body as string)).toEqual({ refresh_token: 'refresh-1' })
    expect(authOf(fetchMock.mock.calls.at(-1)![1])).toBe('Bearer new-access')
    expect(localStorage.getItem('shadowlearn.refresh')).toBe('refresh-2')
  })

  it('shares one refresh between two concurrent 401s', async () => {
    const api = await loadApi()
    api.setTokens({ access_token: 'old-access', refresh_token: 'refresh-1' })
    let releaseRefresh!: () => void
    const refreshGate = new Promise<void>((resolve) => {
      releaseRefresh = resolve
    })
    fetchMock.mockImplementation(async (input, init) => {
      if (input === 'http://api.test/api/auth/refresh') {
        await refreshGate
        return json(200, { access_token: 'new-access', refresh_token: 'refresh-2' })
      }
      return authOf(init) === 'Bearer new-access' ? json(200) : json(401)
    })

    const both = Promise.all([api.apiFetch('/api/jobs/a'), api.apiFetch('/api/jobs/b')])
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3))
    releaseRefresh()
    const [a, b] = await both

    expect([a.status, b.status]).toEqual([200, 200])
    const refreshCalls = fetchMock.mock.calls.filter(([url]) => url === 'http://api.test/api/auth/refresh')
    expect(refreshCalls).toHaveLength(1)
  })

  it('drops the session when the refresh token is rejected', async () => {
    const api = await loadApi()
    const lost = vi.fn()
    api.onSessionLost(lost)
    api.setTokens({ access_token: 'old-access', refresh_token: 'revoked' })
    fetchMock.mockResolvedValue(json(401))

    const res = await api.apiFetch('/api/users/me')

    expect(res.status).toBe(401)
    expect(lost).toHaveBeenCalledOnce()
    expect(localStorage.getItem('shadowlearn.refresh')).toBeNull()
  })

  it('passes the request through untouched when signed out', async () => {
    const api = await loadApi()
    const init = { method: 'POST', body: 'x' }
    fetchMock.mockResolvedValue(json(200))

    await api.apiFetch('/api/config', init)

    expect(fetchMock).toHaveBeenCalledWith('http://api.test/api/config', init)
  })
})
