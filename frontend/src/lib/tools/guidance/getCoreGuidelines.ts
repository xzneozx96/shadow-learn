import { z } from 'zod'
import { executeGetCoreGuidelines } from '@/lib/agent-tools'
import { buildTool } from '@/lib/tools/types'

export const getCoreGuidelinesTool = buildTool({
  name: 'get_core_guidelines',
  description: 'Fetches teaching principles, feedback templates, and session protocols. Call at the start of each session.',
  inputSchema: z.object({}),
  isDeferred: () => true,
  searchHint: 'core guidelines teaching principles session protocol',
  execute: async () => executeGetCoreGuidelines(),
})
