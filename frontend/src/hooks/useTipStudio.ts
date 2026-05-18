import type { ShadowLearnDB } from '@/db'
import type {
  StudioCardsData,
  StudioKind,
  StudioLocale,
  StudioStudyGuideData,
  StudioSummaryData,
} from '@/types/tips'
import { useCallback, useEffect, useRef, useState } from 'react'
import { getTipStudio, putTipStudio, studioKey } from '@/db'
import { API_BASE } from '@/lib/config'
import { useStudioLock } from './useStudioLock'

type DataFor<K extends StudioKind>
  = K extends 'summary' ? StudioSummaryData
    : K extends 'study_guide' ? StudioStudyGuideData
      : K extends 'cards' ? StudioCardsData
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
  inFlightByOther: boolean
  generate: () => Promise<void>
  regenerate: () => Promise<void>
}

export function useTipStudio<K extends StudioKind>(args: Args<K>): Returns<K> {
  const { db, kind, videoId, transcript, locale } = args
  const [status, setStatus] = useState<StudioStatus>('idle')
  const [data, setData] = useState<DataFor<K> | null>(null)
  const cancelledRef = useRef(false)
  const lock = useStudioLock(`${kind}:${videoId}:${locale}`)

  const cacheKey = studioKey(videoId, kind, locale)
  const disabled = transcript.trim().length === 0

  // Read cache on mount / when key changes
  useEffect(() => {
    cancelledRef.current = false
    setStatus('idle')
    setData(null)
    if (!db)
      return
    void (async () => {
      const cached = await getTipStudio(db, cacheKey)
      if (cancelledRef.current)
        return
      if (cached) {
        setData(cached.data as DataFor<K>)
        setStatus('ready')
      }
    })()
    return () => { cancelledRef.current = true }
  }, [db, cacheKey])

  const doFetch = useCallback(async () => {
    if (disabled || !db)
      return
    if (!lock.acquire())
      return
    setStatus('loading')
    try {
      const res = await fetch(`${API_BASE}/api/tips/studio/${kind}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ video_id: videoId, transcript, locale }),
      })
      if (!res.ok)
        throw new Error(`status ${res.status}`)
      const json = await res.json() as DataFor<K>
      await putTipStudio(db, {
        key: cacheKey,
        kind,
        videoId,
        locale,
        data: json,
        generatedAt: new Date().toISOString(),
      } as any)
      if (cancelledRef.current)
        return
      setData(json)
      setStatus('ready')
    }
    catch {
      if (!cancelledRef.current)
        setStatus('error')
    }
    finally {
      lock.release()
    }
  }, [db, kind, videoId, transcript, locale, cacheKey, disabled, lock])

  return {
    status,
    data,
    disabled,
    inFlightByOther: lock.inFlightByOther,
    generate: doFetch,
    regenerate: doFetch,
  }
}
