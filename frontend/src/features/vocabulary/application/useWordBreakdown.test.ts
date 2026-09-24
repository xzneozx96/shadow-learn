import type { WordStory } from '@/db'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useWordBreakdown } from '@/features/vocabulary/application/useWordBreakdown'
import { fetchBreakdownStory } from '@/features/vocabulary/lib/api/breakdownStory'
import { FakeApiClient, fakeDataClient } from '../../../../tests/fake-api'

vi.mock('@/features/vocabulary/lib/api/breakdownStory', () => ({
  fetchBreakdownStory: vi.fn(),
}))

let api: FakeApiClient

beforeEach(() => {
  api = new FakeApiClient()
})

afterEach(() => {
  vi.clearAllMocks()
})

function renderBreakdown() {
  const db = fakeDataClient(api)
  return renderHook(() => useWordBreakdown({ db, word: '学', lang: 'vi', pinyin: 'xué', meaning: 'to learn' }))
}

describe('useWordBreakdown', () => {
  it('builds characters from local lookup synchronously after first effect', async () => {
    vi.mocked(fetchBreakdownStory).mockResolvedValue('mock story')

    const { result } = renderBreakdown()

    await waitFor(() => expect(result.current.characters.length).toBe(1), { timeout: 5000 })
    expect(result.current.characters[0].char).toBe('学')
    expect(result.current.characters[0].sinoVietnamese).toBe('học')
  })

  it('shows the user\'s own story without calling the story endpoint', async () => {
    api.seedStore('word-stories', [{ word: '学', lang: 'vi', story: 'my story', updatedAt: '2026-05-04T00:00:00Z' }])

    const { result } = renderBreakdown()

    await waitFor(() => expect(result.current.story).toBe('my story'))
    expect(fetchBreakdownStory).not.toHaveBeenCalled()
  })

  it('fetches the shared story when the user has none, without saving a copy', async () => {
    vi.mocked(fetchBreakdownStory).mockResolvedValue('catalog story')

    const { result } = renderBreakdown()

    await waitFor(() => expect(result.current.story).toBe('catalog story'))
    expect(fetchBreakdownStory).toHaveBeenCalledTimes(1)
    expect(vi.mocked(fetchBreakdownStory).mock.calls[0][0]).toEqual(expect.objectContaining({ word: '学', force: false }))
    expect(api.storeRows('word-stories')).toEqual([])
  })

  it('saveCustomStory stores the edit in word-stories', async () => {
    vi.mocked(fetchBreakdownStory).mockResolvedValue('catalog story')
    const { result } = renderBreakdown()
    await waitFor(() => expect(result.current.story).toBe('catalog story'))

    await act(async () => {
      await result.current.saveCustomStory('edited story')
    })

    expect(result.current.story).toBe('edited story')
    expect(api.storeRows<WordStory>('word-stories')).toEqual([
      expect.objectContaining({ word: '学', lang: 'vi', story: 'edited story' }),
    ])
  })

  it('regenerateStory drops the own story, forces a fresh one, and saves it', async () => {
    api.seedStore('word-stories', [{ word: '学', lang: 'vi', story: 'my story', updatedAt: '2026-05-04T00:00:00Z' }])
    vi.mocked(fetchBreakdownStory).mockResolvedValue('fresh story')
    const { result } = renderBreakdown()
    await waitFor(() => expect(result.current.story).toBe('my story'))

    await act(async () => {
      await result.current.regenerateStory()
    })

    await waitFor(() => expect(result.current.story).toBe('fresh story'))
    expect(fetchBreakdownStory).toHaveBeenCalledTimes(1)
    expect(vi.mocked(fetchBreakdownStory).mock.calls[0][0]).toEqual(expect.objectContaining({ force: true }))
    await waitFor(() => expect(api.storeRows<WordStory>('word-stories')).toEqual([
      expect.objectContaining({ word: '学', story: 'fresh story' }),
    ]))
    expect(api.calls).toContainEqual({ method: 'DELETE', path: `/api/store/word-stories/${encodeURIComponent('学:vi')}` })
  })

  it('exposes storyLoading=true while LLM call is in flight', async () => {
    let resolve!: (s: string) => void
    vi.mocked(fetchBreakdownStory).mockReturnValue(new Promise((r) => { resolve = r }))

    const { result } = renderBreakdown()

    await waitFor(() => expect(result.current.storyLoading).toBe(true))
    resolve('done')
    await waitFor(() => expect(result.current.storyLoading).toBe(false))
  })

  it('exposes storyError on failure and lets user retry', async () => {
    vi.mocked(fetchBreakdownStory)
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce('recovered')

    const { result } = renderBreakdown()

    await waitFor(() => expect(result.current.storyError).not.toBeNull())
    expect(result.current.story).toBeNull()

    act(() => result.current.retryStory())
    await waitFor(() => expect(result.current.story).toBe('recovered'))
    expect(result.current.storyError).toBeNull()
  })
})
