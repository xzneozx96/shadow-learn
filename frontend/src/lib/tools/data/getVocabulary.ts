import type { ShadowLearnDB } from '@/db'
import { z } from 'zod'
import { getVocabEntriesByLesson } from '@/db'
import { compactVocab } from '@/lib/agent-utils'
import { buildTool } from '@/lib/tools/types'

export async function executeGetVocabulary(
  db: ShadowLearnDB,
  args: { lessonId?: string },
) {
  if (args.lessonId) {
    const entries = await getVocabEntriesByLesson(db, args.lessonId)
    return entries.map(compactVocab)
  }
  const all = await db.getAll('vocabulary')
  return all.slice(0, 50).map(compactVocab)
}

export const getVocabularyTool = buildTool({
  name: 'get_vocabulary',
  description: 'Get vocabulary entries from the learner\'s workbook, optionally scoped to a specific lesson. Call this when you need word IDs for render_study_session, want to show the user their vocabulary list, or need to look up a word\'s spaced-repetition status. Do not re-call if you already fetched vocabulary earlier in this session — the data does not change mid-session. Returns an array of vocab entries each with id, word, pinyin, definition, and SR metadata.',
  inputSchema: z.object({ lessonId: z.string().describe('Optional lesson ID to scope vocabulary').optional() }),
  isConcurrencySafe: () => true,
  isReadOnly: () => true,
  maxResultSizeChars: 10_000,
  searchHint: 'vocabulary words lesson entries',
  execute: async (input, context) => executeGetVocabulary(context.idb, input),
})
