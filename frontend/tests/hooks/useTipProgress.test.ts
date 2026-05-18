import { act, renderHook, waitFor } from '@testing-library/react'
import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/contexts/AuthContext'
import { initDB } from '@/db'
import { useTipProgress } from '@/hooks/useTipProgress'
import 'fake-indexeddb/auto'

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}))

describe('useTipProgress', () => {
  let db: Awaited<ReturnType<typeof initDB>>

  beforeEach(async () => {
    globalThis.indexedDB = new IDBFactory()
    db = await initDB()
    vi.mocked(useAuth).mockReturnValue({ db, keys: null, isUnlocked: true, isFirstSetup: false } as ReturnType<typeof useAuth>)
  })

  it('starts with no progress and exposes current state', async () => {
    const { result } = renderHook(() => useTipProgress('course-1', 'video-1'))
    await waitFor(() => expect(result.current.loaded).toBe(true))
    expect(result.current.completed).toBe(false)
    expect(result.current.watchedSec).toBe(0)
  })

  it('flips to completed at 80% of total', async () => {
    const { result } = renderHook(() => useTipProgress('course-1', 'video-1'))
    await waitFor(() => expect(result.current.loaded).toBe(true))
    await act(async () => {
      await result.current.recordPosition(80, 100)
    })
    expect(result.current.completed).toBe(true)
  })

  it('does not flip below 80%', async () => {
    const { result } = renderHook(() => useTipProgress('course-1', 'video-1'))
    await waitFor(() => expect(result.current.loaded).toBe(true))
    await act(async () => {
      await result.current.recordPosition(70, 100)
    })
    expect(result.current.completed).toBe(false)
  })

  it('manual markComplete sets completed regardless of position', async () => {
    const { result } = renderHook(() => useTipProgress('course-1', 'video-1'))
    await waitFor(() => expect(result.current.loaded).toBe(true))
    await act(async () => {
      await result.current.markComplete()
    })
    expect(result.current.completed).toBe(true)
  })

  it('persists across remount and exposes resume position', async () => {
    const { result, unmount } = renderHook(() => useTipProgress('course-1', 'video-1'))
    await waitFor(() => expect(result.current.loaded).toBe(true))
    await act(async () => {
      await result.current.recordPosition(45, 100)
    })
    unmount()

    const { result: result2 } = renderHook(() => useTipProgress('course-1', 'video-1'))
    await waitFor(() => expect(result2.current.loaded).toBe(true))
    expect(result2.current.watchedSec).toBe(45)
  })
})
