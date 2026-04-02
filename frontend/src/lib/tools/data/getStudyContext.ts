import { z } from 'zod'
import { executeGetStudyContext } from '@/lib/agent-tools'
import { buildTool } from '@/lib/tools/types'

export const getStudyContextTool = buildTool({
  name: 'get_study_context',
  description: 'Get composite study context for deciding what to practice next: due spaced-repetition items, recent mistake patterns, per-skill mastery scores, and current session stats. Call this before suggesting or launching any exercise. Do NOT call this for charts or historical trends — use get_progress_summary for that. Returns an object with dueItems, recentMistakes, masteryScores, and sessionStats.',
  inputSchema: z.object({
    lessonId: z.string().describe('Current lesson ID (optional — omit when calling from the global companion)').optional(),
  }),
  isConcurrencySafe: () => true,
  isReadOnly: () => true,
  maxResultSizeChars: 10_000,
  searchHint: 'study context due items mistakes mastery',
  execute: async (input, context) => executeGetStudyContext(context.idb, input),
})
