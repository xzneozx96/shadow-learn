import { afterEach, describe, expect, it, vi } from 'vitest'
import { callPageIndexTool } from '@/features/agent/lib/tools/data/pageindexClient'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('callPageIndexTool', () => {
  it('posts {name, args} to /api/pageindex/tool and returns parsed JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ documents: [{ name: 'GRAMMAR.pdf' }] }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await callPageIndexTool('browse_documents', { sort: 'relevance', query: '把' })

    expect(result).toEqual({ documents: [{ name: 'GRAMMAR.pdf' }] })
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('/api/pageindex/tool')
    expect(JSON.parse(init.body)).toEqual({
      name: 'browse_documents',
      args: { sort: 'relevance', query: '把' },
    })
  })

  it('returns { error } on non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 502, json: async () => ({}) }))
    const result = await callPageIndexTool('browse_documents', {}) as { error: string }
    expect(result.error).toContain('502')
  })

  it('returns { error } on network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('boom')))
    const result = await callPageIndexTool('browse_documents', {}) as { error: string }
    expect(result.error).toContain('boom')
  })
})
