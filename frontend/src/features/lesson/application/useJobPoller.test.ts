import type { LessonMeta } from '@/shared/types'
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useJobPoller } from '@/features/lesson/application/useJobPoller'
import { posthog } from '@/shared/lib/posthog'

vi.mock('@/shared/lib/posthog', () => ({
  posthog: { capture: vi.fn(), captureException: vi.fn() },
}))

function makeProcessingLesson(overrides: Partial<LessonMeta> = {}): LessonMeta {
  return {
    id: 'lesson_1',
    title: 'YouTube Video (abc)',
    source: 'youtube',
    sourceUrl: 'https://youtube.com/watch?v=abc',
    translationLanguages: ['en'],
    createdAt: new Date().toISOString(),
    lastOpenedAt: new Date().toISOString(),
    progressSegmentId: null,
    tags: [],
    status: 'processing',
    jobId: 'job_abc',
    ...overrides,
  }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('useJobPoller', () => {
  it('marks lesson as error on 404 (server restart)', async () => {
    const lesson = makeProcessingLesson()
    const updateLesson = vi.fn(async () => {})

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 404 }))
    renderHook(() => useJobPoller({ lessons: [lesson], updateLesson, completeLesson: vi.fn(async () => {}) }))

    await act(async () => {
      vi.advanceTimersByTime(10000)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(updateLesson).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'error', errorMessage: 'Server restarted', jobId: undefined }),
    )
  })

  it('updates currentStep when job is still processing', async () => {
    const lesson = makeProcessingLesson()
    const updateLesson = vi.fn(async () => {})

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 200,
      json: async () => ({ status: 'processing', step: 'translation', result: null, error: null }),
    }))
    renderHook(() => useJobPoller({ lessons: [lesson], updateLesson, completeLesson: vi.fn(async () => {}) }))

    await act(async () => {
      vi.advanceTimersByTime(10000)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(updateLesson).toHaveBeenCalledWith(
      expect.objectContaining({ currentStep: 'translation' }),
    )
  })

  it('hands a completed job to completeLesson without downloading its media', async () => {
    const lesson = makeProcessingLesson()
    const updateLesson = vi.fn(async () => {})
    const completeLesson = vi.fn(async () => {})

    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        status: 200,
        json: async () => ({
          status: 'complete',
          step: 'complete',
          result: {
            lesson: { id: 'server-id', title: 'YouTube Video (abc)', source: 'youtube', duration: 60, segments: [], translation_languages: ['en'] },
            video_url: '/api/media/m1?token=t',
          },
          error: null,
        }),
      })
      .mockResolvedValue({ status: 204 })

    vi.stubGlobal('fetch', mockFetch)
    renderHook(() => useJobPoller({ lessons: [lesson], updateLesson, completeLesson }))

    act(() => {
      vi.advanceTimersByTime(10000)
    })

    await vi.waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/jobs/job_abc', { method: 'DELETE' })
    }, { timeout: 3000 })

    expect(completeLesson).toHaveBeenCalledWith('lesson_1')
    expect(updateLesson).not.toHaveBeenCalled()
    const urls = mockFetch.mock.calls.map(([url]) => url)
    expect(urls).toEqual(['/api/jobs/job_abc', '/api/jobs/job_abc'])
  })

  it('marks error and calls DELETE when job errors', async () => {
    const lesson = makeProcessingLesson()
    const updateLesson = vi.fn(async () => {})

    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        status: 200,
        json: async () => ({ status: 'error', step: 'transcription', result: null, error: 'API timeout' }),
      })
      .mockResolvedValue({ status: 204 })

    vi.stubGlobal('fetch', mockFetch)
    renderHook(() => useJobPoller({ lessons: [lesson], updateLesson, completeLesson: vi.fn(async () => {}) }))

    await act(async () => {
      vi.advanceTimersByTime(10000)
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(updateLesson).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'error', errorMessage: 'API timeout', jobId: undefined }),
    )
    expect(mockFetch).toHaveBeenCalledWith('/api/jobs/job_abc', { method: 'DELETE' })
  })

  it('fires lesson_job_failed event with step and error_message when job errors', async () => {
    const lesson = makeProcessingLesson()

    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({
        status: 200,
        json: async () => ({ status: 'error', step: 'transcription', result: null, error: 'API timeout' }),
      })
      .mockResolvedValue({ status: 204 }))

    renderHook(() => useJobPoller({ lessons: [lesson], updateLesson: vi.fn(async () => {}), completeLesson: vi.fn(async () => {}) }))

    await act(async () => {
      vi.advanceTimersByTime(10000)
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(posthog.capture).toHaveBeenCalledWith('lesson_job_failed', {
      step: 'transcription',
      error_message: 'API timeout',
    })
  })

  it('does not start interval when no processing lessons', async () => {
    const lesson = makeProcessingLesson({ status: 'complete', jobId: undefined })
    const mockFetch = vi.fn()

    vi.stubGlobal('fetch', mockFetch)
    renderHook(() => useJobPoller({ lessons: [lesson], updateLesson: vi.fn(), completeLesson: vi.fn() }))

    await act(async () => {
      vi.advanceTimersByTime(10000)
    })

    expect(mockFetch).not.toHaveBeenCalled()
  })
})
