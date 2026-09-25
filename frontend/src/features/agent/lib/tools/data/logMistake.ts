import type { DataClient } from '@/db'
import { z } from 'zod'
import { updateErrorPattern } from '@/db'
import { buildTool } from '@/features/agent/lib/tools/types'

export async function executeLogMistake(
  db: DataClient,
  args: { word: string, context: string, errorType: string },
) {
  const patternId = `err-${args.word}`
  const today = new Date().toISOString().split('T')[0]

  const example = {
    userAnswer: args.word,
    correctAnswer: args.word,
    context: `${args.errorType}: ${args.context}`,
    date: today,
  }

  const saved = await updateErrorPattern(db, patternId, prev => prev
    ? { ...prev, frequency: prev.frequency + 1, lastOccurred: today, examples: [...prev.examples.slice(-9), example] }
    : { patternId, frequency: 1, lastOccurred: today, examples: [example] })
  return { id: patternId, frequency: saved.frequency }
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
