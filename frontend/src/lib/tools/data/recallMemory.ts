import type { ShadowLearnDB } from '@/db'
import { z } from 'zod'
import { recallMemory } from '@/lib/agent-memory'
import { buildTool } from '@/lib/tools/types'

export async function executeRecallMemory(
  db: ShadowLearnDB,
  args: { query: string, tags?: string[] },
) {
  const memories = await recallMemory(db, args.query, args.tags)
  return memories.slice(0, 10).map(m => ({
    id: m.id,
    content: m.content,
    tags: m.tags,
    importance: m.importance,
  }))
}

export const recallMemoryTool = buildTool({
  name: 'recall_memory',
  description: 'Search long-term memory for previously saved facts about the user — preferences, goals, known difficulties, personal context. Call this when the user references something that might have been noted before, or when personalizing a response. Use specific keyword queries; broad queries return noise. Returns an array of matching memory entries with content, tags, and importance level.',
  inputSchema: z.object({
    query: z.string().describe('Keyword search query'),
    tags: z.array(z.string()).describe('Optional tags to filter by').optional(),
  }),
  isConcurrencySafe: () => true,
  isReadOnly: () => true,
  maxResultSizeChars: 10_000,
  searchHint: 'memory recall search past preferences',
  execute: async (input, context) => executeRecallMemory(context.idb, input),
})
