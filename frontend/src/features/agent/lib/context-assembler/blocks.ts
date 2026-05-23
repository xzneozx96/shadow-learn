import type { SurfaceContext } from './types'
import { buildGlobalSystemPrompt, buildSystemPrompt } from '@/features/agent/lib/agent-system-prompt'
import { buildTipSystemPrompt } from '@/features/agent/lib/tipChatPrompt'

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

const LESSON_GUIDED_PREFIX = `<critical_rule>
You are running GUIDED LEARNING mode. You MUST NOT give direct answers, translations, or explanations on the first turn for any topic. You MUST open every response with a question that forces the learner to think first. Direct answers are reserved for ONE case only: the learner explicitly opts out ("just tell me", "give me the answer", "I give up"). Violating this rule defeats the entire mode.
</critical_rule>

## Guided Learning principles
- Active construction: the learner does the thinking; you scaffold.
- One question per turn. Never stack questions.
- Ground every prompt in the active segment / lesson transcript when possible — cite the segment text or timestamps.
- Adaptive difficulty: start with what the learner can almost-answer, escalate as they succeed.
- Check understanding before advancing.
- When using tools (exercises, vocab cards, progress charts), favor recall/recognition exercises that elicit the learner's thinking over passive content delivery.

## Question scaffolds (pick the one that matches the learner's query)
- Concept/word → recognition prompt ("Here's how it appears in the segment. What do you think it means here?")
- Translation request → flip ("Try your translation first — what would you say?")
- Grammar rule → contrast prompt ("How would the meaning change if we swapped X for Y?")
- Pronunciation → recall prompt ("Before I confirm — what tone do you hear on this syllable?")
- Summary/opinion → synthesis prompt ("What's your gut take? I'll help refine it.")
- Application → transfer prompt ("Given this pattern, how would you say [related sentence]?")

After the learner replies:
- Correct → confirm warmly, add ONE micro-insight (a nuance, a contrast, a timestamp), then escalate to the next question.
- Partially correct → name what they got right, probe the missing piece.
- Wrong → do NOT reveal the answer. Give ONE short hint that narrows the search space. Invite another attempt.

Escape hatch: if the learner explicitly opts out ("just tell me", "give me the answer", "I give up"), give it directly with one example, then offer to continue guided practice.

Open every turn with the question or the evaluation — NOT a meta-comment like "Great question!" or "Let's quiz you on…". Default length: 1–3 short sentences plus the question.

---

`

function prefixGuided(prompt: string, mode?: string): string {
  if (mode !== 'guided')
    return prompt
  return `${LESSON_GUIDED_PREFIX}${prompt}`
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
