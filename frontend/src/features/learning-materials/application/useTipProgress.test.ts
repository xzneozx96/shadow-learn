import type { ShadowLearnDB } from '@/db'
import { act, renderHook, waitFor } from '@testing-library/react'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getTipProgress, initDB } from '@/db'
import 'fake-indexeddb/auto'

let testDb: ShadowLearnDB

// useTipProgress reads `db` from AuthContext; mock it to our test DB.
vi.mock('@/app/providers/AuthContext', () => ({
  useAuth: () => ({ db: testDb, keys: null }),
}))

// Imported after the mock so the hook picks up the mocked AuthContext.
const { useTipProgress } = await import('@/features/learning-materials/application/useTipProgress')

beforeEach(async () => {
  testDb = await initDB()
})

afterEach(() => {
  testDb.close()
  globalThis.indexedDB = new IDBFactory()
})

describe('useTipProgress persistence', () => {
  it('recordPosition persists title and resumeRoute', async () => {
    const { result } = renderHook(() => useTipProgress('vid1', 'vid1'))
    await waitFor(() => expect(result.current.loaded).toBe(true))
    await act(() => result.current.recordPosition(10, 100, {
      title: 'Grammar 101',
      route: '/tips/video/vid1?lesson=vid1',
    }))
    const saved = await getTipProgress(testDb, 'vid1:vid1')
    expect(saved?.title).toBe('Grammar 101')
    expect(saved?.resumeRoute).toBe('/tips/video/vid1?lesson=vid1')
  })

  it('markComplete preserves existing title and resumeRoute', async () => {
    const { result } = renderHook(() => useTipProgress('vid1', 'vid1'))
    await waitFor(() => expect(result.current.loaded).toBe(true))
    await act(() => result.current.recordPosition(10, 100, {
      title: 'Grammar 101',
      route: '/tips/video/vid1?lesson=vid1',
    }))
    await act(() => result.current.markComplete())
    const saved = await getTipProgress(testDb, 'vid1:vid1')
    expect(saved?.completed).toBe(true)
    expect(saved?.title).toBe('Grammar 101')
    expect(saved?.resumeRoute).toBe('/tips/video/vid1?lesson=vid1')
  })
})
