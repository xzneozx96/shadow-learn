import type { ReactNode } from 'react'
import type { ProviderKeyState } from '@/features/settings/api/keys'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Settings } from '@/features/settings/ui/Settings'
import { apiFetch } from '@/shared/lib/api'

vi.mock('@/app/Layout', () => ({ Layout: ({ children }: { children: ReactNode }) => children }))
vi.mock('@/app/providers/AuthContext', () => ({ useAuth: () => ({ db: null }) }))
vi.mock('@/app/providers/I18nContext', async () => {
  const { getTranslation } = await import('@/shared/lib/i18n')
  return { useI18n: () => ({ locale: 'en', setLocale: vi.fn(), t: getTranslation('en') }) }
})
vi.mock('@/shared/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/lib/api')>()
  return { ...actual, apiFetch: vi.fn() }
})

let server: Record<string, ProviderKeyState>

function state(provider: ProviderKeyState['provider']): ProviderKeyState {
  return server[provider]
}

function fakeApiFetch(path: string, init?: RequestInit): Promise<Response> {
  const method = init?.method ?? 'GET'
  if (path === '/api/keys' && method === 'GET')
    return Promise.resolve(Response.json(Object.values(server)))
  const provider = path.split('/').pop() as ProviderKeyState['provider']
  if (method === 'PUT') {
    const { value, region } = JSON.parse(init!.body as string)
    server[provider] = { provider, source: 'user', last4: value.slice(-4), region }
    return Promise.resolve(Response.json(server[provider]))
  }
  if (method === 'DELETE') {
    server[provider] = { provider, source: provider === 'openrouter' ? 'env' : 'none', last4: null, region: null }
    return Promise.resolve(new Response(null, { status: 204 }))
  }
  return Promise.reject(new Error(`unexpected ${method} ${path}`))
}

function row(provider: string) {
  return within(screen.getByTestId(`provider-key-${provider}`))
}

async function renderSettings() {
  render(<Settings />)
  await screen.findByTestId('provider-key-google')
}

beforeEach(() => {
  server = {
    openrouter: { provider: 'openrouter', source: 'env', last4: null, region: null },
    azure_speech: { provider: 'azure_speech', source: 'none', last4: null, region: null },
    google: { provider: 'google', source: 'none', last4: null, region: null },
  }
  vi.mocked(apiFetch).mockReset().mockImplementation(fakeApiFetch)
})

describe('settings provider keys card', () => {
  it('shows each provider state from the server', async () => {
    await renderSettings()

    expect(row('openrouter').getByText('Using shared key')).toBeInTheDocument()
    expect(row('azure_speech').getByText('Not configured')).toBeInTheDocument()
    expect(row('google').getByText('Not configured')).toBeInTheDocument()
  })

  it('saves a key and shows only its last four characters', async () => {
    await renderSettings()

    await userEvent.type(row('openrouter').getByPlaceholderText('Paste a new key'), 'sk-or-secret-ab12')
    await userEvent.click(row('openrouter').getByRole('button', { name: 'Save' }))

    expect(await row('openrouter').findByText('Using your key ...ab12')).toBeInTheDocument()
    expect(screen.queryByText(/sk-or-secret/)).not.toBeInTheDocument()
    expect(apiFetch).toHaveBeenCalledWith('/api/keys/openrouter', expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({ value: 'sk-or-secret-ab12', region: null }),
    }))
    expect(row('openrouter').getByPlaceholderText('Paste a new key')).toHaveValue('')
  })

  it('sends the region with an Azure Speech key', async () => {
    await renderSettings()

    await userEvent.type(row('azure_speech').getByPlaceholderText('Paste a new key'), 'azure-key-cd34')
    await userEvent.type(row('azure_speech').getByLabelText('Azure Speech Region'), 'eastus')
    await userEvent.click(row('azure_speech').getByRole('button', { name: 'Save' }))

    expect(await row('azure_speech').findByText('Using your key ...cd34')).toBeInTheDocument()
    expect(state('azure_speech').region).toBe('eastus')
  })

  it('removes a saved key and falls back to the shared key', async () => {
    server.openrouter = { provider: 'openrouter', source: 'user', last4: 'ab12', region: null }
    await renderSettings()

    await userEvent.click(row('openrouter').getByRole('button', { name: 'Remove' }))

    await waitFor(() => expect(row('openrouter').getByText('Using shared key')).toBeInTheDocument())
    expect(apiFetch).toHaveBeenCalledWith('/api/keys/openrouter', { method: 'DELETE' })
    expect(row('openrouter').queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument()
  })

  it('offers Remove only for a key the user saved', async () => {
    await renderSettings()

    expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument()
  })
})
