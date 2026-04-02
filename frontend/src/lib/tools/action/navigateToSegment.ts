import { z } from 'zod'
import { buildTool } from '@/lib/tools/types'

export const navigateToSegmentTool = buildTool({
  name: 'navigate_to_segment',
  description: 'Seeks the video player to a specific segment by index or ID.',
  inputSchema: z.object({ segmentIndex: z.number().optional(), segmentId: z.string().optional() }),
  execute: async (input, context) => {
    context.agentActions.dispatch({ type: 'navigate_to_segment', payload: input })
    return { ok: true }
  },
})
