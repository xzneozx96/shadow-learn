import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useTipCourse } from '@/features/learning-materials/application/useTipCourse'

const ORIGINAL_FETCH = globalThis.fetch

const PL123_RESPONSE = {
  name: 'Pronunciation',
  thumbnail_url: null,
  channel: 'ChinesePod',
  published_at: '2026-05-01',
  topic: 'Pronunciation',
  videos: [
    {
      video_id: 'v1',
      title: 'Tones',
      duration: '8:15',
      difficulty: null,
      view_count: null,
      channel: 'ChinesePod',
      description: null,
      published_at: null,
      topic: 'Pronunciation',
      skill: null,
      content_type: 'tip',
    },
  ],
}

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH
  vi.restoreAllMocks()
})

describe('useTipCourse', () => {
  it('loads a playlist course', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => PL123_RESPONSE,
    }) as unknown as typeof fetch

    const { result } = renderHook(() => useTipCourse('playlist', 'PL123'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.course?.name).toBe('Pronunciation')
    expect(result.current.lessons).toHaveLength(1)
    expect(result.current.lessons[0]).toMatchObject({ videoId: 'v1', title: 'Tones', duration: '8:15' })
  })

  it('synthesizes a mini-course-of-1 for source=video without hitting the API', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({}),
    }) as unknown as typeof fetch

    const { result } = renderHook(() => useTipCourse('video', 'lone-vid'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.course?.source).toBe('video')
    expect(result.current.lessons.map(l => l.videoId)).toEqual(['lone-vid'])
    expect(globalThis.fetch).not.toHaveBeenCalledWith(
      expect.stringContaining('/api/playlist/'),
      expect.anything(),
    )
  })

  it('exposes a 404 as error', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({}),
    }) as unknown as typeof fetch

    const { result } = renderHook(() => useTipCourse('playlist', 'MISSING'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBeInstanceOf(Error)
    expect(result.current.course).toBeNull()
  })
})
