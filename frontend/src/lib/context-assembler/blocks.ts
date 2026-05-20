import type { SurfaceContext } from './types'
import { buildGlobalSystemPrompt, buildSystemPrompt } from '@/lib/agent-system-prompt'
import { buildTipSystemPrompt } from '@/lib/tipChatPrompt'

function appendSummary(prompt: string, summary?: string): string {
  if (!summary)
    return prompt
  return `${prompt}\n\n## Conversation Summary\n<conversation_summary>\n${summary}\n</conversation_summary>`
}

function appendRecovery(prompt: string, exhausted?: boolean): string {
  if (!exhausted)
    return prompt
  return `${prompt}\n\n## Tool Round Limit Reached\nYou have used your tool calls for this turn. Respond to the user directly without further tool calls.`
}

function prefixRoleplay(prompt: string, roleplay?: string): string {
  if (!roleplay)
    return prompt
  return `${roleplay}\n\n---\n\n${prompt}`
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
  out = appendSummary(out, ctx.compactedSummary)
  out = appendRecovery(out, ctx.lesson.exhausted)
  out = prefixRoleplay(out, ctx.roleplaySystemPrompt)
  return out
}

export function buildGlobalPrompt(ctx: SurfaceContext): string {
  const base = buildGlobalSystemPrompt(ctx.profile ?? undefined, ctx.memories, ctx.currentTime)
  return appendSummary(base, ctx.compactedSummary)
}

export function buildTipPrompt(ctx: SurfaceContext): string {
  if (!ctx.tip)
    throw new Error('tip context required')
  const base = buildTipSystemPrompt({
    lessonTitle: ctx.tip.lessonTitle,
    transcript: ctx.tip.transcript,
    uiLanguage: ctx.tip.uiLanguage,
    mode: ctx.tip.mode,
  })
  return appendSummary(base, ctx.compactedSummary)
}
