import type { TipSource } from '@/types'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { CourseSidebar } from '@/components/tips/CourseSidebar'
import { LessonPlayer } from '@/components/tips/LessonPlayer'
import { OverviewBlock } from '@/components/tips/OverviewBlock'
import { UtilityPane } from '@/components/tips/UtilityPane'
import { useAuth } from '@/contexts/AuthContext'
import { listTipProgressForCourse } from '@/db'
import { useTipCourse } from '@/hooks/useTipCourse'
import { useTipProgress } from '@/hooks/useTipProgress'
import { useTipTranscript } from '@/hooks/useTipTranscript'

function formatTs(sec: number): string {
  const m = Math.floor(sec / 60).toString().padStart(2, '0')
  const s = Math.floor(sec % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

export function TipCoursePage() {
  const { source, id } = useParams<{ source: TipSource, id: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const safeSource: TipSource = source === 'video' ? 'video' : 'playlist'
  const safeId = id ?? ''
  const { db } = useAuth()

  const { course, lessons, loading, error } = useTipCourse(safeSource, safeId)

  const [completedSet, setCompletedSet] = useState<Set<string>>(() => new Set())
  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!db || !course) {
        if (!cancelled)
          setCompletedSet(new Set())
        return
      }
      const rows = await listTipProgressForCourse(db, course.id)
      if (cancelled)
        return
      setCompletedSet(new Set(rows.filter(r => r.completed).map(r => r.videoId)))
    }
    void load()
    return () => { cancelled = true }
  }, [db, course])

  const lessonParam = searchParams.get('lesson')
  const activeVideoId = useMemo(() => {
    if (lessonParam && lessons.some(l => l.videoId === lessonParam))
      return lessonParam
    const firstUnwatched = lessons.find(l => !completedSet.has(l.videoId))
    return firstUnwatched?.videoId ?? lessons[0]?.videoId ?? ''
  }, [lessonParam, lessons, completedSet])

  const activeLesson = lessons.find(l => l.videoId === activeVideoId)
  const courseId = course?.id ?? ''
  const transcript = useTipTranscript(activeVideoId)
  const progress = useTipProgress(courseId, activeVideoId)

  // After a recordPosition flips completion, refresh the local completedSet so the
  // sidebar checkmark appears without a remount.
  useEffect(() => {
    if (progress.completed && activeVideoId) {
      // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect
      setCompletedSet((prev) => {
        if (prev.has(activeVideoId))
          return prev
        const next = new Set(prev)
        next.add(activeVideoId)
        return next
      })
    }
  }, [progress.completed, activeVideoId])

  const transcriptText = transcript.segments.map(s => `[${formatTs(s.start)}] ${s.text}`).join('\n')

  const handleSelectLesson = (videoId: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('lesson', videoId)
      return next
    })
  }

  const handleNextLesson = () => {
    const idx = lessons.findIndex(l => l.videoId === activeVideoId)
    const next = lessons[idx + 1]
    if (next)
      handleSelectLesson(next.videoId)
  }

  if (loading) {
    return (
      <Layout>
        <div className="h-full flex items-center justify-center text-muted-foreground">
          Loading course…
        </div>
      </Layout>
    )
  }
  if (error || !course || !activeLesson) {
    return (
      <Layout>
        <div className="h-full flex items-center justify-center text-destructive">
          Course unavailable.
          <button
            type="button"
            className="underline ml-2"
            onClick={() => navigate(-1)}
          >
            Go back
          </button>
        </div>
      </Layout>
    )
  }

  const lessonNumber = lessons.findIndex(l => l.videoId === activeVideoId) + 1
  const hasNext = lessons.findIndex(l => l.videoId === activeVideoId) < lessons.length - 1

  return (
    <Layout>
      <div className="grid h-full grid-cols-[280px_1fr_440px]">
        <CourseSidebar
          courseName={course.name}
          topic={course.topic}
          lessons={lessons}
          activeVideoId={activeVideoId}
          completedVideoIds={completedSet}
          onSelect={handleSelectLesson}
        />
        <main className="flex flex-col overflow-y-auto p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
                Lesson
                {' '}
                {lessonNumber}
                {' '}
                of
                {' '}
                {lessons.length}
              </div>
              <h1 className="text-xl font-bold text-foreground">{activeLesson.title}</h1>
            </div>
            <button
              type="button"
              onClick={handleNextLesson}
              disabled={!hasNext}
              className="border border-primary text-primary hover:bg-primary/10 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 rounded-lg text-xs font-bold transition-colors"
            >
              Next lesson →
            </button>
          </div>
          <LessonPlayer
            key={activeVideoId}
            videoId={activeVideoId}
            resumeSec={progress.watchedSec || undefined}
            onTimeUpdate={(cur, dur) => { void progress.recordPosition(cur, dur) }}
            onEnded={() => { void progress.markComplete() }}
          />
          <OverviewBlock disabled={transcript.status !== 'ready'} />
        </main>
        <UtilityPane
          courseId={course.id}
          videoId={activeVideoId}
          lessonTitle={activeLesson.title}
          transcript={transcriptText}
          transcriptStatus={transcript.status}
          warmingStep={transcript.warming?.step}
        />
      </div>
    </Layout>
  )
}
