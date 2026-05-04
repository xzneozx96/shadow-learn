import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { initDB, saveBreakdown } from '@/db'
import { useWordBreakdown } from '@/hooks/useWordBreakdown'
import { fetchBreakdownStory } from '@/lib/api/breakdownStory'
import 'fake-indexeddb/auto'

vi.mock('@/lib/api/breakdownStory', () => ({
  fetchBreakdownStory: vi.fn(),
}))

afterEach(() => {
  // @ts-expect-error injected by fake-indexeddb
  globalThis.indexedDB = new IDBFactory()
  vi.clearAllMocks()
})

describe('useWordBreakdown', () => {
  it('builds characters from local lookup synchronously after first effect', async () => {
    const db = await initDB()
    vi.mocked(fetchBreakdownStory).mockResolvedValue('mock story')

    const { result } = renderHook(() =>
      useWordBreakdown({
        db,
        word: '学',
        pinyin: 'xué',
        meaning: 'to learn',
        sourceLanguage: 'zh-CN',
        openrouterApiKey: 'sk-test',
      }),
    )

    await waitFor(() => expect(result.current.characters.length).toBe(1), { timeout: 5000 })
    expect(result.current.characters[0].char).toBe('学')
    expect(result.current.characters[0].sinoVietnamese).toBe('học')
  })

  it('returns cached story from IDB without calling LLM', async () => {
    const db = await initDB()
    await saveBreakdown(db, {
      word: '学',
      sourceLanguage: 'zh-CN',
      characters: [],
      story: 'cached story',
      storyLanguage: 'vi',
      generatedAt: '2026-05-04T00:00:00Z',
    })

    const { result } = renderHook(() =>
      useWordBreakdown({
        db,
        word: '学',
        pinyin: 'xué',
        meaning: 'to learn',
        sourceLanguage: 'zh-CN',
        openrouterApiKey: 'sk-test',
      }),
    )

    await waitFor(() => expect(result.current.story).toBe('cached story'))
    expect(fetchBreakdownStory).not.toHaveBeenCalled()
  })

  it('calls LLM on first open and caches the result', async () => {
    const db = await initDB()
    vi.mocked(fetchBreakdownStory).mockResolvedValue('fresh story')

    const { result } = renderHook(() =>
      useWordBreakdown({
        db,
        word: '学',
        pinyin: 'xué',
        meaning: 'to learn',
        sourceLanguage: 'zh-CN',
        openrouterApiKey: 'sk-test',
      }),
    )

    await waitFor(() => expect(result.current.story).toBe('fresh story'))
    expect(fetchBreakdownStory).toHaveBeenCalledTimes(1)
    // Verify the result was persisted
    const { getBreakdown } = await import('@/db')
    const stored = await getBreakdown(db, '学')
    expect(stored?.story).toBe('fresh story')
  })

  it('exposes storyLoading=true while LLM call is in flight', async () => {
    const db = await initDB()
    let resolve!: (s: string) => void
    vi.mocked(fetchBreakdownStory).mockReturnValue(new Promise((r) => { resolve = r }))

    const { result } = renderHook(() =>
      useWordBreakdown({
        db,
        word: '学',
        pinyin: 'xué',
        meaning: 'to learn',
        sourceLanguage: 'zh-CN',
        openrouterApiKey: 'sk-test',
      }),
    )

    await waitFor(() => expect(result.current.storyLoading).toBe(true))
    resolve('done')
    await waitFor(() => expect(result.current.storyLoading).toBe(false))
  })

  it('exposes storyError on failure and lets user retry', async () => {
    const db = await initDB()
    vi.mocked(fetchBreakdownStory)
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce('recovered')

    const { result } = renderHook(() =>
      useWordBreakdown({
        db,
        word: '学',
        pinyin: 'xué',
        meaning: 'to learn',
        sourceLanguage: 'zh-CN',
        openrouterApiKey: 'sk-test',
      }),
    )

    await waitFor(() => expect(result.current.storyError).not.toBeNull())
    expect(result.current.story).toBeNull()

    result.current.retryStory()
    await waitFor(() => expect(result.current.story).toBe('recovered'))
    expect(result.current.storyError).toBeNull()
  })
})
