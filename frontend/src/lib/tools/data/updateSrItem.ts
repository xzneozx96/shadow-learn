import type { ShadowLearnDB } from '@/db'
import { z } from 'zod'
import { getSpacedRepetitionItem, saveSpacedRepetitionItem } from '@/db'
import { updateSpacedRepetition } from '@/lib/spacedRepetition'
import { buildTool } from '@/lib/tools/types'

export async function executeUpdateSrItem(
  db: ShadowLearnDB,
  args: { itemId: string, result: 'correct' | 'incorrect' | 'partial' },
) {
  const item = await getSpacedRepetitionItem(db, args.itemId)
  if (!item)
    return { error: `Item ${args.itemId} not found` }

  const scoreMap = { correct: 100, partial: 50, incorrect: 0 }
  const updated = updateSpacedRepetition(item, scoreMap[args.result])
  await saveSpacedRepetitionItem(db, updated)
  return { nextReview: updated.dueDate, masteryLevel: updated.masteryLevel }
}

export const updateSrItemTool = buildTool({
  name: 'update_sr_item',
  description: 'Update a spaced repetition item\'s schedule after an exercise result. Call this after every exercise where the user\'s performance is known. The itemId must be the id field from SR items returned by get_study_context or get_vocabulary — do not guess or construct IDs.',
  inputSchema: z.object({
    itemId: z.string().describe('Spaced repetition item ID'),
    result: z.enum(['correct', 'incorrect', 'partial']).describe('Exercise result'),
  }),
  execute: async (input, context) => executeUpdateSrItem(context.idb, input as { itemId: string, result: 'correct' | 'incorrect' | 'partial' }),
})
