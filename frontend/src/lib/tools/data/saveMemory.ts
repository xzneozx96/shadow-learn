import { z } from 'zod'
import { executeSaveMemory } from '@/lib/agent-tools'
import { buildTool } from '@/lib/tools/types'

export const saveMemoryTool = buildTool({
  name: 'save_memory',
  description: 'Persists an important observation about the learner to long-term memory for use in future sessions.',
  inputSchema: z.object({
    content: z.string(),
    tags: z.array(z.string()).optional(),
    importance: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  }),
  execute: async (input, context) => executeSaveMemory(context.idb, input, context.lessonId),
})
