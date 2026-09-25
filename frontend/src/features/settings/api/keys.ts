import { apiFetch, responseError } from '@/shared/lib/api'

export type Provider = 'openrouter' | 'azure_speech' | 'google'

export interface ProviderKeyState {
  provider: Provider
  source: 'user' | 'env' | 'none'
  last4: string | null
  region: string | null
}

export async function listKeys(): Promise<ProviderKeyState[]> {
  const res = await apiFetch('/api/keys')
  if (!res.ok)
    throw await responseError(res, `Server error: ${res.status}`)
  return res.json()
}

export async function saveKey(provider: Provider, value: string, region: string | null): Promise<ProviderKeyState> {
  const res = await apiFetch(`/api/keys/${provider}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value, region }),
  })
  if (!res.ok)
    throw await responseError(res, `Server error: ${res.status}`)
  return res.json()
}

export async function removeKey(provider: Provider): Promise<void> {
  const res = await apiFetch(`/api/keys/${provider}`, { method: 'DELETE' })
  if (!res.ok)
    throw await responseError(res, `Server error: ${res.status}`)
}
