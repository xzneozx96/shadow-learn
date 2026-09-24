import type { DataClient } from '@/db'
import type { TipCardStatesRecord } from '@/features/learning-materials/domain/tips'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTipCards } from '@/features/learning-materials/application/useTipCards'
import { FakeApiClient, fakeDataClient } from '../../../../tests/fake-api'

let api: FakeApiClient
let db: DataClient

function jsonResponse(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response
}

function deck(...fronts: string[]) {
  return { status: 'ready', jobId: 'jc', data: { cards: fronts.map(front => ({ id: front, front, rule: 'r', example: 'e', trap: null })) } }
}

function serveDeck(...fronts: string[]) {
  vi.mocked(globalThis.fetch).mockResolvedValue(jsonResponse(200, deck(...fronts)))
}

beforeEach(() => {
  api = new FakeApiClient()
  db = fakeDataClient(api)
  // Default probe response: backend has no deck and no live job.
  globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse(404, { status: 'none' })) as any
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useTipCards', () => {
  it('starts with empty deck and index 0', async () => {
    const { result } = renderHook(() => useTipCards({ db, videoId: 'v1', transcript: 'x', locale: 'en' }))
    expect(result.current.cards).toEqual([])
    expect(result.current.index).toBe(0)
    expect(result.current.flipped).toBe(false)
    await waitFor(() => expect(result.current.hydrated).toBe(true))
  })

  it('flip() toggles the flipped state', async () => {
    const { result } = renderHook(() => useTipCards({ db, videoId: 'v1', transcript: 'x', locale: 'en' }))
    await waitFor(() => expect(result.current.hydrated).toBe(true))
    act(() => { result.current.flip() })
    expect(result.current.flipped).toBe(true)
    act(() => { result.current.flip() })
    expect(result.current.flipped).toBe(false)
  })

  it('next() advances and resets flip', async () => {
    serveDeck('q1', 'q2')
    const { result } = renderHook(() => useTipCards({ db, videoId: 'v1', transcript: 'x', locale: 'en' }))
    await waitFor(() => expect(result.current.cards.length).toBe(2))

    act(() => { result.current.flip() })
    act(() => { result.current.next() })
    expect(result.current.index).toBe(1)
    expect(result.current.flipped).toBe(false)
  })

  it('applies the saved known/learning marks to the server deck', async () => {
    api.seedStore('tip-card-states', [{
      videoId: 'v1',
      locale: 'en',
      states: { q2: { state: 'learning', updatedAt: '2026-09-01T00:00:00.000Z' } },
    }])
    serveDeck('q1', 'q2')

    const { result } = renderHook(() => useTipCards({ db, videoId: 'v1', transcript: 'x', locale: 'en' }))
    await waitFor(() => expect(result.current.cards.length).toBe(2))

    expect(result.current.cards.map(c => c.state)).toEqual(['new', 'learning'])
  })

  it('markKnown() stores the mark by card front and advances', async () => {
    serveDeck('q1', 'q2')
    const { result } = renderHook(() => useTipCards({ db, videoId: 'v2', transcript: 'x', locale: 'en' }))
    await waitFor(() => expect(result.current.cards.length).toBe(2))

    await act(async () => { await result.current.markKnown() })

    expect(result.current.index).toBe(1)
    expect(result.current.cards[0].state).toBe('known')
    const [stored] = api.storeRows<TipCardStatesRecord>('tip-card-states')
    expect(stored.videoId).toBe('v2')
    expect(stored.locale).toBe('en')
    expect(stored.states.q1.state).toBe('known')
    expect(Object.keys(stored.states)).toEqual(['q1'])
  })

  it('regen replaces the deck but keeps marks for cards with a matching front', async () => {
    api.seedStore('tip-card-states', [{
      videoId: 'v3',
      locale: 'en',
      states: {
        Q1: { state: 'known', updatedAt: '2026-09-01T00:00:00.000Z' },
        Q2: { state: 'learning', updatedAt: '2026-09-01T00:00:00.000Z' },
      },
    }])
    serveDeck('Q1', 'Q2')

    const { result } = renderHook(() => useTipCards({ db, videoId: 'v3', transcript: 'x', locale: 'en' }))
    await waitFor(() => expect(result.current.cards.length).toBe(2))

    serveDeck('Q1', 'Q3')
    await act(async () => { await result.current.regenerate() })

    expect(result.current.cards.map(c => [c.front, c.state])).toEqual([['Q1', 'known'], ['Q3', 'new']])
  })

  it('keeps marks per locale', async () => {
    api.seedStore('tip-card-states', [{
      videoId: 'v4',
      locale: 'vi',
      states: { q1: { state: 'known', updatedAt: '2026-09-01T00:00:00.000Z' } },
    }])
    serveDeck('q1')

    const { result } = renderHook(() => useTipCards({ db, videoId: 'v4', transcript: 'x', locale: 'en' }))
    await waitFor(() => expect(result.current.cards.length).toBe(1))

    expect(result.current.cards[0].state).toBe('new')
  })
})
