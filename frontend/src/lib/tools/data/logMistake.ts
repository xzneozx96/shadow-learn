import { z } from 'zod'
import { executeLogMistake } from '@/lib/agent-tools'
import { buildTool } from '@/lib/tools/types'

export const logMistakeTool = buildTool({
  name: 'log_mistake',
  description: 'Log a mistake the user made, upserting an error pattern — increments frequency if the pattern already exists, creates it if new. Call this when you observe a clear error during practice or shadowing. The errorType must be one of: tone, character, pronunciation, grammar, vocabulary, listening, reading — do not use free-form values.',
  inputSchema: z.object({
    word: z.string().describe('The word/pattern that was mistaken'),
    context: z.string().describe('Context of the mistake'),
    errorType: z.enum(['tone', 'character', 'pronunciation', 'grammar', 'vocabulary', 'listening', 'reading']).describe('Category of the mistake'),
  }),
  execute: async (input, context) => executeLogMistake(context.idb, input),
})
