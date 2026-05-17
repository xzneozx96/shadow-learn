import type { ShadowLearnDB } from '@/db'
import type { ConceptCard, StudioLocale } from '@/types/tips'
import { useCallback, useEffect, useRef, useState } from 'react'
import { cardsKey, getTipCards, putTipCards } from '@/db'
import { useStudioLock } from './useStudioLock'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? ''

interface Args {
  db: ShadowLearnDB | null
  videoId: string
  transcript: string
  locale: StudioLocale
}

export function useTipCards(args: Args) {
  const { db, videoId, transcript, locale } = args
  const [cards, setCards] = useState<ConceptCard[]>([])
  const [index, setIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const cancelledRef = useRef(false)
  const lock = useStudioLock(`cards:${videoId}:${locale}`)
  const key = cardsKey(videoId, locale)
  const disabled = transcript.trim().length === 0

  useEffect(() => {
    cancelledRef.current = false
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
      }
    })()
    return () => { cancelledRef.current = true }
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
    if (!lock.acquire())
      return
    setStatus('loading')
    try {
      const res = await fetch(`${API_BASE}/api/tips/studio/cards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ video_id: videoId, transcript, locale }),
      })
      if (!res.ok)
        throw new Error(`status ${res.status}`)
      const body = await res.json() as { cards: Array<Omit<ConceptCard, 'state' | 'updatedAt'>> }

      // Preserve known/learning state for cards whose front-question matches an existing card.
      const existingByFront = new Map(cards.map(c => [c.front, c]))
      const now = new Date().toISOString()
      const merged: ConceptCard[] = body.cards.map((nc) => {
        const prior = existingByFront.get(nc.front)
        return {
          ...nc,
          trap: nc.trap ?? null,
          state: prior?.state ?? 'new',
          updatedAt: prior?.updatedAt ?? now,
        }
      })

      await putTipCards(db, { key, videoId, locale, cards: merged, generatedAt: now })
      if (cancelledRef.current)
        return
      setCards(merged)
      setIndex(0)
      setFlipped(false)
      setStatus('ready')
    }
    catch {
      if (!cancelledRef.current)
        setStatus('error')
    }
    finally {
      lock.release()
    }
  }, [db, key, videoId, transcript, locale, disabled, cards, lock])

  return {
    cards,
    index,
    flipped,
    status,
    disabled,
    inFlightByOther: lock.inFlightByOther,
    flip,
    next,
    prev,
    markKnown,
    markLearning,
    generate: doGenerate,
    regenerate: doGenerate,
  }
}
