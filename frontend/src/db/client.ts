import { apiFetch, responseError } from '@/shared/lib/api'

export interface ApiClient {
  get: <T>(path: string) => Promise<T | undefined>
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
