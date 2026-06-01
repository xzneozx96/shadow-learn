import type { TipProgress } from '@/features/learning-materials/domain/tips'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '@/app/providers/AuthContext'
import { getTipProgress, putTipProgress } from '@/db'

const WATCHED_THRESHOLD = 0.8

export interface UseTipProgressResult {
  loaded: boolean
  watchedSec: number
  totalSec: number
  completed: boolean
  recordPosition: (watchedSec: number, totalSec: number, meta?: { title?: string, route?: string }) => Promise<void>
  markComplete: () => Promise<void>
  markIncomplete: () => Promise<void>
}

export function useTipProgress(courseId: string, videoId: string): UseTipProgressResult {
  const { db } = useAuth()
  const key = `${courseId}:${videoId}`
  const [state, setState] = useState<{ loaded: boolean, p: TipProgress | null }>({ loaded: false, p: null })
  const [lastKey, setLastKey] = useState(key)
  // Updated on every render so in-flight IDB fetches for the old key can
  // self-discard before the effect cleanup has a chance to set `cancelled`.
  const currentKeyRef = useRef(key)
  currentKeyRef.current = key

  // Reset immediately during render when the key changes. Prevents stale
  // `completed`/`watchedSec` from the old key bleeding into TipCoursePage's
  // completedSet effect while IDB for the new key is loading.
  if (lastKey !== key) {
    setLastKey(key)
    setState({ loaded: false, p: null })
  }

  useEffect(() => {
    let cancelled = false
    const snapshotKey = key
    async function load() {
      if (!db) {
        if (!cancelled && currentKeyRef.current === snapshotKey)
          setState({ loaded: true, p: null })
        return
      }
      const p = await getTipProgress(db, snapshotKey)
      // Guard against both unmount (cancelled) and key-change races where the
      // during-render reset fires but the cleanup hasn't run yet.
      if (!cancelled && currentKeyRef.current === snapshotKey)
        setState({ loaded: true, p: p ?? null })
    }
    void load()
    return () => { cancelled = true }
  }, [db, key])

  const writeState = useCallback(async (next: TipProgress) => {
    setState({ loaded: true, p: next })
    if (db)
      await putTipProgress(db, next)
  }, [db])

  const recordPosition = useCallback(async (watchedSec: number, totalSec: number, meta?: { title?: string, route?: string }) => {
    const wasComplete = state.p?.completed ?? false
    const shouldComplete = wasComplete || (totalSec > 0 && watchedSec / totalSec >= WATCHED_THRESHOLD)
    const next: TipProgress = {
      key,
      courseId,
      videoId,
      watchedSec,
      totalSec,
      completed: shouldComplete,
      completedAt: shouldComplete ? (state.p?.completedAt ?? new Date().toISOString()) : null,
      lastSeenAt: new Date().toISOString(),
      title: meta?.title ?? state.p?.title,
      resumeRoute: meta?.route ?? state.p?.resumeRoute,
    }
    await writeState(next)
  }, [state.p, key, courseId, videoId, writeState])

  const markComplete = useCallback(async () => {
    const next: TipProgress = {
      key,
      courseId,
      videoId,
      watchedSec: state.p?.watchedSec ?? 0,
      totalSec: state.p?.totalSec ?? 0,
      completed: true,
      completedAt: state.p?.completedAt ?? new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
      title: state.p?.title,
      resumeRoute: state.p?.resumeRoute,
    }
    await writeState(next)
  }, [state.p, key, courseId, videoId, writeState])

  const markIncomplete = useCallback(async () => {
    const next: TipProgress = {
      key,
      courseId,
      videoId,
      watchedSec: state.p?.watchedSec ?? 0,
      totalSec: state.p?.totalSec ?? 0,
      completed: false,
      completedAt: null,
      lastSeenAt: new Date().toISOString(),
      title: state.p?.title,
      resumeRoute: state.p?.resumeRoute,
    }
    await writeState(next)
  }, [state.p, key, courseId, videoId, writeState])

  return {
    loaded: state.loaded,
    watchedSec: state.p?.watchedSec ?? 0,
    totalSec: state.p?.totalSec ?? 0,
    completed: state.p?.completed ?? false,
    recordPosition,
    markComplete,
    markIncomplete,
  }
}
