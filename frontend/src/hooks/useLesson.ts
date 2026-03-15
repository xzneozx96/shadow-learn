import type { ShadowLearnDB } from '../db'
import type { LessonMeta, Segment } from '../types'
import { useCallback, useEffect, useState } from 'react'
import { getLessonMeta, getSegments, saveLessonMeta } from '../db'

interface UseLessonResult {
  meta: LessonMeta | null
  segments: Segment[]
  loading: boolean
  error: string | null
  updateMeta: (updates: Partial<LessonMeta>) => void
}

export function useLesson(db: ShadowLearnDB | null, lessonId: string | undefined): UseLessonResult {
  const [meta, setMeta] = useState<LessonMeta | null>(null)
  const [segments, setSegments] = useState<Segment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!db || !lessonId)
      return

    async function load() {
      try {
        setLoading(true)
        const [m, s] = await Promise.all([
          getLessonMeta(db!, lessonId!),
          getSegments(db!, lessonId!),
        ])
        if (!m) {
          setError('Lesson not found')
          return
        }
        // Update lastOpenedAt
        m.lastOpenedAt = new Date().toISOString()
        await saveLessonMeta(db!, m)
        setMeta(m)
        setSegments(s || [])
      }
      catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load lesson')
      }
      finally {
        setLoading(false)
      }
    }

    load()
  }, [db, lessonId])

  // Stable reference (empty deps) — safe to list as a dep in LessonView callbacks
  const updateMeta = useCallback((updates: Partial<LessonMeta>) => {
    setMeta(prev => prev ? { ...prev, ...updates } : prev)
  }, [])

  return { meta, segments, loading, error, updateMeta }
}
