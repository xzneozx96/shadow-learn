import { z } from 'zod'
import { executeUpdateSrItem } from '@/lib/agent-tools'
import { buildTool } from '@/lib/tools/types'

export const updateSrItemTool = buildTool({
  name: 'update_sr_item',
  description: 'Update a spaced repetition item\'s schedule after an exercise result. Call this after every exercise where the user\'s performance is known. The itemId must be the id field from SR items returned by get_study_context or get_vocabulary — do not guess or construct IDs.',
  inputSchema: z.object({
    itemId: z.string().describe('Spaced repetition item ID'),
    result: z.enum(['correct', 'incorrect', 'partial']).describe('Exercise result'),
  }),
  execute: async (input, context) => executeUpdateSrItem(context.idb, input),
})
