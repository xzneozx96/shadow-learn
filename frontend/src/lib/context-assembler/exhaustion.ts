import type { UIMessage } from '@ai-sdk/react'

export interface ExhaustionResult {
  exhausted: boolean
  sameToolLoop: boolean
  roundsSinceUser: number
}

/** Stable JSON.stringify with sorted keys at all depths. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object')
    return JSON.stringify(value)
  if (Array.isArray(value))
    return `[${value.map(stableStringify).join(',')}]`
  const keys = Object.keys(value as Record<string, unknown>).sort()
  return `{${keys.map(k => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`).join(',')}}`
}

interface ToolPartShape {
  type: string
  toolName?: string
  input?: unknown
  args?: unknown
}

function toolFingerprint(part: ToolPartShape): string {
  const name = part.toolName ?? part.type.slice('tool-'.length)
  const args = part.input ?? part.args ?? {}
  return `${name}::${stableStringify(args)}`
}

/**
 * Split an assistant message's parts into rounds.
 * Each `step-start` part begins a new round. Within a round, collect tool fingerprints.
 * Tool parts BEFORE the first step-start (or in a message with NO step-start) form one
 * implicit round (for backward-compat with pre-v6-stitching message shapes).
 */
function extractRoundsFromMessage(msg: UIMessage): string[][] {
  const parts = ((msg as any).parts ?? []) as ToolPartShape[]
  const rounds: string[][] = []
  let current: string[] = []
  let sawStepStart = false
  let hasAnyToolPart = false

  for (const p of parts) {
    if (p.type === 'step-start') {
      if (sawStepStart && current.length > 0) {
        rounds.push(current)
      }
      else if (!sawStepStart && current.length > 0) {
        // Pre-first-step-start tool parts (rare/illegal in v6, but defensive)
        rounds.push(current)
      }
      sawStepStart = true
      current = []
    }
    else if (typeof p.type === 'string' && p.type.startsWith('tool-')) {
      hasAnyToolPart = true
      current.push(toolFingerprint(p))
    }
  }
  // Close out final pending round
  if (sawStepStart && current.length > 0) {
    rounds.push(current)
  }
  else if (!sawStepStart && hasAnyToolPart) {
    // Legacy shape: no step-start markers, treat the whole message as 1 round
    rounds.push(current)
  }
  return rounds
}

export function computeLessonExhaustion(
  messages: UIMessage[],
  opts: { maxRounds: number },
): ExhaustionResult {
  let lastUserIdx = -1
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      lastUserIdx = i
      break
    }
  }
  if (lastUserIdx < 0) {
    return { exhausted: false, sameToolLoop: false, roundsSinceUser: 0 }
  }

  const allRoundKeys: string[] = []
  for (let i = lastUserIdx + 1; i < messages.length; i++) {
    const m = messages[i]
    if (m.role !== 'assistant')
      continue
    const rounds = extractRoundsFromMessage(m)
    for (const toolFps of rounds) {
      // Empty rounds (text-only steps) are skipped — only tool-emitting rounds count toward budget
      if (toolFps.length === 0)
        continue
      allRoundKeys.push(toolFps.slice().sort().join(','))
    }
  }

  const roundsSinceUser = allRoundKeys.length
  const overBudget = roundsSinceUser >= opts.maxRounds
  const sameToolLoop
    = allRoundKeys.length >= 2
      && allRoundKeys.at(-1) === allRoundKeys.at(-2)

  return {
    exhausted: overBudget || sameToolLoop,
    sameToolLoop,
    roundsSinceUser,
  }
}
