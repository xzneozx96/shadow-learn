import type { ShadowLearnDB } from '@/db'
import type { ConceptCard, StudioLocale } from '@/types/tips'
import { useCallback, useEffect, useRef, useState } from 'react'
import { cardsKey, getTipCards, putTipCards } from '@/db'
import { API_BASE } from '@/lib/config'

interface Args {
  db: ShadowLearnDB | null
  videoId: string
  transcript: string
  locale: StudioLocale
}

type Status = 'idle' | 'loading' | 'ready' | 'error'
type RawCard = Omit<ConceptCard, 'state' | 'updatedAt'>

const POLL_INTERVAL_MS = 1000

interface StatusReady { status: 'ready', jobId: string, data: { cards: RawCard[] } }
interface StatusPending { status: 'pending', jobId: string }
interface StatusNone { status: 'none' }
type StatusBody = StatusReady | StatusPending | StatusNone

/**
 * Cards deck state. Mirrors :func:`useTipStudio` — the cards artifact rides
 * on the same studio job pipeline (``kind=cards``). The hook layers a small
 * SRS-style state machine on top: ``state`` (new / known / learning) lives
 * per-card in the IDB row and is preserved across regenerations when the
 * front-question matches an existing card.
 */
export function useTipCards(args: Args) {
  const { db, videoId, transcript, locale } = args
  const [cards, setCards] = useState<ConceptCard[]>([])
  const [index, setIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [status, setStatus] = useState<Status>('idle')
  const cancelledRef = useRef(false)
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cardsRef = useRef<ConceptCard[]>([])

  const key = cardsKey(videoId, locale)
  const disabled = transcript.trim().length === 0

  useEffect(() => { cardsRef.current = cards }, [cards])

  const clearPoll = useCallback(() => {
    if (pollTimerRef.current !== null) {
      clearTimeout(pollTimerRef.current)
      pollTimerRef.current = null
    }
  }, [])

  const persistDeck = useCallback(async (raw: RawCard[]) => {
    if (!db)
      return [] as ConceptCard[]
    // Preserve known/learning state on regen — match by front-question text.
    const existingByFront = new Map(cardsRef.current.map(c => [c.front, c]))
    const now = new Date().toISOString()
    const merged: ConceptCard[] = raw.map((nc) => {
      const prior = existingByFront.get(nc.front)
      return {
        ...nc,
        trap: nc.trap ?? null,
        state: prior?.state ?? 'new',
        updatedAt: prior?.updatedAt ?? now,
      }
    })
    await putTipCards(db, { key, videoId, locale, cards: merged, generatedAt: now })
    return merged
  }, [db, key, videoId, locale])

  const pollJob = useCallback((jobId: string) => {
    const tick = async () => {
      if (cancelledRef.current)
        return
      let res: Response
      try {
        res = await fetch(`${API_BASE}/api/jobs/${encodeURIComponent(jobId)}`)
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
        const merged = await persistDeck(body.result.data.cards)
        if (cancelledRef.current)
          return
        setCards(merged)
        setIndex(0)
        setFlipped(false)
        setStatus('ready')
        return
      }
      setStatus('error')
    }
    pollTimerRef.current = setTimeout(tick, 0)
  }, [persistDeck])

  useEffect(() => {
    cancelledRef.current = false
    clearPoll()
    setCards([])
    setIndex(0)
    setFlipped(false)
    setStatus('idle')
    if (!db)
      return

    void (async () => {
      const cached = await getTipCards(db, key)
      if (cancelledRef.current)
        return
      if (cached) {
        setCards(cached.cards)
        setStatus('ready')
        return
      }
      let res: Response
      try {
        res = await fetch(
          `${API_BASE}/api/tips/studio/cards/${encodeURIComponent(videoId)}?locale=${encodeURIComponent(locale)}`,
        )
      }
      catch {
        return
      }
      if (cancelledRef.current)
        return
      if (res.status === 404)
        return
      const body = await res.json() as StatusBody
      if (cancelledRef.current)
        return
      if (body.status === 'ready') {
        const merged = await persistDeck(body.data.cards)
        if (cancelledRef.current)
          return
        setCards(merged)
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, key])

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
    const updated = cards.map((c, i) =>
      i === index ? { ...c, state: newState, updatedAt: new Date().toISOString() } : c,
    )
    setCards(updated)
    await putTipCards(db, { key, videoId, locale, cards: updated, generatedAt: new Date().toISOString() })
    if (index < cards.length - 1) {
      setIndex(i => i + 1)
      setFlipped(false)
    }
  }, [db, cards, index, key, videoId, locale])

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
      res = await fetch(`${API_BASE}/api/tips/studio/cards`, {
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
      const merged = await persistDeck(body.data.cards)
      if (cancelledRef.current)
        return
      setCards(merged)
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
  }, [db, videoId, transcript, locale, disabled, status, persistDeck, pollJob, clearPoll])

  return {
    cards,
    index,
    flipped,
    status,
    disabled,
    /** Deprecated. Concurrency is per-artifact now; always false. */
    inFlightByOther: false,
    flip,
    next,
    prev,
    markKnown,
    markLearning,
    generate: doGenerate,
    regenerate: doGenerate,
  }
}
