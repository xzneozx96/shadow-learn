import type { ShadowLearnDB } from '@/db'
import type { LessonMeta } from '@/types'
import { useCallback, useEffect, useRef } from 'react'
import { saveSegments, saveVideo } from '@/db'

interface UseJobPollerProps {
  lessons: LessonMeta[]
  db: ShadowLearnDB | null
  updateLesson: (meta: LessonMeta) => Promise<void>
}

export function useJobPoller({ lessons, db, updateLesson }: UseJobPollerProps): void {
  // Stable ref so pollJobs can read latest lessons without being in its dep array
  const lessonsRef = useRef(lessons)
  useEffect(() => {
    lessonsRef.current = lessons
  }, [lessons])

  // Primitive string dep: restart interval only when the set of active job IDs changes
  const processingJobIds = lessons
    .filter(l => l.status === 'processing')
    .map(l => l.jobId ?? '')
    .join(',')

  const pollJobs = useCallback(async () => {
    if (!db)
      return
    const processing = lessonsRef.current.filter(l => l.status === 'processing')
    for (const lesson of processing) {
      if (!lesson.jobId)
        continue
      let res: Response
      try {
        res = await fetch(`/api/jobs/${lesson.jobId}`)
      }
      catch {
        continue // network error — retry on next tick
      }

      if (res.status === 404) {
        await updateLesson({
          ...lesson,
          status: 'error',
          errorMessage: 'Server restarted',
          jobId: undefined,
          currentStep: undefined,
        })
        continue
      }

      if (res.status < 200 || res.status >= 300)
        continue // transient server error — retry on next tick

      const job = await res.json()

      if (job.status === 'processing') {
        await updateLesson({ ...lesson, currentStep: job.step })
      }
      else if (job.status === 'complete') {
        const jobId = lesson.jobId
        // job.result has the nested shape { lesson: {...}, video_url? } —
        // matches the backend _shared_pipeline result dict.
        const { lesson: resultLesson, video_url } = job.result
        await saveSegments(db, lesson.id, resultLesson.segments)
        if (lesson.source === 'youtube' && video_url) {
          try {
            const videoBlob = await fetch(video_url).then(r => r.blob())
            await saveVideo(db, lesson.id, videoBlob)
          }
          catch {
            // Video fetch failed (network error, server restart, etc.).
            // Continue completing the lesson without a local video — the player will
            // fall back to the YouTube thumbnail + audio layout.
          }
        }
        await updateLesson({
          ...lesson,
          title: resultLesson.title,
          status: 'complete',
          jobId: undefined,
          currentStep: undefined,
          duration: resultLesson.duration,
          segmentCount: resultLesson.segments.length,
        })
        await fetch(`/api/jobs/${jobId}`, { method: 'DELETE' })
      }
      else if (job.status === 'error') {
        const jobId = lesson.jobId
        await updateLesson({
          ...lesson,
          status: 'error',
          errorMessage: job.error,
          jobId: undefined,
          currentStep: undefined,
        })
        await fetch(`/api/jobs/${jobId}`, { method: 'DELETE' })
      }
    }
  }, [db, updateLesson])

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!processingJobIds)
      return
    intervalRef.current = setInterval(pollJobs, 3000)
    return () => {
      if (intervalRef.current)
        clearInterval(intervalRef.current)
    }
  }, [processingJobIds, pollJobs])
}
