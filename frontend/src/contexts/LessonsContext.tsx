import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { LessonMeta } from '@/types'
import type { ShadowLearnDB } from '@/db'
import { deleteFullLesson, getAllLessonMetas, saveLessonMeta } from '@/db'
import { useAuth } from '@/contexts/AuthContext'
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
    setLessons(prev => {
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
    <LessonsContext.Provider value={{ lessons, db, updateLesson, deleteLesson, refreshLessons }}>
      {children}
    </LessonsContext.Provider>
  )
}

export function useLessons(): LessonsContextValue {
  const ctx = useContext(LessonsContext)
  if (!ctx)
    throw new Error('useLessons must be used within LessonsProvider')
  return ctx
}
