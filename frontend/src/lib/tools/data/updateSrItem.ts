import { z } from 'zod'
import { executeUpdateSrItem } from '@/lib/agent-tools'
import { buildTool } from '@/lib/tools/types'

export const updateSrItemTool = buildTool({
  name: 'update_sr_item',
  description: 'Records the result of a vocabulary exercise and updates the spaced-repetition schedule for that item.',
  inputSchema: z.object({
    itemId: z.string(),
    result: z.enum(['correct', 'incorrect', 'partial']),
  }),
  execute: async (input, context) => executeUpdateSrItem(context.idb, input),
})
