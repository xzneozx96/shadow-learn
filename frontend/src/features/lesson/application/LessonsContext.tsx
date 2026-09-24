import type { DataClient } from '@/db'
import type { LessonMeta } from '@/shared/types'
import * as React from 'react'
import { createContext, use, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '@/app/providers/AuthContext'
import { deleteFullLesson, getAllLessonMetas, renameLesson as renameServerLesson, saveLessonMeta } from '@/db'
import { pendingLessonsKey } from '@/features/lesson/application/pendingLessons'
import { useJobPoller } from '@/features/lesson/application/useJobPoller'

type LessonsStatus = 'loading' | 'ready' | 'error'

interface LessonsContextValue {
  lessons: LessonMeta[]
  status: LessonsStatus
  error: string | null
  reload: () => Promise<void>
  db: DataClient | null
  updateLesson: (meta: LessonMeta) => Promise<void>
  renameLesson: (meta: LessonMeta, title: string) => Promise<void>
  deleteLesson: (id: string) => Promise<void>
}

const LessonsContext = createContext<LessonsContextValue | null>(null)

function isLocalOnly(meta: LessonMeta): boolean {
  return meta.status === 'processing' || meta.status === 'error'
}

function readPending(userId: string | undefined): LessonMeta[] {
  if (!userId)
    return []
  try {
    return JSON.parse(localStorage.getItem(pendingLessonsKey(userId)) ?? '[]')
  }
  catch {
    return []
  }
}

function upsert(list: LessonMeta[], meta: LessonMeta): LessonMeta[] {
  const idx = list.findIndex(l => l.id === meta.id)
  if (idx === -1)
    return [meta, ...list]
  const next = [...list]
  next[idx] = meta
  return next
}

export function LessonsProvider({ children }: { children: React.ReactNode }) {
  const { db, session } = useAuth()
  const userId = session?.userId
  const [serverLessons, setServerLessons] = useState<LessonMeta[]>([])
  const [pending, setPending] = useState<LessonMeta[]>(() => readPending(userId))
  const [status, setStatus] = useState<LessonsStatus>('loading')
  const [error, setError] = useState<string | null>(null)
  const requestRef = useRef(0)

  useEffect(() => {
    if (userId)
      localStorage.setItem(pendingLessonsKey(userId), JSON.stringify(pending))
  }, [userId, pending])

  const reload = useCallback(async () => {
    if (!db)
      return
    const request = ++requestRef.current
    setStatus(s => s === 'ready' ? 'ready' : 'loading')
    try {
      const metas = await getAllLessonMetas(db)
      if (request !== requestRef.current)
        return
      setServerLessons(metas)
      setError(null)
      setStatus('ready')
    }
    catch (e) {
      if (request !== requestRef.current)
        return
      setError(e instanceof Error ? e.message : 'Failed to load lessons')
      setStatus('error')
    }
  }, [db])

  const updateLesson = useCallback(async (meta: LessonMeta) => {
    if (!db)
      return
    if (isLocalOnly(meta)) {
      setPending(prev => upsert(prev, meta))
      return
    }
    await saveLessonMeta(db, meta)
    setServerLessons(prev => upsert(prev, meta))
  }, [db])

  const renameLesson = useCallback(async (meta: LessonMeta, title: string) => {
    if (!db)
      return
    const renamed = { ...meta, title }
    if (isLocalOnly(meta)) {
      setPending(prev => upsert(prev, renamed))
      return
    }
    await renameServerLesson(db, meta.id, title)
    setServerLessons(prev => upsert(prev, renamed))
  }, [db])

  const deleteLesson = useCallback(async (id: string) => {
    if (!db)
      return
    if (pending.some(l => l.id === id)) {
      setPending(prev => prev.filter(l => l.id !== id))
      return
    }
    await deleteFullLesson(db, id)
    setServerLessons(prev => prev.filter(l => l.id !== id))
  }, [db, pending])

  const completeLesson = useCallback(async (id: string) => {
    await reload()
    setPending(prev => prev.filter(l => l.id !== id))
  }, [reload])

  useEffect(() => {
    reload()
  }, [reload])

  const lessons = useMemo(() => [...pending, ...serverLessons], [pending, serverLessons])

  useJobPoller({ lessons, updateLesson, completeLesson })

  return (
    <LessonsContext value={{ lessons, status, error, reload, db, updateLesson, renameLesson, deleteLesson }}>
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
