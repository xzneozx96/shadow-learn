import type { LessonMeta } from '@/types'
import { act, renderHook } from '@testing-library/react'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getSegments, getVideo, initDB } from '@/db'
import { useJobPoller } from '@/hooks/useJobPoller'
import 'fake-indexeddb/auto'

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

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory()
  ;(globalThis as any).__testDb = await initDB()
  // Only fake setInterval/clearInterval — leave setTimeout real so fake-indexeddb works
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('useJobPoller', () => {
  it('marks lesson as error on 404 (server restart)', async () => {
    const db = (globalThis as any).__testDb
    const lesson = makeProcessingLesson()
    const updateLesson = vi.fn(async () => {})

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 404 }))
    renderHook(() => useJobPoller({ lessons: [lesson], db, updateLesson }))

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
    const db = (globalThis as any).__testDb
    const lesson = makeProcessingLesson()
    const updateLesson = vi.fn(async () => {})

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 200,
      json: async () => ({ status: 'processing', step: 'translation', result: null, error: null }),
    }))
    renderHook(() => useJobPoller({ lessons: [lesson], db, updateLesson }))

    await act(async () => {
      vi.advanceTimersByTime(10000)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(updateLesson).toHaveBeenCalledWith(
      expect.objectContaining({ currentStep: 'translation' }),
    )
  })

  it('saves segments, downloads video, marks complete, calls DELETE on success', async () => {
    const db = (globalThis as any).__testDb
    const lesson = makeProcessingLesson()
    const segments = [{
      id: '1',
      start: 0,
      end: 5,
      text: '你好',
      romanization: 'nǐ hǎo',
      translations: { en: 'Hello' },
      words: [],
    }]
    const updateLesson = vi.fn(async () => {})

    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        status: 200,
        json: async () => ({
          status: 'complete',
          step: 'complete',
          result: {
            lesson: { title: 'YouTube Video (abc)', source: 'youtube', source_url: 'https://youtube.com/watch?v=abc', duration: 60, segments, translation_languages: ['en'] },
            video_url: '/api/lessons/video/video.mp4',
          },
          error: null,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: (h: string) => h === 'content-type' ? 'video/mp4' : null },
        blob: async () => new Blob(['video'], { type: 'video/mp4' }),
      })
      .mockResolvedValue({ status: 204 })

    vi.stubGlobal('fetch', mockFetch)
    renderHook(() => useJobPoller({ lessons: [lesson], db, updateLesson }))

    act(() => {
      vi.advanceTimersByTime(10000)
    })

    // Wait for the async pipeline to fully complete (fetch → json → blob → IDB writes → updateLesson → DELETE)
    await vi.waitFor(async () => {
      expect(updateLesson).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'complete', jobId: undefined, duration: 60, segmentCount: 1 }),
      )
    }, { timeout: 3000 })

    const saved = await getSegments(db, 'lesson_1')
    expect(saved).toHaveLength(1)
    const storedBlob = await getVideo(db, 'lesson_1')
    expect(storedBlob).toBeDefined()
    expect(storedBlob!.type).toBe('video/mp4')
    expect(mockFetch).toHaveBeenCalledWith('/api/jobs/job_abc', { method: 'DELETE' })
  })

  it('marks error and calls DELETE when job errors', async () => {
    const db = (globalThis as any).__testDb
    const lesson = makeProcessingLesson()
    const updateLesson = vi.fn(async () => {})

    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        status: 200,
        json: async () => ({ status: 'error', step: 'transcription', result: null, error: 'API timeout' }),
      })
      .mockResolvedValue({ status: 204 })

    vi.stubGlobal('fetch', mockFetch)
    renderHook(() => useJobPoller({ lessons: [lesson], db, updateLesson }))

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

  it('does not start interval when no processing lessons', async () => {
    const db = (globalThis as any).__testDb
    const lesson = makeProcessingLesson({ status: 'complete', jobId: undefined })
    const mockFetch = vi.fn()

    vi.stubGlobal('fetch', mockFetch)
    renderHook(() => useJobPoller({ lessons: [lesson], db, updateLesson: vi.fn() }))

    await act(async () => {
      vi.advanceTimersByTime(10000)
    })

    expect(mockFetch).not.toHaveBeenCalled()
  })
})
