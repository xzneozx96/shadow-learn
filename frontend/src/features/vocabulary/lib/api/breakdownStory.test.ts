import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchBreakdownStory } from '@/features/vocabulary/lib/api/breakdownStory'

const ORIGINAL_FETCH = globalThis.fetch

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH
})

describe('fetchBreakdownStory', () => {
  it.each([[undefined, false], [true, true]])('sends force=%s as %s', async (force, sent) => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ story: 's' }), { status: 200 }))

    const story = await fetchBreakdownStory({ word: '学', pinyin: 'xué', meaning: 'to learn', sinoVietnamese: 'học', characters: [], force })

    expect(story).toBe('s')
    const [url, init] = vi.mocked(globalThis.fetch).mock.calls[0]
    expect(String(url)).toMatch(/\/api\/vocab\/breakdown-story$/)
    expect(JSON.parse((init as RequestInit).body as string).force).toBe(sent)
  })
})
