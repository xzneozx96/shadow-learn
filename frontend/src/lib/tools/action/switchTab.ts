import { z } from 'zod'
import { buildTool } from '@/lib/tools/types'

export const switchTabTool = buildTool({
  name: 'switch_tab',
  description: 'Switch the lesson panel to a different tab. Call when the user\'s request is best served by a different view. Do not switch tabs without a clear reason — only when the destination tab directly serves the user\'s current intent.',
  inputSchema: z.object({ tab: z.enum(['transcript', 'workbook', 'study', 'companion']) }),
  execute: async (input, context) => {
    context.agentActions.dispatch({ type: 'switch_tab', payload: input })
    return { ok: true }
  },
})
