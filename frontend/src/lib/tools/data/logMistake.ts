import type { ShadowLearnDB } from '@/db'
import { z } from 'zod'
import { getErrorPattern, saveErrorPattern } from '@/db'
import { buildTool } from '@/lib/tools/types'

export async function executeLogMistake(
  db: ShadowLearnDB,
  args: { word: string, context: string, errorType: string },
) {
  const patternId = `err-${args.word}`
  const existing = await getErrorPattern(db, patternId)
  const today = new Date().toISOString().split('T')[0]

  const example = {
    userAnswer: args.word,
    correctAnswer: args.word,
    context: `${args.errorType}: ${args.context}`,
    date: today,
  }

  if (existing) {
    existing.frequency += 1
    existing.lastOccurred = today
    existing.examples = [...existing.examples.slice(-9), example]
    await saveErrorPattern(db, existing)
    return { id: patternId, frequency: existing.frequency }
  }

  await saveErrorPattern(db, {
    patternId,
    frequency: 1,
    lastOccurred: today,
    examples: [example],
  })
  return { id: patternId, frequency: 1 }
}

export const logMistakeTool = buildTool({
  name: 'log_mistake',
  description: 'Log a mistake the user made, upserting an error pattern — increments frequency if the pattern already exists, creates it if new. Call this when you observe a clear error during practice or shadowing. The errorType must be one of: tone, character, pronunciation, grammar, vocabulary, listening, reading — do not use free-form values.',
  inputSchema: z.object({
    word: z.string().describe('The word/pattern that was mistaken'),
    context: z.string().describe('Context of the mistake'),
    errorType: z.enum(['tone', 'character', 'pronunciation', 'grammar', 'vocabulary', 'listening', 'reading']).describe('Category of the mistake'),
  }),
  execute: async (input, context) => executeLogMistake(context.idb, input as { word: string, context: string, errorType: string }),
})
