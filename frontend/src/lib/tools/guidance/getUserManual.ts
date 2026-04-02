import { z } from 'zod'
import { executeGetUserManual } from '@/lib/agent-tools'
import { buildTool } from '@/lib/tools/types'

// This tool exists in agent-tools.ts but was MISSING from the switch statement in
// useAgentChat.ts — it silently returned { error: "Unknown tool" }. The registry
// pattern fixes this bug automatically.
export const getUserManualTool = buildTool({
  name: 'get_user_manual',
  description: 'Fetches the ShadowLearn app user manual. Call only when the user asks how to use the app itself — not for language learning questions.',
  inputSchema: z.object({}),
  searchHint: 'user manual help guide app features',
  execute: async () => executeGetUserManual(),
})
