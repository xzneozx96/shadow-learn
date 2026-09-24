import type { DataClient } from '@/db'
import { z } from 'zod'
import {
  getAllExerciseStats,
  getMasteryData,
  getProgressStats,
  getRecentMistakes,
  getVocabEntriesByLesson,
} from '@/db'
import { buildTool } from '@/features/agent/lib/tools/types'
import { getEffectiveDueItems } from '@/shared/lib/skillSessionProgress'

export async function executeGetStudyContext(
  db: DataClient,
  args: { lessonId?: string },
) {
  const [dueItems, recentMistakes, masteryScores, progressStats] = await Promise.all([
    getEffectiveDueItems(db),
    getRecentMistakes(db, 5),
    getMasteryData(db),
    getProgressStats(db),
  ])

  const lessonVocab = args.lessonId ? await getVocabEntriesByLesson(db, args.lessonId) : []

  const weakItems = (await getAllExerciseStats(db))
    .filter(stat => stat.total >= 3)
    .sort((a, b) => (a.correct / a.total) - (b.correct / b.total))
    .slice(0, 5)
    .map(stat => ({ key: `${stat.vocabId}:${stat.exerciseType}`, accuracy: stat.correct / stat.total, total: stat.total }))

  return {
    dueItems: dueItems.slice(0, 10).map(i => ({
      itemId: i.itemId,
      dueDate: i.dueDate,
      masteryLevel: i.masteryLevel,
      repetitions: i.repetitions,
    })),
    recentMistakes: recentMistakes.map(m => ({
      patternId: m.patternId,
      frequency: m.frequency,
      lastOccurred: m.lastOccurred,
    })),
    masteryScores: masteryScores ?? null,
    sessionStats: progressStats
      ? {
          totalSessions: progressStats.totalSessions,
          accuracyRate: progressStats.accuracyRate,
          totalExercises: progressStats.totalExercises,
        }
      : null,
    lessonVocabCount: lessonVocab.length,
    weakItems,
  }
}

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
