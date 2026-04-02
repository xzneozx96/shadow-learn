import { z } from 'zod'
import { executeSaveMemory } from '@/lib/agent-tools'
import { buildTool } from '@/lib/tools/types'

export const saveMemoryTool = buildTool({
  name: 'save_memory',
  description: 'Save an important observation about the user to long-term memory for recall in future sessions. Call this when you learn something durable and worth remembering: a learning goal, a known difficulty, a preference, or a significant milestone. Do not save transient facts or exercise results — use update_sr_item and log_mistake for those. The content should be a self-contained plain-text sentence that will be meaningful when read in isolation later.',
  inputSchema: z.object({
    content: z.string().describe('Plain text fact to remember'),
    tags: z.array(z.string()).describe('Keyword tags'),
    importance: z.number().int().min(1).max(3).describe('1=low, 2=medium, 3=high'),
  }),
  execute: async (input, context) => executeSaveMemory(
    context.idb,
    input as { content: string, tags?: string[], importance?: 1 | 2 | 3 },
    context.lessonId ?? undefined,
  ),
})
