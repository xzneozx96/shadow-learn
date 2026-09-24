import type { DataClient } from '@/db'
import { z } from 'zod'
import { getSpacedRepetitionItem, updateSpacedRepetitionItem } from '@/db'
import { buildTool } from '@/features/agent/lib/tools/types'
import { updateSpacedRepetition } from '@/shared/lib/spacedRepetition'

export async function executeUpdateSrItem(
  db: DataClient,
  args: { itemId: string, result: 'correct' | 'incorrect' | 'partial' },
) {
  const item = await getSpacedRepetitionItem(db, args.itemId)
  if (!item)
    return { error: `Item ${args.itemId} not found` }

  const scoreMap = { correct: 100, partial: 50, incorrect: 0 }
  const updated = await updateSpacedRepetitionItem(db, args.itemId, prev => updateSpacedRepetition(prev ?? item, scoreMap[args.result]))
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
