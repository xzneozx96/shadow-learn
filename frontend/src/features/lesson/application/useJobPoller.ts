import type { LessonMeta } from '@/shared/types'
import { useCallback, useEffect, useRef } from 'react'
import { apiFetch } from '@/shared/lib/api'
import { captureLessonJobFailed } from '@/shared/lib/posthog-events'

interface UseJobPollerProps {
  lessons: LessonMeta[]
  savePendingLesson: (meta: LessonMeta) => void
  completeLesson: (id: string) => Promise<void>
}

export function useJobPoller({ lessons, savePendingLesson, completeLesson }: UseJobPollerProps): void {
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
    const processing = lessonsRef.current.filter(l => l.status === 'processing')
    for (const lesson of processing) {
      if (!lesson.jobId)
        continue
      let res: Response
      try {
        res = await apiFetch(`/api/jobs/${lesson.jobId}`)
      }
      catch {
        continue // network error — retry on next tick
      }

      if (res.status === 404) {
        savePendingLesson({
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
        savePendingLesson({ ...lesson, currentStep: job.step })
      }
      else if (job.status === 'complete') {
        const jobId = lesson.jobId
        await completeLesson(lesson.id)
        await apiFetch(`/api/jobs/${jobId}`, { method: 'DELETE' })
      }
      else if (job.status === 'error') {
        const jobId = lesson.jobId
        captureLessonJobFailed({ step: job.step ?? 'unknown', error_message: job.error ?? 'Unknown error' })
        savePendingLesson({
          ...lesson,
          status: 'error',
          errorMessage: job.error,
          jobId: undefined,
          currentStep: undefined,
        })
        await apiFetch(`/api/jobs/${jobId}`, { method: 'DELETE' })
      }
    }
  }, [savePendingLesson, completeLesson])

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!processingJobIds)
      return
    intervalRef.current = setInterval(pollJobs, 10000)
    return () => {
      if (intervalRef.current)
        clearInterval(intervalRef.current)
    }
  }, [processingJobIds, pollJobs])
}
