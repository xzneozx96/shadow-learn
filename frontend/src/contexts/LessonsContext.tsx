import type { ShadowLearnDB } from '@/db'
import type { LessonMeta } from '@/types'
import * as React from 'react'
import { createContext, use, useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { deleteFullLesson, getAllLessonMetas, saveLessonMeta } from '@/db'
import { useJobPoller } from '@/hooks/useJobPoller'

interface LessonsContextValue {
  lessons: LessonMeta[]
  db: ShadowLearnDB | null
  updateLesson: (meta: LessonMeta) => Promise<void>
  deleteLesson: (id: string) => Promise<void>
  refreshLessons: () => Promise<void>
}

const LessonsContext = createContext<LessonsContextValue | null>(null)

export function LessonsProvider({ children }: { children: React.ReactNode }) {
  const { db } = useAuth()
  const [lessons, setLessons] = useState<LessonMeta[]>([])

  const refreshLessons = useCallback(async () => {
    if (!db)
      return
    const metas = await getAllLessonMetas(db)
    setLessons(metas)
  }, [db])

  const updateLesson = useCallback(async (meta: LessonMeta) => {
    if (!db)
      return
    await saveLessonMeta(db, meta)
    setLessons((prev) => {
      const idx = prev.findIndex(l => l.id === meta.id)
      if (idx === -1)
        return [...prev, meta]
      const next = [...prev]
      next[idx] = meta
      return next
    })
  }, [db])

  const deleteLesson = useCallback(async (id: string) => {
    if (!db)
      return
    await deleteFullLesson(db, id)
    setLessons(prev => prev.filter(l => l.id !== id))
  }, [db])

  useEffect(() => {
    refreshLessons()
  }, [refreshLessons])

  useJobPoller({ lessons, db, updateLesson })

  return (
    <LessonsContext value={{ lessons, db, updateLesson, deleteLesson, refreshLessons }}>
      {children}
    </LessonsContext>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useLessons(): LessonsContextValue {
  const ctx = use(LessonsContext)
  if (!ctx)
    throw new Error('useLessons must be used within LessonsProvider')
  return ctx
}
