import type { ShadowingBest } from '@/types'
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import {
  getAllSpeakingBestsByLesson,
  getSpeakingAudio,
  saveSpeakingAudio,
  saveSpeakingBest,
} from '@/db'

export interface UseSpeakingBestsReturn {
  bests: Map<string, ShadowingBest>
  getBest: (segmentId: string) => ShadowingBest | undefined
  saveBest: (best: ShadowingBest, blob: Blob) => Promise<void>
  getAudio: (segmentId: string) => Promise<Blob | undefined>
}

export function useSpeakingBests(lessonId: string): UseSpeakingBestsReturn {
  const { db } = useAuth()
  const [bests, setBests] = useState<Map<string, ShadowingBest>>(() => new Map())

  useEffect(() => {
    if (!db || !lessonId)
      return
    let ignore = false
    getAllSpeakingBestsByLesson(db, lessonId)
      .then((all) => {
        if (!ignore)
          setBests(new Map(all.map(b => [b.segmentId, b])))
      })
      .catch(err => console.error('[useSpeakingBests] load failed', err))
    return () => { ignore = true }
  }, [db, lessonId])

  const getBest = (segmentId: string) => bests.get(segmentId)

  const saveBest = useCallback(
    async (best: ShadowingBest, blob: Blob) => {
      if (!db)
        return
      await Promise.all([
        saveSpeakingBest(db, best),
        saveSpeakingAudio(db, best.lessonId, best.segmentId, blob),
      ])
      setBests(prev => new Map(prev).set(best.segmentId, best))
    },
    [db],
  )

  const getAudio = useCallback(
    async (segmentId: string) => {
      if (!db)
        return undefined
      return getSpeakingAudio(db, lessonId, segmentId)
    },
    [db, lessonId],
  )

  return { bests, getBest, saveBest, getAudio }
}
