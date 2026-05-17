import type { ShadowLearnDB } from '../../src/db'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { initDB, putTipStudio, studioKey } from '../../src/db'
import { useTipStudio } from '../../src/hooks/useTipStudio'
import 'fake-indexeddb/auto'

let db: ShadowLearnDB

beforeEach(async () => {
  const { deleteDB } = await import('idb')
  await deleteDB('shadowlearn')
  db = await initDB()
  globalThis.fetch = vi.fn() as any
})

afterEach(() => {
  db?.close()
  vi.restoreAllMocks()
})

describe('useTipStudio', () => {
  it('starts idle when nothing is cached', () => {
    const { result } = renderHook(() => useTipStudio({ db, kind: 'summary', videoId: 'v1', transcript: 'x', locale: 'en' }))
    expect(result.current.status).toBe('idle')
    expect(result.current.data).toBeNull()
  })

  it('reads cached artifact on mount when present', async () => {
    await putTipStudio(db, {
      key: studioKey('v1', 'summary', 'en'),
      kind: 'summary',
      videoId: 'v1',
      locale: 'en',
      data: { abstract: 'cached', takeaways: ['a', 'b', 'c'] },
      generatedAt: '2026-05-17T00:00:00Z',
    })

    const { result } = renderHook(() => useTipStudio({ db, kind: 'summary', videoId: 'v1', transcript: 'x', locale: 'en' }))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.data).toEqual({ abstract: 'cached', takeaways: ['a', 'b', 'c'] })
  })

  it('generate() fetches and caches', async () => {
    const fake = { abstract: 'fresh', takeaways: ['1', '2', '3'] }
    ;(globalThis.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => fake,
    })

    const { result } = renderHook(() => useTipStudio({ db, kind: 'summary', videoId: 'v2', transcript: 'hi', locale: 'en' }))
    await act(async () => { await result.current.generate() })

    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.data).toEqual(fake)
    const cached = await db.get('tip-studio', studioKey('v2', 'summary', 'en'))
    expect(cached?.data).toEqual(fake)
  })

  it('locale switch reads different cache slot', async () => {
    await putTipStudio(db, {
      key: studioKey('v3', 'summary', 'en'),
      kind: 'summary',
      videoId: 'v3',
      locale: 'en',
      data: { abstract: 'EN', takeaways: ['a', 'b', 'c'] },
      generatedAt: '2026-05-17T00:00:00Z',
    })

    const { result } = renderHook(() => useTipStudio({ db, kind: 'summary', videoId: 'v3', transcript: 'x', locale: 'vi' }))
    await waitFor(() => expect(result.current.status).toBe('idle'))
    expect(result.current.data).toBeNull()
  })

  it('5xx response sets status=error', async () => {
    ;(globalThis.fetch as any).mockResolvedValue({ ok: false, status: 502 })
    const { result } = renderHook(() => useTipStudio({ db, kind: 'summary', videoId: 'v4', transcript: 'x', locale: 'en' }))
    await act(async () => { await result.current.generate() })
    expect(result.current.status).toBe('error')
  })

  it('disabled=true when transcript empty', () => {
    const { result } = renderHook(() => useTipStudio({ db, kind: 'summary', videoId: 'v5', transcript: '', locale: 'en' }))
    expect(result.current.disabled).toBe(true)
  })
})
