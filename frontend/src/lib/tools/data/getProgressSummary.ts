import type { ShadowLearnDB } from '@/db'
import { z } from 'zod'
import { getProgressStats } from '@/db'
import { buildTool } from '@/lib/tools/types'

export async function executeGetProgressSummary(db: ShadowLearnDB) {
  const stats = await getProgressStats(db)
  if (!stats)
    return { message: 'No progress data yet.' }
  return {
    accuracyRate: stats.accuracyRate,
    totalSessions: stats.totalSessions,
    totalExercises: stats.totalExercises,
    totalCorrect: stats.totalCorrect,
    totalStudyMinutes: stats.totalStudyMinutes,
    accuracyTrend: stats.accuracyTrend.slice(-7),
    skillProgress: stats.skillProgress,
  }
}

export const getProgressSummaryTool = buildTool({
  name: 'get_progress_summary',
  description: 'Get overall learning progress statistics: accuracy trend over time, per-skill score breakdown, and total session count. Call this when the user asks about their history, progress, or wants to see a stats overview. Do NOT use this to decide what to study next — use get_study_context for that. Returns aggregate stats suitable for display in a chart or summary.',
  inputSchema: z.object({}),
  isConcurrencySafe: () => true,
  isReadOnly: () => true,
  isDeferred: () => true,
  maxResultSizeChars: 10_000,
  searchHint: 'progress stats accuracy history trends',
  execute: async (_input, context) => executeGetProgressSummary(context.idb),
})
