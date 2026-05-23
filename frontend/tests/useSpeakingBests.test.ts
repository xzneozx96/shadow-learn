import type { ShadowingBest } from '@/shared/types'
import { act, renderHook, waitFor } from '@testing-library/react'
import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { initDB, saveSpeakingAudio, saveSpeakingBest } from '@/db'
import { useSpeakingBests } from '@/shared/hooks/useSpeakingBests'
import 'fake-indexeddb/auto'

let mockDb: Awaited<ReturnType<typeof initDB>>

// Mock AuthContext — hook reads db from useAuth()
vi.mock('@/app/providers/AuthContext', () => ({
  useAuth: () => ({ db: mockDb }),
}))

function makeBest(lessonId: string, segmentId: string, score = 80): ShadowingBest {
  return {
    lessonId,
    segmentId,
    score,
    breakdown: {
      overall: { accuracy: score, fluency: 90, completeness: 100, prosody: 70 },
      words: [{ word: '你', accuracy: score, error_type: null, error_detail: null }],
    },
    recordedAt: '2026-05-12T00:00:00.000Z',
  }
}

describe('useSpeakingBests', () => {
  beforeEach(async () => {
    globalThis.indexedDB = new IDBFactory()
    mockDb = await initDB()
  })

  it('loads existing bests on mount', async () => {
    await saveSpeakingBest(mockDb, makeBest('l1', 's1', 88))
    await saveSpeakingBest(mockDb, makeBest('l1', 's2', 72))

    const { result } = renderHook(() => useSpeakingBests('l1'))
    await waitFor(() => expect(result.current.bests.size).toBe(2))

    expect(result.current.getBest('s1')?.score).toBe(88)
    expect(result.current.getBest('s2')?.score).toBe(72)
    expect(result.current.getBest('s-unknown')).toBeUndefined()
  })

  it('saveBest writes to IDB and updates in-memory map', async () => {
    const { result } = renderHook(() => useSpeakingBests('l1'))
    await waitFor(() => expect(result.current.bests.size).toBe(0))

    const best = makeBest('l1', 's1', 90)
    const blob = new Blob(['audio'], { type: 'audio/webm' })

    await act(async () => {
      await result.current.saveBest(best, blob)
    })

    expect(result.current.getBest('s1')?.score).toBe(90)
  })

  it('getAudio retrieves stored blob', async () => {
    const blob = new Blob(['audio'], { type: 'audio/webm' })
    await saveSpeakingAudio(mockDb, 'l1', 's1', blob)

    const { result } = renderHook(() => useSpeakingBests('l1'))
    const retrieved = await result.current.getAudio('s1')
    expect(retrieved).toBeDefined()
  })

  it('only loads bests for given lessonId', async () => {
    await saveSpeakingBest(mockDb, makeBest('l1', 's1'))
    await saveSpeakingBest(mockDb, makeBest('l2', 's1'))

    const { result } = renderHook(() => useSpeakingBests('l1'))
    await waitFor(() => expect(result.current.bests.size).toBe(1))
    expect(result.current.getBest('s1')?.score).toBeDefined()
  })
})
