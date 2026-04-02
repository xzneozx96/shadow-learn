import { z } from 'zod'
import { executeGetVocabulary } from '@/lib/agent-tools'
import { buildTool } from '@/lib/tools/types'

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
