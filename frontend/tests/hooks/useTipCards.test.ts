import type { ShadowLearnDB } from '../../src/db'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cardsKey, initDB, putTipCards } from '../../src/db'
import { useTipCards } from '../../src/hooks/useTipCards'
import 'fake-indexeddb/auto'

let db: ShadowLearnDB

beforeEach(async () => {
  const { deleteDB } = await import('idb')
  await deleteDB('shadowlearn')
  db = await initDB()
  // Default probe response: backend has no live job. Tests that exercise
  // the regen path override this with a more specific mockResolvedValue.
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: false,
    status: 404,
    json: async () => ({ status: 'none' }),
  }) as any
})

afterEach(() => {
  db?.close()
  vi.restoreAllMocks()
})

describe('useTipCards', () => {
  it('starts with empty deck and index 0', () => {
    const { result } = renderHook(() => useTipCards({ db, videoId: 'v1', transcript: 'x', locale: 'en' }))
    expect(result.current.cards).toEqual([])
    expect(result.current.index).toBe(0)
    expect(result.current.flipped).toBe(false)
  })

  it('flip() toggles the flipped state', () => {
    const { result } = renderHook(() => useTipCards({ db, videoId: 'v1', transcript: 'x', locale: 'en' }))
    act(() => { result.current.flip() })
    expect(result.current.flipped).toBe(true)
    act(() => { result.current.flip() })
    expect(result.current.flipped).toBe(false)
  })

  it('next() advances and resets flip', async () => {
    await putTipCards(db, {
      key: cardsKey('v1', 'en'),
      videoId: 'v1',
      locale: 'en',
      cards: [
        { id: 'a', front: 'q1', rule: 'r1', example: 'e1', trap: null, state: 'new', updatedAt: '' },
        { id: 'b', front: 'q2', rule: 'r2', example: 'e2', trap: null, state: 'new', updatedAt: '' },
      ],
      generatedAt: '',
    })
    const { result } = renderHook(() => useTipCards({ db, videoId: 'v1', transcript: 'x', locale: 'en' }))
    await waitFor(() => expect(result.current.cards.length).toBe(2))

    act(() => { result.current.flip() })
    act(() => { result.current.next() })
    expect(result.current.index).toBe(1)
    expect(result.current.flipped).toBe(false)
  })

  it('markKnown() persists state and advances', async () => {
    await putTipCards(db, {
      key: cardsKey('v2', 'en'),
      videoId: 'v2',
      locale: 'en',
      cards: [{ id: 'a', front: 'q', rule: 'r', example: 'e', trap: null, state: 'new', updatedAt: '' }],
      generatedAt: '',
    })
    const { result } = renderHook(() => useTipCards({ db, videoId: 'v2', transcript: 'x', locale: 'en' }))
    await waitFor(() => expect(result.current.cards.length).toBe(1))

    await act(async () => { await result.current.markKnown() })
    const stored = await db.get('tip-cards', cardsKey('v2', 'en'))
    expect(stored?.cards[0].state).toBe('known')
  })

  it('regen replaces deck but preserves state for cards with matching front-question', async () => {
    await putTipCards(db, {
      key: cardsKey('v3', 'en'),
      videoId: 'v3',
      locale: 'en',
      cards: [
        { id: 'old1', front: 'Q1', rule: 'r', example: 'e', trap: null, state: 'known', updatedAt: '' },
        { id: 'old2', front: 'Q2', rule: 'r', example: 'e', trap: null, state: 'learning', updatedAt: '' },
      ],
      generatedAt: '',
    });
    // POST returns the artifact synchronously as a ready envelope. The
    // probe call on mount is short-circuited by the IDB cache hit above.
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'ready',
        jobId: 'jc',
        data: {
          cards: [
            { id: 'new1', front: 'Q1', rule: 'r2', example: 'e2', trap: null },
            { id: 'new3', front: 'Q3', rule: 'r3', example: 'e3', trap: null },
          ],
        },
      }),
    })

    const { result } = renderHook(() => useTipCards({ db, videoId: 'v3', transcript: 'x', locale: 'en' }))
    await waitFor(() => expect(result.current.cards.length).toBe(2))
    await act(async () => { await result.current.regenerate() })

    const stored = await db.get('tip-cards', cardsKey('v3', 'en'))
    expect(stored?.cards).toHaveLength(2)
    const q1 = stored!.cards.find(c => c.front === 'Q1')!
    expect(q1.state).toBe('known') // preserved
    const q3 = stored!.cards.find(c => c.front === 'Q3')!
    expect(q3.state).toBe('new') // brand new
  })
})
