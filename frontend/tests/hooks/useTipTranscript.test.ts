import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { initDB, putTipTranscript } from '../../src/db'
import { useTipTranscript } from '../../src/hooks/useTipTranscript'
import 'fake-indexeddb/auto'

// vi.hoisted so the factory closure captures a mutable reference that tests can update
const mocks = vi.hoisted(() => ({ db: null as Awaited<ReturnType<typeof initDB>> | null }))

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ db: mocks.db }),
}))

vi.mock('@/lib/config', () => ({
  API_BASE: 'http://test-api',
}))

const ORIGINAL_FETCH = globalThis.fetch

afterEach(async () => {
  globalThis.fetch = ORIGINAL_FETCH
  vi.restoreAllMocks()
  // Close and delete the IDB to keep tests isolated
  if (mocks.db) {
    mocks.db.close()
    mocks.db = null
  }
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase('shadowlearn')
    req.onsuccess = () => resolve()
    req.onerror = () => resolve()
    req.onblocked = () => resolve()
  })
})

// ── helpers ───────────────────────────────────────────────────────────────────

function mockFetch(response: Partial<Response> & { json?: () => Promise<unknown> }) {
  globalThis.fetch = vi.fn().mockResolvedValueOnce(response) as unknown as typeof fetch
}

function mockFetchSequence(...responses: Array<Partial<Response> & { json?: () => Promise<unknown> }>) {
  const fn = vi.fn()
  for (const r of responses)
    fn.mockResolvedValueOnce(r)
  globalThis.fetch = fn as unknown as typeof fetch
}

const READY_BODY = {
  status: 'ready' as const,
  source: 'subtitle' as const,
  lang: 'en',
  segments: [{ start: 0, end: 2, text: 'hi' }],
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('useTipTranscript', () => {
  describe('behavior 1: 200 ready response', () => {
    it('returns status=ready with segments from a 200 response', async () => {
      mockFetch({
        status: 200,
        json: async () => READY_BODY,
      })

      const { result } = renderHook(() => useTipTranscript('vid-abc'))

      await waitFor(() => expect(result.current.status).toBe('ready'))
      expect(result.current.source).toBe('subtitle')
      expect(result.current.lang).toBe('en')
      expect(result.current.segments).toEqual([{ start: 0, end: 2, text: 'hi' }])
      expect(result.current.warming).toBeNull()
      expect(result.current.error).toBeNull()
    })
  })

  describe('behavior 2: IDB cache hit', () => {
    it('returns cached transcript without fetching', async () => {
      mocks.db = await initDB()
      await putTipTranscript(mocks.db, {
        videoId: 'vid-cached',
        status: 'ready',
        source: 'subtitle',
        lang: 'zh',
        segments: [{ start: 1, end: 3, text: '你好' }],
        fetchedAt: '2026-05-17T00:00:00Z',
      })

      const fetchSpy = vi.fn()
      globalThis.fetch = fetchSpy as unknown as typeof fetch

      const { result } = renderHook(() => useTipTranscript('vid-cached'))

      await waitFor(() => expect(result.current.status).toBe('ready'))
      expect(result.current.lang).toBe('zh')
      expect(result.current.segments).toEqual([{ start: 1, end: 3, text: '你好' }])
      expect(fetchSpy).not.toHaveBeenCalled()
    })
  })

  describe('behavior 3: 202 job polling resolves to ready', () => {
    // Note: we use real timers here but reduce POLL_INTERVAL_MS via a controlled fetch sequence.
    // Fake timers + waitFor from @testing-library conflict because waitFor uses setTimeout internally.
    // Instead, we use a fast-resolving fetch sequence and rely on real async scheduling.
    // The hook's 1500ms delay means we need to let it naturally elapse — but that makes tests slow.
    // Approach: use vi.useFakeTimers with advanceTimersByTimeAsync but wrap waitFor in act.

    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
    })
    afterEach(() => { vi.useRealTimers() })

    it('polls the job endpoint and resolves to ready', async () => {
      // First call: transcript endpoint → 202
      // Second call: job poll → 'transcription' step, still processing
      // Third call: job poll → 'complete' with result
      mockFetchSequence(
        {
          status: 202,
          json: async () => ({ status: 'pending', jobId: 'job-42' }),
        },
        {
          status: 200,
          ok: true,
          json: async () => ({
            id: 'job-42',
            step: 'transcription',
            status: 'processing',
          }),
        },
        {
          status: 200,
          ok: true,
          json: async () => ({
            id: 'job-42',
            step: 'indexing',
            status: 'complete',
            result: READY_BODY,
          }),
        },
      )

      const { result } = renderHook(() => useTipTranscript('vid-stt'))

      // Wait for the initial fetch to complete and warming to be set
      // shouldAdvanceTime:true lets real async microtasks still run
      await vi.advanceTimersByTimeAsync(100)
      await waitFor(() => expect(result.current.warming?.jobId).toBe('job-42'))
      expect(result.current.warming?.step).toBe('video_download')

      // Advance past first poll interval — job is in 'transcription' step
      await vi.advanceTimersByTimeAsync(1500)
      await waitFor(() => expect(result.current.warming?.step).toBe('transcription'))

      // Advance past second poll interval — job is complete
      await vi.advanceTimersByTimeAsync(1500)
      await waitFor(() => expect(result.current.status).toBe('ready'))

      expect(result.current.segments).toEqual(READY_BODY.segments)
    })
  })

  describe('behavior 4: 404 → status=unavailable', () => {
    it('sets status to unavailable on a 404 response', async () => {
      mockFetch({ status: 404 })

      const { result } = renderHook(() => useTipTranscript('vid-missing'))

      await waitFor(() => expect(result.current.status).toBe('unavailable'))
      expect(result.current.error).toBeNull()
      expect(result.current.warming).toBeNull()
    })

    it('sets status to error on a 5xx server response', async () => {
      mockFetch({ status: 503 })

      const { result } = renderHook(() => useTipTranscript('vid-down'))

      await waitFor(() => expect(result.current.status).toBe('error'))
      expect(result.current.error).toBeInstanceOf(Error)
      expect(result.current.error?.message).toMatch(/503/)
    })
  })

  describe('behavior 5: abort on videoId change', () => {
    it('reflects the new videoId state after rerender, not the previous pending state', async () => {
      // 'vid-A' fetch never resolves
      // 'vid-B' fetch resolves immediately to ready
      const fetchMock = vi.fn()
        .mockImplementationOnce(() => new Promise(() => {})) // vid-A: hangs forever
        .mockResolvedValueOnce({
          status: 200,
          json: async () => READY_BODY,
        })
      globalThis.fetch = fetchMock as unknown as typeof fetch

      const { result, rerender } = renderHook(({ id }) => useTipTranscript(id), {
        initialProps: { id: 'vid-A' },
      })

      // Give the 'vid-A' fetch a tick to kick off
      await new Promise(r => setTimeout(r, 0))

      // Change to vid-B — this should abort vid-A and start a fresh fetch
      rerender({ id: 'vid-B' })

      await waitFor(() => expect(result.current.status).toBe('ready'))
      expect(result.current.segments).toEqual(READY_BODY.segments)
    })
  })
})
