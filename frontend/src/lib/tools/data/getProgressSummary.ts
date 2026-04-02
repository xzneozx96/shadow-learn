import { z } from 'zod'
import { executeGetProgressSummary } from '@/lib/agent-tools'
import { buildTool } from '@/lib/tools/types'

export const getProgressSummaryTool = buildTool({
  name: 'get_progress_summary',
  description: 'Returns historical learning statistics and trends: accuracy rates, session counts, study time, and skill-by-skill progress breakdowns.',
  inputSchema: z.object({}),
  isConcurrencySafe: () => true,
  isReadOnly: () => true,
  maxResultSizeChars: 4000,
  searchHint: 'progress stats accuracy history trends',
  execute: async (_input, context) => executeGetProgressSummary(context.idb),
})
