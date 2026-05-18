import type { TipSegment, TipTranscriptStatus } from '@/types'
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { getTipTranscript, putTipTranscript } from '@/db'
import { API_BASE } from '@/lib/config'

const POLL_INTERVAL_MS = 1500
const POLL_TIMEOUT_MS = 300_000

// Debug logging for the warming-state jumping bug. Strip after diagnosis.
// Toggle by setting localStorage.setItem('debug:tipTranscript', '1') in console.
function dbg(tag: string, payload: Record<string, unknown> = {}) {
  if (typeof window !== 'undefined' && window.localStorage?.getItem('debug:tipTranscript') !== '1')
    return
  const t = new Date().toISOString().slice(11, 23) // HH:MM:SS.mmm
  // eslint-disable-next-line no-console
  console.log(`[tipTr ${t}] ${tag}`, payload)
}

export type WarmingStep = 'queued' | 'video_download' | 'audio_extraction' | 'transcription' | 'indexing'

export interface WarmingState {
  step: WarmingStep
  jobId: string
}

export interface UseTipTranscriptResult {
  status: TipTranscriptStatus
  source: 'subtitle' | 'stt' | null
  lang: string | null
  segments: TipSegment[]
  warming: WarmingState | null
  error: Error | null
  durationSec: number | null
  limitSec: number | null
  retry: () => void
}

interface ServerReady {
  status: 'ready'
  source: 'subtitle' | 'stt'
  lang: string | null
  segments: TipSegment[]
}
interface ServerPending { status: 'pending', jobId: string }
interface ServerUnavailable { status: 'unavailable' }
interface ServerTooLong { status: 'too_long', durationSec: number, limitSec: number }
type ServerResponse = ServerReady | ServerPending | ServerUnavailable | ServerTooLong

interface JobShape {
  id?: string
  step: WarmingStep
  status: 'pending' | 'processing' | 'complete' | 'error'
  result?: ServerReady
  error?: string
}

const INITIAL: UseTipTranscriptResult = {
  status: 'pending',
  source: null,
  lang: null,
  segments: [],
  warming: null,
  error: null,
  durationSec: null,
  limitSec: null,
  retry: () => {},
}

function makeInitial(retry: () => void): UseTipTranscriptResult {
  return { ...INITIAL, retry }
}

