import { z } from 'zod'
import { executeLogMistake } from '@/lib/agent-tools'
import { buildTool } from '@/lib/tools/types'

export const logMistakeTool = buildTool({
  name: 'log_mistake',
  description: 'Records an error pattern for a specific word to inform future practice prioritisation.',
  inputSchema: z.object({
    word: z.string(),
    context: z.string(),
    errorType: z.string(),
  }),
  execute: async (input, context) => executeLogMistake(context.idb, input),
})
