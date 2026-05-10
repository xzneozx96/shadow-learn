import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCollection } from '@/hooks/useCollection'

const mockResponse = [
  {
    name: 'Mandarin Corner',
    icon: '🎙️',
    playlist_id: 'PL1',
    videos: [
      { video_id: 'abc', title: 'Hi', duration: '1:00', difficulty: 'HSK 1' },
    ],
  },
]

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
