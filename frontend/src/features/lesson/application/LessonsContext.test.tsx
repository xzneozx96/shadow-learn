import type { DataClient } from '@/db'
import type { LessonMeta } from '@/shared/types'
import { act, renderHook, waitFor } from '@testing-library/react'
import { IDBFactory } from 'fake-indexeddb'
import * as React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LessonsProvider, useLessons } from '@/features/lesson/application/LessonsContext'
import { FakeApiClient, fakeDataClient } from '../../../../tests/fake-api'
import 'fake-indexeddb/auto'

function makeMeta(overrides: Partial<LessonMeta> = {}): LessonMeta {
  return {
    id: 'lesson_1',
    title: 'Test Lesson',
    source: 'youtube',
    sourceUrl: 'https://youtube.com/watch?v=abc',
    translationLanguages: ['en'],
    sourceLanguage: 'zh-CN',
    duration: 60,
    createdAt: '2026-09-01T00:00:00.000Z',
    lastOpenedAt: '2026-09-01T00:00:00.000Z',
    progressSegmentId: null,
    tags: [],
    ...overrides,
  }
}

let api: FakeApiClient
let db: DataClient

vi.mock('@/app/providers/AuthContext', () => ({
  useAuth: () => ({ db, session: { userId: 'u1', email: 'u1@test' } }),
}))

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory()
  localStorage.clear()
  api = new FakeApiClient()
  db = fakeDataClient(api)
})

function wrapper({ children }: { children: React.ReactNode }) {
  return <LessonsProvider>{children}</LessonsProvider>
}

describe('lessonsProvider', () => {
  it('goes from loading to ready with the lessons from GET /api/lessons', async () => {
    api.seedLesson(makeMeta())

    const { result } = renderHook(() => useLessons(), { wrapper })

    expect(result.current.status).toBe('loading')
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.lessons.map(l => l.id)).toEqual(['lesson_1'])
    expect(api.calls).toContainEqual({ method: 'GET', path: '/api/lessons' })
  })

  it('goes from loading to error, and reload recovers', async () => {
    api.seedLesson(makeMeta())
    api.failWith('/api/lessons', 503)

    const { result } = renderHook(() => useLessons(), { wrapper })

    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.error).toBe('GET /api/lessons failed: 503')
    expect(result.current.lessons).toEqual([])

    api.heal('/api/lessons')
    await act(async () => {
      await result.current.reload()
    })

    expect(result.current.status).toBe('ready')
    expect(result.current.error).toBeNull()
    expect(result.current.lessons).toHaveLength(1)
  })

  it('updateLesson PATCHes a server lesson with its client-owned fields', async () => {
    api.seedLesson(makeMeta())

    const { result } = renderHook(() => useLessons(), { wrapper })
    await waitFor(() => expect(result.current.lessons).toHaveLength(1))

    await act(async () => {
      await result.current.updateLesson({ ...result.current.lessons[0], isDone: true })
    })

    expect(result.current.lessons[0].isDone).toBe(true)
    expect(api.calls.at(-1)).toEqual({
      method: 'PATCH',
      path: '/api/lessons/lesson_1',
      body: {
        meta: { progressSegmentId: null, tags: [], isDone: true },
        last_opened_at: '2026-09-01T00:00:00.000Z',
      },
    })
  })

  it('renameLesson PATCHes the title of a server lesson and keeps it after a reload', async () => {
    api.seedLesson(makeMeta({ title: 'Original' }))

    const { result } = renderHook(() => useLessons(), { wrapper })
    await waitFor(() => expect(result.current.lessons).toHaveLength(1))

    await act(async () => {
      await result.current.renameLesson(result.current.lessons[0], 'Updated')
    })

    expect(result.current.lessons[0].title).toBe('Updated')
    expect(api.calls.at(-1)).toEqual({ method: 'PATCH', path: '/api/lessons/lesson_1', body: { title: 'Updated' } })

    await act(async () => {
      await result.current.reload()
    })
    expect(result.current.lessons[0].title).toBe('Updated')
  })

  it('renameLesson keeps a placeholder rename in this browser', async () => {
    const placeholder = makeMeta({ id: 'pending_1', status: 'processing', jobId: 'job_1' })
    const { result } = renderHook(() => useLessons(), { wrapper })
    await waitFor(() => expect(result.current.status).toBe('ready'))
    await act(async () => {
      await result.current.updateLesson(placeholder)
    })
    const callsBefore = api.calls.length

    await act(async () => {
      await result.current.renameLesson(placeholder, 'Pending rename')
    })

    expect(result.current.lessons[0].title).toBe('Pending rename')
    expect(api.calls).toHaveLength(callsBefore)
  })

  it('keeps a processing placeholder in this browser across a remount', async () => {
    const placeholder = makeMeta({ id: 'pending_1', status: 'processing', jobId: 'job_1' })

    const first = renderHook(() => useLessons(), { wrapper })
    await waitFor(() => expect(first.result.current.status).toBe('ready'))
    const callsBefore = api.calls.length

    await act(async () => {
      await first.result.current.updateLesson(placeholder)
    })

    expect(first.result.current.lessons.map(l => l.id)).toEqual(['pending_1'])
    expect(api.calls).toHaveLength(callsBefore)
    first.unmount()

    const second = renderHook(() => useLessons(), { wrapper })
    await waitFor(() => expect(second.result.current.status).toBe('ready'))
    expect(second.result.current.lessons).toEqual([placeholder])
  })

  it('deleteLesson DELETEs a server lesson and drops it from state', async () => {
    api.seedLesson(makeMeta())

    const { result } = renderHook(() => useLessons(), { wrapper })
    await waitFor(() => expect(result.current.lessons).toHaveLength(1))

    await act(async () => {
      await result.current.deleteLesson('lesson_1')
    })

    expect(result.current.lessons).toHaveLength(0)
    expect(api.calls).toContainEqual({ method: 'DELETE', path: '/api/lessons/lesson_1' })
    expect(api.records.has('/api/lessons/lesson_1')).toBe(false)
  })
})
