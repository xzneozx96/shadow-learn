import { z } from 'zod'
import { executeRecallMemory } from '@/lib/agent-tools'
import { buildTool } from '@/lib/tools/types'

export const recallMemoryTool = buildTool({
  name: 'recall_memory',
  description: 'Searches long-term memories saved from previous sessions. Use when the user references past preferences, struggles, or goals.',
  inputSchema: z.object({
    query: z.string(),
    tags: z.array(z.string()).optional(),
  }),
  isConcurrencySafe: () => true,
  isReadOnly: () => true,
  maxResultSizeChars: 3000,
  searchHint: 'memory recall search past preferences',
  execute: async (input, context) => executeRecallMemory(context.idb, input),
})
