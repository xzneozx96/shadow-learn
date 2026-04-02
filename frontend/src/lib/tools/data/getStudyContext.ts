import { z } from 'zod'
import { executeGetStudyContext } from '@/lib/agent-tools'
import { buildTool } from '@/lib/tools/types'

export const getStudyContextTool = buildTool({
  name: 'get_study_context',
  description: 'Fetches a composite snapshot of the learner\'s current state: due vocabulary items, recent mistakes, mastery data, and session statistics. Call this before starting any study session or when you need a complete picture of what to work on.',
  inputSchema: z.object({
    lessonId: z.string().optional(),
  }),
  isConcurrencySafe: () => true,
  isReadOnly: () => true,
  maxResultSizeChars: 6000,
  searchHint: 'study context due items mistakes mastery',
  execute: async (input, context) => executeGetStudyContext(context.idb, input),
})
