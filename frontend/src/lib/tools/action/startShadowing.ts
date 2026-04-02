import { z } from 'zod'
import { buildTool } from '@/lib/tools/types'

export const startShadowingTool = buildTool({
  name: 'start_shadowing',
  description: 'Launch shadowing mode — a listen-then-speak practice flow where the user listens to each segment, records themselves repeating it, then sees the transcript revealed. Optionally pass segmentIndex to start from a specific line; omit to start from the currently active segment.',
  inputSchema: z.object({ segmentIndex: z.number().describe('Segment index to start from (defaults to active)').optional() }),
  execute: async (input, context) => {
    context.agentActions.dispatch({ type: 'start_shadowing', payload: input })
    return { ok: true }
  },
})
