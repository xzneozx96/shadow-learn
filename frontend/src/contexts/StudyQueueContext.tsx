import type { ReactNode } from 'react'
import type { StudyQueueState } from '../hooks/useStudyQueue'
import { createContext, use } from 'react'
import { useStudyQueue } from '../hooks/useStudyQueue'
import { useAuth } from './AuthContext'

const StudyQueueContext = createContext<StudyQueueState | null>(null)

export function StudyQueueProvider({ children }: { children: ReactNode }) {
  const { db, keys } = useAuth()
  const queue = useStudyQueue(db, keys)
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
