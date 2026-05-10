import type { HubResponse } from '@/types/collection'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCollection } from '@/hooks/useCollection'

const mockResponse: HubResponse = {
  materials: {
    topics: ['Daily Life'],
    groups: [
      {
        difficulty: 'HSK 1-2',
        items: [
          {
            type: 'playlist',
            playlist_id: 'PL1',
            name: 'Test Playlist',
            thumbnail_url: 'https://t.com/1.jpg',
            video_count: 10,
            difficulty: 'HSK 1-2',
            topic: 'Daily Life',
            skill: null,
            content_type: 'material',
          },
        ],
      },
    ],
  },
  tips: {
    groups: [],
  },
}

describe('useCollection', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => mockResponse,
    })))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('starts in loading state, then resolves with data', async () => {
    const { result } = renderHook(() => useCollection())
    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.data).toEqual(mockResponse)
    expect(result.current.data?.materials.topics).toEqual(['Daily Life'])
    const item = result.current.data?.materials.groups[0].items[0]
    expect(item?.type).toBe('playlist')
    expect(result.current.data?.tips.groups).toHaveLength(0)
    expect(result.current.error).toBeNull()
  })

  it('exposes error when fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 })))
    const { result } = renderHook(() => useCollection())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBeTruthy()
    expect(result.current.data).toBeNull()
  })
})
