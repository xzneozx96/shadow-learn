import type { DataClient } from '@/db'
import type { ShadowingBest } from '@/shared/types'
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSpeakingBests } from '@/shared/hooks/useSpeakingBests'
import { FakeApiClient, fakeDataClient } from './fake-api'

let mockDb: DataClient
let api: FakeApiClient

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

const AUDIO_PATH = '/api/lessons/l1/segments/s1/shadowing-audio'

describe('useSpeakingBests', () => {
  beforeEach(() => {
    api = new FakeApiClient()
    mockDb = fakeDataClient(api)
  })

  it('loads the lesson\'s bests on mount', async () => {
    api.seedStore('shadowing-bests', [makeBest('l1', 's1', 88), makeBest('l1', 's2', 72), makeBest('l2', 's1', 50)])

    const { result } = renderHook(() => useSpeakingBests('l1'))
    await waitFor(() => expect(result.current.bests.size).toBe(2))

    expect(result.current.getBest('s1')?.score).toBe(88)
    expect(result.current.getBest('s2')?.score).toBe(72)
    expect(result.current.getBest('s-unknown')).toBeUndefined()
  })

  it('saveBest stores the best and uploads the recording as raw audio', async () => {
    const { result } = renderHook(() => useSpeakingBests('l1'))
    await waitFor(() => expect(api.calls).toHaveLength(1))

    const best = makeBest('l1', 's1', 90)
    const blob = new Blob(['audio'], { type: 'audio/webm' })
    await act(async () => {
      await result.current.saveBest(best, blob)
    })

    expect(result.current.getBest('s1')?.score).toBe(90)
    expect(api.storeRows<ShadowingBest>('shadowing-bests')).toEqual([best])
    expect(api.calls).toContainEqual({ method: 'PUT', path: AUDIO_PATH, body: blob })
  })

  it('getAudio returns the stored recording, and undefined when there is none', async () => {
    const { result } = renderHook(() => useSpeakingBests('l1'))
    await waitFor(() => expect(api.calls).toHaveLength(1))

    expect(await result.current.getAudio('s1')).toBeUndefined()

    await act(async () => {
      await result.current.saveBest(makeBest('l1', 's1'), new Blob(['audio'], { type: 'audio/webm' }))
    })
    const retrieved = await result.current.getAudio('s1')
    expect(await retrieved?.text()).toBe('audio')
  })
})
