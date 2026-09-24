import { apiFetch, responseError } from '@/shared/lib/api'

// `version` is the row's ETag; null means the record does not exist yet.
export interface Versioned<T> {
  value: T | undefined
  version: string | null
}

export type VersionedPut<T> = { ok: true } | { ok: false, current: Versioned<T> }

export interface ApiClient {
  get: <T>(path: string) => Promise<T | undefined>
  getVersioned: <T>(path: string) => Promise<Versioned<T>>
  putVersioned: <T>(path: string, body: T, version: string | null) => Promise<VersionedPut<T>>
  list: <T>(path: string, query?: Record<string, string>) => Promise<T[]>
  put: (path: string, body: unknown) => Promise<void>
  del: (path: string) => Promise<void>
  bulk: (store: string, records: unknown[], mode?: 'import' | 'replace') => Promise<void>
  fetch: (path: string, init?: RequestInit) => Promise<Response>
}

export interface DataClient {
  api: ApiClient
}

function jsonInit(method: string, body: unknown): RequestInit {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
}

export function createApiClient(send: ApiClient['fetch'] = apiFetch): ApiClient {
  async function ok(path: string, init?: RequestInit): Promise<Response> {
    const res = await send(path, init)
    if (!res.ok)
      throw await responseError(res, `${init?.method ?? 'GET'} ${path} failed: ${res.status}`)
    return res
  }

  return {
    async get(path) {
      const res = await send(path)
      if (res.status === 404)
        return undefined
      if (!res.ok)
        throw await responseError(res, `GET ${path} failed: ${res.status}`)
      return res.json()
    },
    async getVersioned(path) {
      const res = await send(path)
      if (res.status === 404)
        return { value: undefined, version: null }
      if (!res.ok)
        throw await responseError(res, `GET ${path} failed: ${res.status}`)
      return { value: await res.json(), version: res.headers.get('ETag') }
    },
    async putVersioned(path, body, version) {
      const precondition: Record<string, string> = version === null ? { 'If-None-Match': '*' } : { 'If-Match': version }
      const res = await send(path, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...precondition },
        body: JSON.stringify(body),
      })
      if (res.status === 409) {
        const conflict = await res.clone().json().catch(() => null)
        if (conflict?.detail === 'version conflict')
          return { ok: false, current: { value: conflict.record ?? undefined, version: res.headers.get('ETag') } }
      }
      if (!res.ok)
        throw await responseError(res, `PUT ${path} failed: ${res.status}`)
      return { ok: true }
    },
    async list(path, query) {
      const search = query ? `?${new URLSearchParams(query)}` : ''
      return (await ok(`${path}${search}`)).json()
    },
    async put(path, body) {
      await ok(path, jsonInit('PUT', body))
    },
    async del(path) {
      await ok(path, { method: 'DELETE' })
    },
    async bulk(store, records, mode = 'replace') {
      await ok(`/api/store/${store}/bulk`, jsonInit('POST', { mode, records }))
    },
    fetch: send,
  }
}
