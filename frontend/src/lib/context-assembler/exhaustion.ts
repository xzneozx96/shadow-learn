import type { UIMessage } from '@ai-sdk/react'

export interface ExhaustionResult {
  exhausted: boolean
  sameToolLoop: boolean
  roundsSinceUser: number
}

function extractToolNamesKey(msg: UIMessage): string {
  const parts = (msg as any).parts as Array<{ type: string, toolName?: string }> | undefined
  if (!parts)
    return ''
  return parts
    .filter(p => typeof p.type === 'string' && p.type.startsWith('tool-'))
    .map(p => p.toolName ?? '')
    .sort()
    .join(',')
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

  const toolRoundKeys: string[] = []
  for (let i = lastUserIdx + 1; i < messages.length; i++) {
    const m = messages[i]
    if (m.role !== 'assistant')
      continue
    const key = extractToolNamesKey(m)
    if (key)
      toolRoundKeys.push(key)
  }

  const roundsSinceUser = toolRoundKeys.length
  const overBudget = roundsSinceUser >= opts.maxRounds
  const sameToolLoop
    = toolRoundKeys.length >= 2
      && toolRoundKeys.at(-1) === toolRoundKeys[toolRoundKeys.length - 2]

  return {
    exhausted: overBudget || sameToolLoop,
    sameToolLoop,
    roundsSinceUser,
  }
}
