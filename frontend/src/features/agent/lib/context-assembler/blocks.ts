import type { SurfaceContext } from './types'
import { buildGlobalSystemPrompt, buildSystemPrompt } from '@/features/agent/lib/agent-system-prompt'
import { guidedLearningOverlay, toolExhaustionOverlay } from '@/features/agent/lib/prompt/sections'
import { buildTipSystemPrompt } from '@/features/agent/lib/tipChatPrompt'

function appendRecovery(prompt: string, exhausted?: boolean): string {
  if (!exhausted)
    return prompt
  return `${prompt}\n\n${toolExhaustionOverlay()}`
}

function prefixRoleplay(prompt: string, roleplay?: string): string {
  if (!roleplay)
    return prompt
  return `${roleplay}\n\n---\n\n${prompt}`
}

function prefixGuided(prompt: string, mode?: string): string {
  if (mode !== 'guided')
    return prompt
  return `${guidedLearningOverlay()}\n\n---\n\n${prompt}`
}

export function buildLessonPrompt(ctx: SurfaceContext): string {
  if (!ctx.lesson)
    throw new Error('lesson context required')
  const base = buildSystemPrompt({
    profile: ctx.profile ?? undefined,
    memories: ctx.memories,
    lessonTitle: ctx.lesson.lessonTitle,
    lessonId: ctx.lesson.lessonId,
    activeSegment: ctx.lesson.activeSegment ?? null,
    sourceLanguage: ctx.lesson.sourceLanguage,
    translationLanguage: ctx.lesson.translationLanguage,
    currentTime: ctx.currentTime,
    appState: ctx.lesson.appState,
    accuracy: ctx.lesson.accuracy,
    deferredToolNames: ctx.lesson.deferredToolNames,
  })
  let out = base
  out = appendRecovery(out, ctx.lesson.exhausted)
  out = prefixGuided(out, ctx.lesson.mode)
  out = prefixRoleplay(out, ctx.roleplaySystemPrompt)
  return out
}

export function buildGlobalPrompt(ctx: SurfaceContext): string {
  return buildGlobalSystemPrompt(ctx.profile ?? undefined, ctx.memories, ctx.currentTime)
}

export function buildTipPrompt(ctx: SurfaceContext): string {
  if (!ctx.tip)
    throw new Error('tip context required')
  return buildTipSystemPrompt({
    lessonTitle: ctx.tip.lessonTitle,
    transcript: ctx.tip.transcript,
    uiLanguage: ctx.tip.uiLanguage,
    mode: ctx.tip.mode,
  })
}
