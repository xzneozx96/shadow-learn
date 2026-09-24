import type { DataClient } from '@/db'
import { z } from 'zod'
import { getAllVocabEntries } from '@/db'
import { compactVocab } from '@/features/agent/lib/agent-utils'
import { buildTool } from '@/features/agent/lib/tools/types'

export async function executeRenderVocabCard(
  db: DataClient,
  args: { word: string },
) {
  const entry = (await getAllVocabEntries(db)).find(e => e.word === args.word)
  if (!entry) {
    return { error: `Vocabulary entry for "${args.word}" not found.` }
  }
  return { entry: compactVocab(entry) }
}

export const renderVocabCardTool = buildTool({
  name: 'render_vocab_card',
  description: 'Render an inline vocabulary card for a specific Chinese word. Call when the user asks about a word\'s meaning, pronunciation, or stroke order, or when introducing new vocabulary. The word parameter accepts Chinese characters (e.g. "你好") — do not pass pinyin or English. Returns a card with characters, pinyin, tone marks, definition, and example usage.',
  inputSchema: z.object({ word: z.string() }),
  isConcurrencySafe: () => true,
  isReadOnly: () => true,
  isDeferred: () => true,
  maxResultSizeChars: Number.MAX_SAFE_INTEGER,
  execute: async (input, context) => executeRenderVocabCard(context.idb, input),
})
