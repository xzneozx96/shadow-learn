import type { LessonMeta } from '@/types'
import { act, renderHook, waitFor } from '@testing-library/react'
import { IDBFactory } from 'fake-indexeddb'
import * as React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LessonsProvider, useLessons } from '@/contexts/LessonsContext'
import { getAllLessonMetas, initDB, saveLessonMeta } from '@/db'
import 'fake-indexeddb/auto'

function makeMeta(overrides: Partial<LessonMeta> = {}): LessonMeta {
  return {
    id: 'lesson_1',
    title: 'Test Lesson',
    source: 'youtube',
    sourceUrl: 'https://youtube.com/watch?v=abc',
    translationLanguages: ['en'],
    createdAt: new Date().toISOString(),
    lastOpenedAt: new Date().toISOString(),
    progressSegmentId: null,
    tags: [],
    status: 'complete',
    ...overrides,
  }
}

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ db: (globalThis as any).__testDb }),
}))

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory()
  ;(globalThis as any).__testDb = await initDB()
})

function wrapper({ children }: { children: React.ReactNode }) {
  return <LessonsProvider>{children}</LessonsProvider>
}

describe('lessonsProvider', () => {
  it('loads lessons from IndexedDB on mount', async () => {
    const db = (globalThis as any).__testDb
    await saveLessonMeta(db, makeMeta())

    const { result } = renderHook(() => useLessons(), { wrapper })

    await waitFor(() => expect(result.current.lessons).toHaveLength(1))
    expect(result.current.lessons[0].id).toBe('lesson_1')
  })

  it('updateLesson adds new lesson to state and IndexedDB', async () => {
    const db = (globalThis as any).__testDb
    const meta = makeMeta({ id: 'lesson_2', title: 'New' })

    const { result } = renderHook(() => useLessons(), { wrapper })

    await waitFor(() => expect(result.current.updateLesson).toBeDefined())
    await act(async () => {
      await result.current.updateLesson(meta)
    })

    expect(result.current.lessons.find(l => l.id === 'lesson_2')).toBeDefined()
    const persisted = await getAllLessonMetas(db)
    expect(persisted.find(l => l.id === 'lesson_2')).toBeDefined()
  })

  it('updateLesson updates existing lesson in state', async () => {
    const db = (globalThis as any).__testDb
    await saveLessonMeta(db, makeMeta({ title: 'Original' }))

    const { result } = renderHook(() => useLessons(), { wrapper })

    await waitFor(() => expect(result.current.lessons).toHaveLength(1))
    await act(async () => {
      await result.current.updateLesson({ ...result.current.lessons[0], title: 'Updated' })
    })

    expect(result.current.lessons[0].title).toBe('Updated')
  })

  it('deleteLesson removes from state and IndexedDB', async () => {
    const db = (globalThis as any).__testDb
    await saveLessonMeta(db, makeMeta())

    const { result } = renderHook(() => useLessons(), { wrapper })

    await waitFor(() => expect(result.current.lessons).toHaveLength(1))
    await act(async () => {
      await result.current.deleteLesson('lesson_1')
    })

    expect(result.current.lessons).toHaveLength(0)
    const persisted = await getAllLessonMetas(db)
    expect(persisted).toHaveLength(0)
  })
})
