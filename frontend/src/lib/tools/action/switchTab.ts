import { z } from 'zod'
import { buildTool } from '@/lib/tools/types'

export const switchTabTool = buildTool({
  name: 'switch_tab',
  description: 'Switches the lesson panel to a different tab (transcript, workbook, companion).',
  inputSchema: z.object({ tab: z.string() }),
  execute: async (input, context) => {
    context.agentActions.dispatch({ type: 'switch_tab', payload: input })
    return { ok: true }
  },
})
