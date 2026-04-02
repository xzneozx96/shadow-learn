import { z } from 'zod'
import { buildTool } from '@/lib/tools/types'

export const startShadowingTool = buildTool({
  name: 'start_shadowing',
  description: 'Launches the shadowing mode for listen→speak→reveal practice.',
  inputSchema: z.object({}),
  execute: async (input, context) => {
    context.agentActions.dispatch({ type: 'start_shadowing', payload: input })
    return { ok: true }
  },
})
