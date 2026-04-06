import type { ShadowLearnDB } from '@/db'
import type { VocabEntry } from '@/types'
import { z } from 'zod'
import { compactVocab } from '@/lib/agent-utils'
import { buildTool } from '@/lib/tools/types'

export async function executeRenderVocabCard(
  db: ShadowLearnDB,
  args: { word: string },
) {
  // No word index — use cursor to avoid loading entire store into memory
  const tx = db.transaction('vocabulary', 'readonly')
  let entry: VocabEntry | undefined
  for await (const cursor of tx.store) {
    if (cursor.value.word === args.word) {
      entry = cursor.value
      break
    }
  }
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
