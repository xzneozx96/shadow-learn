import type { AgentMemory, LearnerProfile, ProgressStats } from '@/db'
import type { PromptSurface } from '@/features/agent/lib/prompt/sections'
import type { Segment } from '@/shared/types'
import {
  compose,
  currentDateBlock,
  currentLessonBlock,
  deferredToolsBlock,
  globalOnboardingBlock,
  instructionsBlock,
  learnerProfileBlock,
  lessonOnboardingBlock,
  memoryBlock,
  roleBlock,
  sessionSnapshotBlock,
} from '@/features/agent/lib/prompt/sections'

export interface SessionContext {
  profile?: LearnerProfile | null
  lessonTitle?: string
  lessonId?: string
  activeSegment?: Segment | null
  memories?: AgentMemory[]
  sourceLanguage?: string
  translationLanguage?: string
  currentTime?: string
  appState?: {
    currentTab: string
    sessionDurationMinutes: number
    exercisesThisSession: number
    recentMistakeWords: string[]
    vocabularyDueCount: number
  }
  accuracy?: Record<string, { accuracy: number, attempts: number }>
  deferredToolNames?: string[]
}

// Role + instructions are static per surface → cached as the prefix that prompt
// caching keys on. Dynamic learner data is appended after, never inside, this.
const _staticCache = new Map<PromptSurface, string>()

export function clearSystemPromptCache(): void {
  _staticCache.clear()
}

function staticSections(surface: PromptSurface): string {
  let cached = _staticCache.get(surface)
  if (!cached) {
    cached = compose([roleBlock(surface), instructionsBlock(surface)])
    _staticCache.set(surface, cached)
  }
  return cached
}

function lessonDynamicSections(context: SessionContext): string {
  const {
    profile,
    lessonTitle,
    lessonId,
    activeSegment,
    memories = [],
    sourceLanguage,
    translationLanguage,
    appState,
    accuracy,
  } = context

  const onboardingOrProfile = profile
    ? learnerProfileBlock(profile, 'lesson')
    : lessonOnboardingBlock({
        targetLanguage: sourceLanguage,
        nativeLanguage: translationLanguage,
      })

  return compose([
    currentDateBlock(context.currentTime),
    onboardingOrProfile,
    currentLessonBlock({ lessonId, lessonTitle, activeSegment }),
    memoryBlock(memories, 3),
    sessionSnapshotBlock(appState, accuracy),
    deferredToolsBlock(context.deferredToolNames),
  ])
}

/**
 * Build the system prompt for the agentic AI tutor.
 * Pure function — static prefix (role + instructions) is memoised; dynamic
 * learner context is rebuilt each call and appended after the `---` divider.
 */
export function buildSystemPrompt(context: SessionContext): string {
  return `${staticSections('lesson')}\n\n---\n\n${lessonDynamicSections(context)}`
}

/**
 * Build the system prompt for the global AI companion.
 * App-guide persona — no lesson/segment context, no exercise instructions.
 */
export function buildGlobalSystemPrompt(
  profile: LearnerProfile | undefined,
  memories: AgentMemory[],
  currentTime?: string,
): string {
  const dynamic = compose([
    currentDateBlock(currentTime),
    profile ? learnerProfileBlock(profile, 'global') : globalOnboardingBlock(),
    memoryBlock(memories, 5),
  ])
  return `${staticSections('global')}\n\n---\n\n${dynamic}`
}

/**
 * Build a compact summary string for progress stats, used by tools or prompt.
 */
export function formatProgressSummary(stats: ProgressStats): string {
  return [
    `Accuracy: ${Math.round(stats.accuracyRate * 100)}%`,
    `Sessions: ${stats.totalSessions}`,
    `Exercises: ${stats.totalExercises} (${stats.totalCorrect} correct)`,
    `Study time: ${stats.totalStudyMinutes}min`,
  ].join('. ')
}
