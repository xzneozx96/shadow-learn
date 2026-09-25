import type { DataClient } from '@/db'
import type { StudioMindMapData } from '@/features/learning-materials/domain/tips'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTipStudio } from '@/features/learning-materials/application/useTipStudio'
import { fakeDataClient } from '../../../../tests/fake-api'

let db: DataClient

function makeResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response
}

beforeEach(() => {
  db = fakeDataClient()
  globalThis.fetch = vi.fn() as any
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useTipStudio', () => {
  it('starts idle when nothing is cached and probe returns 404', async () => {
    ;(globalThis.fetch as any).mockResolvedValue(makeResponse(404, { status: 'none' }))
    const { result } = renderHook(() => useTipStudio({ db, kind: 'summary', videoId: 'v1', transcript: 'x', locale: 'en' }))
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled())
    expect(result.current.status).toBe('idle')
    expect(result.current.data).toBeNull()
  })

  it('paints the catalog artifact the probe returns, and stays unhydrated until then', async () => {
    const summary = { abstract: 'from catalog', takeaways: ['a', 'b', 'c'] }
    ;(globalThis.fetch as any).mockResolvedValue(makeResponse(200, { status: 'ready', data: summary }))

    const { result } = renderHook(() => useTipStudio({ db, kind: 'summary', videoId: 'v1', transcript: 'x', locale: 'en' }))
    expect(result.current.hydrated).toBe(false)
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.hydrated).toBe(true)
    expect(result.current.data).toEqual(summary)
    expect((globalThis.fetch as any).mock.calls[0][0]).toContain('/api/tips/studio/summary/v1?locale=en')
  })

  it('probes the server on every mount instead of reading a local cache', async () => {
    const summary = { abstract: 'from catalog', takeaways: ['a', 'b', 'c'] }
    ;(globalThis.fetch as any).mockResolvedValue(makeResponse(200, { status: 'ready', data: summary }))

    const first = renderHook(() => useTipStudio({ db, kind: 'summary', videoId: 'v1', transcript: 'x', locale: 'en' }))
    await waitFor(() => expect(first.result.current.status).toBe('ready'))
    first.unmount()
    const second = renderHook(() => useTipStudio({ db, kind: 'summary', videoId: 'v1', transcript: 'x', locale: 'en' }))
    await waitFor(() => expect(second.result.current.status).toBe('ready'))

    expect(globalThis.fetch).toHaveBeenCalledTimes(2)
  })

  it('generate() returning ready synchronously shows the data', async () => {
    const fake = { abstract: 'fresh', takeaways: ['1', '2', '3'] }
    ;(globalThis.fetch as any).mockImplementation((url: string) => {
      // Probe on mount → none. POST → ready.
      if (url.includes('/api/tips/studio/summary/v2'))
        return Promise.resolve(makeResponse(404, { status: 'none' }))
      return Promise.resolve(makeResponse(200, { status: 'ready', jobId: 'j1', data: fake }))
    })

    const { result } = renderHook(() => useTipStudio({ db, kind: 'summary', videoId: 'v2', transcript: 'hi', locale: 'en' }))
    await waitFor(() => expect(result.current.status).toBe('idle'))
    await act(async () => { await result.current.generate() })

    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.data).toEqual(fake)
  })

  it('generate() pending → polls /api/jobs and resolves when complete', async () => {
    const fake = { abstract: 'polled', takeaways: ['1', '2', '3'] }
    let pollCalls = 0
    ;(globalThis.fetch as any).mockImplementation((url: string) => {
      if (url.includes('/api/tips/studio/summary/v3'))
        return Promise.resolve(makeResponse(404, { status: 'none' }))
      if (url.endsWith('/api/tips/studio/summary'))
        return Promise.resolve(makeResponse(202, { status: 'pending', jobId: 'job-xyz' }))
      // /api/jobs/job-xyz
      pollCalls += 1
      if (pollCalls < 2)
        return Promise.resolve(makeResponse(200, { status: 'processing', step: 'queued' }))
      return Promise.resolve(makeResponse(200, { status: 'complete', result: { data: fake } }))
    })

    const { result } = renderHook(() => useTipStudio({ db, kind: 'summary', videoId: 'v3', transcript: 'hi', locale: 'en' }))
    await waitFor(() => expect(result.current.status).toBe('idle'))
    await act(async () => { await result.current.generate() })

    await waitFor(() => expect(result.current.status).toBe('ready'), { timeout: 15000 })
    expect(result.current.data).toEqual(fake)
    expect(pollCalls).toBeGreaterThanOrEqual(2)
  }, 20000)

  it('resumes polling on mount when probe returns pending', async () => {
    const fake = { abstract: 'resumed', takeaways: ['1', '2', '3'] }
    let pollCalls = 0
    ;(globalThis.fetch as any).mockImplementation((url: string) => {
      if (url.includes('/api/tips/studio/summary/v4'))
        return Promise.resolve(makeResponse(202, { status: 'pending', jobId: 'job-r' }))
      pollCalls += 1
      return Promise.resolve(makeResponse(200, { status: 'complete', result: { data: fake } }))
    })

    const { result } = renderHook(() => useTipStudio({ db, kind: 'summary', videoId: 'v4', transcript: 'x', locale: 'en' }))
    await waitFor(() => expect(result.current.status).toBe('ready'), { timeout: 15000 })
    expect(result.current.data).toEqual(fake)
    expect(pollCalls).toBeGreaterThanOrEqual(1)
  }, 20000)

  it('5xx response on POST sets status=error', async () => {
    ;(globalThis.fetch as any).mockImplementation((url: string) => {
      if (url.includes('/api/tips/studio/summary/v5'))
        return Promise.resolve(makeResponse(404, { status: 'none' }))
      return Promise.resolve(makeResponse(502, { detail: 'boom' }))
    })

    const { result } = renderHook(() => useTipStudio({ db, kind: 'summary', videoId: 'v5', transcript: 'x', locale: 'en' }))
    await waitFor(() => expect(result.current.status).toBe('idle'))
    await act(async () => { await result.current.generate() })
    expect(result.current.status).toBe('error')
  })

  it('disabled=true when transcript empty', () => {
    const { result } = renderHook(() => useTipStudio({ db, kind: 'summary', videoId: 'v6', transcript: '', locale: 'en' }))
    expect(result.current.disabled).toBe(true)
  })

  it('inFlightByOther is always false (legacy concurrency flag retired)', async () => {
    ;(globalThis.fetch as any).mockResolvedValue(makeResponse(404, { status: 'none' }))
    const { result } = renderHook(() => useTipStudio({ db, kind: 'summary', videoId: 'v7', transcript: 'x', locale: 'en' }))
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled())
    expect(result.current.inFlightByOther).toBe(false)
  })
})

const sampleMM: StudioMindMapData = {
  root: { label: 'r', summary: 's', children: [{ label: 'c', summary: 's', children: [] }] },
}

describe('useTipStudio mind_map', () => {
  it('fetches a mind map via ready response', async () => {
    ;(globalThis.fetch as any).mockImplementation((url: string) => {
      if (url.includes('/api/tips/studio/mind_map/v1'))
        return Promise.resolve(makeResponse(404, { status: 'none' }))
      return Promise.resolve(makeResponse(200, { status: 'ready', jobId: 'jm', data: sampleMM }))
    })

    const { result } = renderHook(() => useTipStudio({
      db,
      kind: 'mind_map',
      videoId: 'v1',
      transcript: 'hello',
      locale: 'en',
    }))

    await waitFor(() => expect(result.current.status).toBe('idle'))
    await act(async () => { await result.current.generate() })
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.data?.root.label).toBe('r')
  })
})
