import type { DataClient, LessonMedia } from '@/db'
import type { LessonMeta, Segment } from '@/shared/types'
import { useCallback, useEffect, useState } from 'react'
import { getLesson, saveLessonMeta } from '@/db'

interface UseLessonResult {
  meta: LessonMeta | null
  segments: Segment[]
  media: LessonMedia | null
  loading: boolean
  error: string | null
  updateMeta: (updates: Partial<LessonMeta>) => void
}

export function useLesson(db: DataClient | null, lessonId: string | undefined): UseLessonResult {
  const [meta, setMeta] = useState<LessonMeta | null>(null)
  const [segments, setSegments] = useState<Segment[]>([])
  const [media, setMedia] = useState<LessonMedia | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!db || !lessonId)
      return

    let cancelled = false
    async function load(client: DataClient, id: string) {
      try {
        setLoading(true)
        const lesson = await getLesson(client, id)
        if (cancelled)
          return
        if (!lesson)
          return
        const opened = { ...lesson.meta, lastOpenedAt: new Date().toISOString() }
        setMeta(opened)
        setSegments(lesson.segments)
        setMedia(lesson.media)
        // Best effort: a missed last-opened timestamp only affects Library sort order.
        saveLessonMeta(client, opened).catch(() => {})
      }
      catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : 'Failed to load lesson')
      }
      finally {
        if (!cancelled)
          setLoading(false)
      }
    }

    load(db, lessonId)
    return () => {
      cancelled = true
    }
  }, [db, lessonId])

  // Stable reference (empty deps) — safe to list as a dep in LessonView callbacks
  const updateMeta = useCallback((updates: Partial<LessonMeta>) => {
    setMeta(prev => prev ? { ...prev, ...updates } : prev)
  }, [])

  return { meta, segments, media, loading, error, updateMeta }
}