export function useTipTranscript(videoId: string): UseTipTranscriptResult {
  const { db } = useAuth()
  const [tick, setTick] = useState(0)
  const retry = () => setTick(t => t + 1)
  const key = `${videoId}:${tick}`

  // Single piece of state holding both the active key AND the result. This
  // collapses what used to be two separate useState calls so the reset on
  // videoId change commits atomically — previously, setLastKey and
  // setResult could land in different render passes, leaving a frame where
  // lastKey was already updated but result still held the previous video's
  // warming.step (e.g. 'indexing' = all done) before flipping to the real
  // initial step 1 state.
  const [entry, setEntry] = useState<{ key: string, result: UseTipTranscriptResult }>(
    () => ({ key, result: makeInitial(retry) }),
  )
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // db arrives asynchronously from AuthContext. We must not include it in
  // useEffect deps — otherwise the moment db transitions null → non-null
  // (very common during initial mount), the effect tears down the in-flight
  // load and restarts. The frontend then sees warming.step regress (e.g.
  // step 3 → step 1) because the second load() requests a NEW backend job
  // that starts fresh from 'video_download'. Stash db on a ref and let
  // load()/persistReady read the latest value at the moment of use.
  const dbRef = useRef(db)
  dbRef.current = db

  const isStale = entry.key !== key
  if (isStale) {
    dbg('RENDER stale-reset', { from: entry.key, to: key, prevResult: entry.result })
    setEntry({ key, result: makeInitial(retry) })
  }

  const visible = isStale ? makeInitial(retry) : entry.result
  dbg('RENDER', {
    key,
    isStale,
    db: db ? 'present' : 'null',
    visible_status: visible.status,
    visible_warming: visible.warming?.step ?? null,
  })

  type Updater = UseTipTranscriptResult | ((r: UseTipTranscriptResult) => UseTipTranscriptResult)
  function setResult(updater: Updater): void {
    setEntry((prev) => {
      // Defend against late writes from the previous video's async tasks.
      if (prev.key !== key) {
        dbg('setResult STALE-GUARD-DROP', { prev_key: prev.key, current_key: key })
        return prev
      }
      const nextResult = typeof updater === 'function'
        ? (updater as (r: UseTipTranscriptResult) => UseTipTranscriptResult)(prev.result)
        : updater
      dbg('setResult APPLY', {
        key,
        from_status: prev.result.status,
        from_warming: prev.result.warming?.step ?? null,
        to_status: nextResult.status,
        to_warming: nextResult.warming?.step ?? null,
      })
      return { key: prev.key, result: nextResult }
    })
  }

  useEffect(() => {
    if (!videoId)
      return

    dbg('EFFECT RUN', { videoId, tick, db: dbRef.current ? 'present' : 'null' })

    const controller = new AbortController()
    const state = { cancelled: false }

    async function persistReady(body: ServerReady) {
      const d = dbRef.current
      if (!d)
        return
      await putTipTranscript(d, {
        videoId,
        status: 'ready',
        source: body.source,
        lang: body.lang,
        segments: body.segments,
        fetchedAt: new Date().toISOString(),
      })
    }

    async function load() {
      dbg('LOAD start', { videoId })
      const d = dbRef.current
      if (d) {
        const cached = await getTipTranscript(d, videoId)
        if (state.cancelled) {
          dbg('LOAD cancelled-after-cache-read', { videoId })
          return
        }
        dbg('LOAD cache', { videoId, cached: cached?.status ?? 'none' })
        if (cached && cached.status === 'ready') {
          setResult({
            status: 'ready',
            source: cached.source,
            lang: cached.lang,
            segments: cached.segments,
            warming: null,
            error: null,
            durationSec: null,
            limitSec: null,
            retry,
          })
          return
        }
        if (cached && cached.status === 'too_long') {
          setResult({
            status: 'too_long',
            source: null,
            lang: null,
            segments: [],
            warming: null,
            error: null,
            durationSec: cached.durationSec ?? null,
            limitSec: cached.limitSec ?? null,
            retry,
          })
          return
        }
      }

      try {
        dbg('LOAD fetch transcript', { videoId })
        const res = await fetch(`${API_BASE}/api/tips/transcript/${encodeURIComponent(videoId)}`, { signal: controller.signal })
        dbg('LOAD fetch returned', { videoId, status: res.status })
        if (state.cancelled) {
          dbg('LOAD cancelled-after-fetch', { videoId })
          return
        }
        if (res.status === 404) {
          setResult(r => ({ ...r, status: 'unavailable', warming: null }))
          return
        }
        if (res.status >= 400) {
          // 404 handled above; any other 4xx/5xx surfaces as error.
          setResult(r => ({ ...r, status: 'error', error: new Error(`transcript fetch failed: ${res.status}`), warming: null }))
          return
        }
        const body = (await res.json()) as ServerResponse
        if (body.status === 'ready') {
          await persistReady(body)
          if (state.cancelled)
            return
          setResult({
            status: 'ready',
            source: body.source,
            lang: body.lang,
            segments: body.segments,
            warming: null,
            error: null,
            durationSec: null,
            limitSec: null,
            retry,
          })
          return
        }
        if (body.status === 'too_long') {
          const d2 = dbRef.current
          if (d2) {
            await putTipTranscript(d2, {
              videoId,
              status: 'too_long',
              source: null,
              lang: null,
              segments: [],
              fetchedAt: new Date().toISOString(),
              durationSec: body.durationSec,
              limitSec: body.limitSec,
            })
          }
          if (state.cancelled)
            return
          setResult({
            status: 'too_long',
            source: null,
            lang: null,
            segments: [],
            warming: null,
            error: null,
            durationSec: body.durationSec,
            limitSec: body.limitSec,
            retry,
          })
          return
        }
        if (body.status === 'pending') {
          dbg('LOAD got 202 pending', { videoId, jobId: body.jobId })
          setResult(r => ({
            ...r,
            status: 'pending',
            warming: { step: 'video_download', jobId: body.jobId },
            retry,
          }))
          await pollJob(body.jobId)
        }
      }
      catch (err) {
        if (controller.signal.aborted || state.cancelled)
          return
        setResult(r => ({ ...r, status: 'error', error: err as Error, warming: null }))
      }
    }

    async function pollJob(jobId: string) {
      dbg('POLL start', { videoId, jobId })
      const startedAt = Date.now()
      while (!state.cancelled && !controller.signal.aborted) {
        if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
          setResult(r => ({ ...r, status: 'error', error: new Error('transcription timeout'), warming: null }))
          return
        }
        await new Promise<void>((resolve) => {
          pollTimerRef.current = setTimeout(resolve, POLL_INTERVAL_MS)
        })
        if (state.cancelled || controller.signal.aborted)
          return
        try {
          const res = await fetch(`${API_BASE}/api/jobs/${encodeURIComponent(jobId)}`, { signal: controller.signal })
          if (!res.ok)
            continue
          const job = (await res.json()) as JobShape
          dbg('POLL tick', { videoId, jobId, job_step: job.step, job_status: job.status })
          setResult(r => r.status === 'pending'
            ? { ...r, warming: { step: job.step, jobId } }
            : r,
          )
          if (job.status === 'complete' && job.result) {
            await persistReady(job.result)
            if (state.cancelled)
              return
            setResult({
              status: 'ready',
              source: job.result.source,
              lang: job.result.lang,
              segments: job.result.segments,
              warming: { step: 'indexing', jobId },
              error: null,
              retry,
            })
            return
          }
          if (job.status === 'error') {
            setResult(r => ({ ...r, status: 'error', error: new Error(job.error ?? 'STT failed'), warming: null }))
            return
          }
        }
        catch {
          if (controller.signal.aborted)
            return
          // transient — keep polling
        }
      }
    }

    void load()
    return () => {
      dbg('EFFECT CLEANUP', { videoId, tick })
      state.cancelled = true
      controller.abort()
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current)
        pollTimerRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- db read via ref intentionally
  }, [videoId, tick])

  return visible
}
