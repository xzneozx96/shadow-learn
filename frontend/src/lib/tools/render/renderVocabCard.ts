import { z } from 'zod'
import { executeRenderVocabCard } from '@/lib/agent-tools'
import { buildTool } from '@/lib/tools/types'

export const renderVocabCardTool = buildTool({
  name: 'render_vocab_card',
  description: 'Render an inline vocabulary card for a specific Chinese word. Call when the user asks about a word\'s meaning, pronunciation, or stroke order, or when introducing new vocabulary. The word parameter accepts Chinese characters (e.g. "你好") — do not pass pinyin or English. Returns a card with characters, pinyin, tone marks, definition, and example usage.',
  inputSchema: z.object({ word: z.string() }),
  isConcurrencySafe: () => true,
  isReadOnly: () => true,
  maxResultSizeChars: Number.MAX_SAFE_INTEGER,
  execute: async (input, context) => executeRenderVocabCard(context.idb, input),
})
