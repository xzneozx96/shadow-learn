import type { ShadowLearnDB } from '@/db'
import type {
  StudioCardsData,
  StudioKind,
  StudioLocale,
  StudioMindMapData,
  StudioStudyGuideData,
  StudioSummaryData,
} from '@/features/learning-materials/domain/tips'
import { useCallback, useEffect, useRef, useState } from 'react'
import { getTipStudio, putTipStudio, studioKey } from '@/db'
import { API_BASE } from '@/shared/lib/config'

type DataFor<K extends StudioKind>
  = K extends 'summary' ? StudioSummaryData
    : K extends 'study_guide' ? StudioStudyGuideData
      : K extends 'cards' ? StudioCardsData
        : K extends 'mind_map' ? StudioMindMapData
          : never

export type StudioStatus = 'idle' | 'loading' | 'ready' | 'error'

interface Args<K extends StudioKind> {
  db: ShadowLearnDB | null
  kind: K
  videoId: string
  transcript: string
  locale: StudioLocale
}

interface Returns<K extends StudioKind> {
  status: StudioStatus
  data: DataFor<K> | null
  disabled: boolean
  /**
   * False until the first IDB read settles. Lets callers render a
   *  neutral skeleton during the brief async hydration window, instead
   *  of flashing the wrong default branch (empty tile → filled tile)
   *  before the cached data lands.
   */
  hydrated: boolean
  /**
   * Deprecated. Always false now that each artifact runs its own job. Kept
   *  on the return type so call-sites referencing it still type-check.
   */
  inFlightByOther: boolean
  generate: () => Promise<void>
  regenerate: () => Promise<void>
  /**
   * Force a re-probe against the backend. Callers use this when a sibling
   *  hook instance is known to have kicked off a job for the same artifact
   *  key (e.g. the in-tab generate flow triggered work and the grid view
   *  needs to pick up the loading state on return).
   */
  refresh: () => void
}

// Poll cadence for an in-flight job. 5s is a good fit for artifact
// generation latency (typically 10-40s) — fast enough that completion
// surfaces within one tick, slow enough that a tab with 3-4 concurrent
// jobs doesn't flood the network panel. The status check is a single
// in-memory dict lookup so backend cost is negligible either way.
const POLL_INTERVAL_MS = 5000

interface StatusReady<K extends StudioKind> {
  status: 'ready'
  jobId: string
  data: DataFor<K>
}

interface StatusPending {
  status: 'pending'
  jobId: string
}

interface StatusNone {
  status: 'none'
}

type StatusBody<K extends StudioKind> = StatusReady<K> | StatusPending | StatusNone

/**
 * Studio artifact state machine.
 *
 * Backend is the source of truth for in-flight work. On mount we:
 *   1. Check IDB for a previously-cached final result.
 *   2. Otherwise probe ``GET /api/tips/studio/{kind}/{videoId}?locale=`` —
 *      a content-keyed lookup that returns either a completed result (rare
 *      after IDB miss but possible mid-prune), an in-flight ``jobId``, or
 *      ``none``. The probe is what makes reload-resume work without the
 *      client persisting any jobId.
 *
 * ``generate`` POSTs the trigger; the backend dedupes by the same content
 * key, so a second click during an in-flight run rejoins the existing job
 * instead of spawning a duplicate.
 */
