import { z } from 'zod'
import { executeGetVocabulary } from '@/lib/agent-tools'
import { buildTool } from '@/lib/tools/types'

export const getVocabularyTool = buildTool({
  name: 'get_vocabulary',
  description: 'Retrieves vocabulary entries from the learner\'s workbook. Optionally scoped to a specific lesson. Returns word, romanization, meaning, usage examples, and SRS data.',
  inputSchema: z.object({ lessonId: z.string().optional() }),
  isConcurrencySafe: () => true,
  isReadOnly: () => true,
  maxResultSizeChars: 5000,
  searchHint: 'vocabulary words lesson entries',
  execute: async (input, context) => executeGetVocabulary(context.idb, input),
})
