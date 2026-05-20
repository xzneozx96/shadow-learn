import type { ContextChip } from '@/components/chat/ContextChipBar'
import type { AgentMemory, LearnerProfile, ThreadSurface } from '@/db'
import type { ChatUiLanguage, TipChatMode } from '@/lib/tipChatPrompt'
import type { Segment } from '@/types'

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
}
