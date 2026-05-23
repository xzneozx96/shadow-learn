import type { AgentMemory, LearnerProfile, ThreadSurface } from '@/db'
import type { ContextChip } from '@/features/agent/domain/contextChip'
import type { ChatUiLanguage, TipChatMode } from '@/features/agent/lib/tipChatPrompt'
import type { Segment } from '@/shared/types'

export type Surface = ThreadSurface

export interface LessonAppState {
  currentTab: string
  sessionDurationMinutes: number
  exercisesThisSession: number
  recentMistakeWords: string[]
  vocabularyDueCount: number
}

export interface LessonContext {
  lessonId: string
  lessonTitle?: string
  activeSegment?: Segment | null
  sourceLanguage?: string
  translationLanguage?: string
  appState: LessonAppState
  accuracy: Record<string, { accuracy: number, attempts: number }>
  deferredToolNames?: string[]
  exhausted?: boolean
  mode?: TipChatMode
}

export interface GlobalContext {
  chips: ContextChip[]
}

export interface TipContext {
  courseId: string
  videoId: string
  lessonTitle: string
  transcript: string
  uiLanguage: ChatUiLanguage
  mode: TipChatMode
}

export interface SurfaceContext {
  surface: Surface
  threadId: string
  profile: LearnerProfile | null
  memories: AgentMemory[]
  currentTime: string
  roleplaySystemPrompt?: string
  lesson?: LessonContext
  global?: GlobalContext
  tip?: TipContext
  compactedSummary?: string
  /** ID of the last message covered by compactedSummary — messages up to this ID can be stripped before sending */
  summaryCoversThroughId?: string
}
