import { z } from 'zod'
import { executeRenderVocabCard } from '@/lib/agent-tools'
import { buildTool } from '@/lib/tools/types'

export const renderVocabCardTool = buildTool({
  name: 'render_vocab_card',
  description: 'Renders a detailed vocabulary card for a specific word.',
  inputSchema: z.object({ word: z.string() }),
  isConcurrencySafe: () => true,
  isReadOnly: () => true,
  execute: async (input, context) => executeRenderVocabCard(context.idb, input),
})
