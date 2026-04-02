import { z } from 'zod'
import { executeGetProgressSummary } from '@/lib/agent-tools'
import { buildTool } from '@/lib/tools/types'

export const getProgressSummaryTool = buildTool({
  name: 'get_progress_summary',
  description: 'Get overall learning progress statistics: accuracy trend over time, per-skill score breakdown, and total session count. Call this when the user asks about their history, progress, or wants to see a stats overview. Do NOT use this to decide what to study next — use get_study_context for that. Returns aggregate stats suitable for display in a chart or summary.',
  inputSchema: z.object({}),
  isConcurrencySafe: () => true,
  isReadOnly: () => true,
  maxResultSizeChars: 10_000,
  searchHint: 'progress stats accuracy history trends',
  execute: async (_input, context) => executeGetProgressSummary(context.idb),
})
