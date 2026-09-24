import type { DataClient } from '@/db'
import type { ConceptCard, StudioLocale, TipCardStatesRecord } from '@/features/learning-materials/domain/tips'
import { useCallback, useEffect, useRef, useState } from 'react'
import { cardsKey, getTipCardStates, updateTipCardStates } from '@/db'
import { apiFetch } from '@/shared/lib/api'

interface Args {
  db: DataClient | null
  videoId: string
  transcript: string
  locale: StudioLocale
}

type Status = 'idle' | 'loading' | 'ready' | 'error'
type RawCard = Omit<ConceptCard, 'state' | 'updatedAt'>

// See useTipStudio for cadence rationale — 5s balances responsiveness
// against network noise on the dev panel when multiple jobs run.
const POLL_INTERVAL_MS = 5000

interface StatusReady { status: 'ready', jobId: string, data: { cards: RawCard[] } }
interface StatusPending { status: 'pending', jobId: string }
interface StatusNone { status: 'none' }
type StatusBody = StatusReady | StatusPending | StatusNone

/**
 * Cards deck state. Mirrors :func:`useTipStudio` — the cards artifact rides
 * on the same studio job pipeline (``kind=cards``).
 */
export function useTipCards(args: Args) {
  const { db, videoId, transcript, locale } = args
  const [cards, setCards] = useState<ConceptCard[]>([])
  const [index, setIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [status, setStatus] = useState<Status>('idle')
  const [hydrated, setHydrated] = useState(false)
  // probeNonce is bumped by refresh() so other hook instances observing the
  // same artifact key can force a re-probe after a sibling kicks off a job.
  // Pure counter — value doesn't matter, only the change.
  const [probeNonce, setProbeNonce] = useState(0)
  const cancelledRef = useRef(false)
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const statesRef = useRef<TipCardStatesRecord['states']>({})

  const key = cardsKey(videoId, locale)
  const disabled = transcript.trim().length === 0

  const clearPoll = useCallback(() => {
    if (pollTimerRef.current !== null) {
      clearTimeout(pollTimerRef.current)
      pollTimerRef.current = null
    }
  }, [])

  const applyStates = useCallback((raw: RawCard[]): ConceptCard[] => {
    const now = new Date().toISOString()
    return raw.map((nc) => {
      const prior = statesRef.current[nc.front]
      return {
        ...nc,
        trap: nc.trap ?? null,
        state: prior?.state ?? 'new',
        updatedAt: prior?.updatedAt ?? now,
      }
    })
  }, [])

  const pollJob = useCallback((jobId: string) => {
    const tick = async () => {
      if (cancelledRef.current)
        return
      let res: Response
      try {
        res = await apiFetch(`/api/jobs/${encodeURIComponent(jobId)}`)
      }
      catch {
        pollTimerRef.current = setTimeout(tick, POLL_INTERVAL_MS)
        return
      }
      if (cancelledRef.current)
        return

      if (res.status === 404) {
        setStatus('error')
        return
      }
      if (!res.ok) {
        pollTimerRef.current = setTimeout(tick, POLL_INTERVAL_MS)
        return
      }
      const body = await res.json() as {
        status: 'processing' | 'complete' | 'error'
        result?: { data?: { cards: RawCard[] } } | null
      }
      if (body.status === 'processing') {
        pollTimerRef.current = setTimeout(tick, POLL_INTERVAL_MS)
        return
      }
      if (body.status === 'complete' && body.result?.data?.cards) {
        setCards(applyStates(body.result.data.cards))
        setIndex(0)
        setFlipped(false)
        setStatus('ready')
        return
      }
      setStatus('error')
    }
    pollTimerRef.current = setTimeout(tick, 0)
  }, [applyStates])

  // Reset state on key change (setState-during-render)
  const keySig = `${db ? '1' : '0'}|${key}|${probeNonce}`
  const [lastKeySig, setLastKeySig] = useState(keySig)
  if (lastKeySig !== keySig) {
    setLastKeySig(keySig)
    setCards([])
    setIndex(0)
    setFlipped(false)
    setStatus('idle')
    setHydrated(false)
  }

  useEffect(() => {
    cancelledRef.current = false
    clearPoll()
    if (!db)
      return

    void (async () => {
      void probeNonce
      let res: Response
      try {
        const [saved, probe] = await Promise.all([
          getTipCardStates(db, videoId, locale),
          apiFetch(`/api/tips/studio/cards/${encodeURIComponent(videoId)}?locale=${encodeURIComponent(locale)}`),
        ])
        statesRef.current = saved?.states ?? {}
        res = probe
      }
      catch {
        if (!cancelledRef.current)
          setHydrated(true)
        return
      }
      if (cancelledRef.current)
        return
      setHydrated(true)
      if (res.status === 404)
        return
      const body = await res.json() as StatusBody
      if (cancelledRef.current)
        return
      if (body.status === 'ready') {
        setCards(applyStates(body.data.cards))
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
  }, [db, videoId, locale, probeNonce, applyStates, pollJob, clearPoll])

  const refresh = useCallback(() => setProbeNonce(n => n + 1), [])

  const flip = useCallback(() => setFlipped(f => !f), [])
  const next = useCallback(() => {
    setIndex(i => Math.min(cards.length - 1, i + 1))
    setFlipped(false)
  }, [cards.length])
  const prev = useCallback(() => {
    setIndex(i => Math.max(0, i - 1))
    setFlipped(false)
  }, [])

  const updateCardState = useCallback(async (newState: 'known' | 'learning') => {
    if (!db || cards.length === 0)
      return
    const updatedAt = new Date().toISOString()
    const updated = cards.map((c, i) =>
      i === index ? { ...c, state: newState, updatedAt } : c,
    )
    setCards(updated)
    const mark = { [cards[index].front]: { state: newState, updatedAt } }
    statesRef.current = { ...statesRef.current, ...mark }
    const saved = await updateTipCardStates(db, videoId, locale, prev => ({ videoId, locale, states: { ...prev?.states, ...mark } }))
    statesRef.current = saved.states
    if (index < cards.length - 1) {
      setIndex(i => i + 1)
      setFlipped(false)
    }
  }, [db, cards, index, videoId, locale])

  const markKnown = useCallback(() => updateCardState('known'), [updateCardState])
  const markLearning = useCallback(() => updateCardState('learning'), [updateCardState])

  const doGenerate = useCallback(async () => {
    if (disabled || !db)
      return
    if (status === 'loading')
      return
    setStatus('loading')
    clearPoll()
    let res: Response
    try {
      res = await apiFetch(`/api/tips/studio/cards`, {
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
    const body = await res.json() as StatusBody
    if (cancelledRef.current)
      return
    if (body.status === 'ready') {
      setCards(applyStates(body.data.cards))
      setIndex(0)
      setFlipped(false)
      setStatus('ready')
      return
    }
    if (body.status === 'pending') {
      pollJob(body.jobId)
      return
    }
    setStatus('error')
  }, [db, videoId, transcript, locale, disabled, status, applyStates, pollJob, clearPoll])

  return {
    cards,
    index,
    flipped,
    status,
    disabled,
    /** Deprecated. Concurrency is per-artifact now; always false. */
    inFlightByOther: false,
    hydrated,
    flip,
    next,
    prev,
    markKnown,
    markLearning,
    generate: doGenerate,
    regenerate: doGenerate,
    refresh,
  }
}
