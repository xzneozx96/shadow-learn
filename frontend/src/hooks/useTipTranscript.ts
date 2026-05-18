import type { TipSegment, TipTranscriptStatus } from '@/types'
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { getTipTranscript, putTipTranscript } from '@/db'
import { API_BASE } from '@/lib/config'

const POLL_INTERVAL_MS = 1500
const POLL_TIMEOUT_MS = 300_000

export type WarmingStep = 'video_download' | 'audio_extraction' | 'transcription' | 'indexing'

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
  const [lastKey, setLastKey] = useState(`${videoId}:${tick}`)
  const key = `${videoId}:${tick}`

  const [result, setResult] = useState<UseTipTranscriptResult>(() => makeInitial(retry))
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Reset state synchronously during render when videoId or tick changes
  if (lastKey !== key) {
    setLastKey(key)
    setResult(makeInitial(retry))
  }

  useEffect(() => {
    if (!videoId)
      return

    const controller = new AbortController()
    const state = { cancelled: false }

    async function persistReady(body: ServerReady) {
      if (!db)
        return
      await putTipTranscript(db, {
        videoId,
        status: 'ready',
        source: body.source,
        lang: body.lang,
        segments: body.segments,
        fetchedAt: new Date().toISOString(),
      })
    }

    async function load() {
      if (db) {
        const cached = await getTipTranscript(db, videoId)
        if (state.cancelled)
          return
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
        const res = await fetch(`${API_BASE}/api/tips/transcript/${encodeURIComponent(videoId)}`, { signal: controller.signal })
        if (state.cancelled)
          return
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
          if (db) {
            await putTipTranscript(db, {
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
      state.cancelled = true
      controller.abort()
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current)
        pollTimerRef.current = null
      }
    }
  }, [videoId, db, tick])

  return result
}