export function useTipStudio<K extends StudioKind>(args: Args<K>): Returns<K> {
  const { db, kind, videoId, transcript, locale } = args
  const [status, setStatus] = useState<StudioStatus>('idle')
  const [data, setData] = useState<DataFor<K> | null>(null)
  const [hydrated, setHydrated] = useState(false)
  // See useTipCards: bumped by refresh() to force a re-probe.
  const [probeNonce, setProbeNonce] = useState(0)
  const cancelledRef = useRef(false)
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cacheKey = studioKey(videoId, kind, locale)
  const disabled = transcript.trim().length === 0

  const clearPoll = useCallback(() => {
    if (pollTimerRef.current !== null) {
      clearTimeout(pollTimerRef.current)
      pollTimerRef.current = null
    }
  }, [])

  const persistData = useCallback(async (value: DataFor<K>) => {
    if (!db)
      return
    await putTipStudio(db, {
      key: cacheKey,
      kind,
      videoId,
      locale,
      data: value,
      generatedAt: new Date().toISOString(),
    } as any)
  }, [db, cacheKey, kind, videoId, locale])

  const pollJob = useCallback((jobId: string) => {
    const tick = async () => {
      if (cancelledRef.current)
        return
      let res: Response
      try {
        res = await fetch(`${API_BASE}/api/jobs/${encodeURIComponent(jobId)}`)
      }
      catch {
        // Transient network error — retry on the next tick. Backend job
        // keeps running; we just lost visibility for one interval.
        pollTimerRef.current = setTimeout(tick, POLL_INTERVAL_MS)
        return
      }
      if (cancelledRef.current)
        return

      if (res.status === 404) {
        // Job pruned out of the in-memory store (over 1h old, or the server
        // restarted). Treat as a lost run; the user can re-trigger.
        setStatus('error')
        return
      }
      if (!res.ok) {
        // 5xx during poll — keep trying.
        pollTimerRef.current = setTimeout(tick, POLL_INTERVAL_MS)
        return
      }

      const body = await res.json() as {
        status: 'processing' | 'complete' | 'error'
        result?: { data?: DataFor<K> } | null
        error?: string | null
      }
      if (body.status === 'processing') {
        pollTimerRef.current = setTimeout(tick, POLL_INTERVAL_MS)
        return
      }
      if (body.status === 'complete' && body.result?.data) {
        await persistData(body.result.data)
        if (cancelledRef.current)
          return
        setData(body.result.data)
        setStatus('ready')
        return
      }
      // body.status === 'error' or malformed
      setStatus('error')
    }
    // Schedule the first tick immediately rather than after an interval —
    // there's usually no value in waiting before the first poll.
    pollTimerRef.current = setTimeout(tick, 0)
  }, [persistData])

  // Reset state on key change (setState-during-render).
  // Resets hydrated on key change so a navigation between videos shows the
  // skeleton again rather than briefly painting the previous tile's data.
  const keySig = `${db ? '1' : '0'}|${cacheKey}|${probeNonce}`
  const [lastKeySig, setLastKeySig] = useState(keySig)
  if (lastKeySig !== keySig) {
    setLastKeySig(keySig)
    setStatus('idle')
    setData(null)
    setHydrated(false)
  }

  // Mount / key-change effect. Reads IDB cache → probes backend → drives state.
  useEffect(() => {
    cancelledRef.current = false
    clearPoll()
    if (!db)
      return

    void (async () => {
      const cached = await getTipStudio(db, cacheKey)
      if (cancelledRef.current)
        return
      setHydrated(true)
      if (cached) {
        // Paint the IDB cache immediately so the tile doesn't flash empty,
        // then fall through to the backend probe. The probe is an
        // in-memory dict lookup on the backend (cheap), and skipping it
        // hides in-flight regen jobs from cold remounts — e.g. a tab
        // switch that fully unmounts StudioTab and brings up new hook
        // instances. Without the probe, the new instance would show
        // 'ready' over a still-running job and the user couldn't tell.
        setData(cached.data as DataFor<K>)
        setStatus('ready')
      }
      // probeNonce is only here so refresh() can force a re-run; the
      // probe itself runs every mount.
      void probeNonce

      // No final cache (or refreshing) — ask backend if anything is in
      // flight or freshly completed.
      let res: Response
      try {
        res = await fetch(
          `${API_BASE}/api/tips/studio/${kind}/${encodeURIComponent(videoId)}?locale=${encodeURIComponent(locale)}`,
        )
      }
      catch {
        // Network error during probe — leave state as idle. The user can
        // click Generate to retry; no inflight job is lost on the server.
        return
      }
      if (cancelledRef.current)
        return
      if (res.status === 404)
        return // idle

      const body = await res.json() as StatusBody<K>
      if (cancelledRef.current)
        return
      if (body.status === 'ready') {
        await persistData(body.data)
        if (cancelledRef.current)
          return
        setData(body.data)
        setStatus('ready')
        return
      }
      if (body.status === 'pending') {
        setStatus('loading')
        pollJob(body.jobId)
      }
    })()

    return () => {
      cancelledRef.current = true
      clearPoll()
    }
  // persistData / pollJob / clearPoll are stable per key set; explicit deps
  // mirror the key inputs to keep behavior predictable across remounts.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, cacheKey, probeNonce])

  const refresh = useCallback(() => setProbeNonce(n => n + 1), [])

  const doFetch = useCallback(async () => {
    if (disabled || !db)
      return
    // Disable regen while a job is already loading for this hook instance.
    if (status === 'loading')
      return
    setStatus('loading')
    clearPoll()
    let res: Response
    try {
      res = await fetch(`${API_BASE}/api/tips/studio/${kind}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ video_id: videoId, transcript, locale }),
      })
    }
    catch {
      if (!cancelledRef.current)
        setStatus('error')
      return
    }
    if (cancelledRef.current)
      return
    if (!res.ok && res.status !== 202) {
      setStatus('error')
      return
    }
    const body = await res.json() as StatusBody<K>
    if (cancelledRef.current)
      return
    if (body.status === 'ready') {
      await persistData(body.data)
      if (cancelledRef.current)
        return
      setData(body.data)
      setStatus('ready')
      return
    }
    if (body.status === 'pending') {
      pollJob(body.jobId)
      return
    }
    setStatus('error')
  }, [db, kind, videoId, transcript, locale, disabled, status, persistData, pollJob, clearPoll])

  return {
    status,
    data,
    disabled,
    inFlightByOther: false,
    hydrated,
    generate: doFetch,
    regenerate: doFetch,
    refresh,
  }
}
