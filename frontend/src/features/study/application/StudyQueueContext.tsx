import type { ReactNode } from 'react'
import type { StudyQueueState } from '@/features/study/application/useStudyQueue'
import { createContext, use } from 'react'
import { useAuth } from '@/app/providers/AuthContext'
import { useLessons } from '@/features/lesson/application/LessonsContext'
import { useStudyQueue } from '@/features/study/application/useStudyQueue'

const StudyQueueContext = createContext<StudyQueueState | null>(null)

export function StudyQueueProvider({ children }: { children: ReactNode }) {
  const { db, keys } = useAuth()
  const { lessons } = useLessons()
  const hasLesson = lessons.some(l => !l.status || l.status === 'complete')
  const queue = useStudyQueue(db, keys, hasLesson)
  return (
    <StudyQueueContext value={queue}>
      {children}
    </StudyQueueContext>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useStudyQueueContext(): StudyQueueState {
  const ctx = use(StudyQueueContext)
  if (!ctx)
    throw new Error('useStudyQueueContext must be used within StudyQueueProvider')
  return ctx
}
