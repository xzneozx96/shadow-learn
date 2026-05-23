import type { AgentMemory, ShadowLearnDB } from '@/db'
import { deleteAgentMemory, getAgentMemoriesByTag, getAllAgentMemories, saveAgentMemory } from '@/db'

const SPLIT_REGEX = /\s+/u

/**
 * Save a new memory entry to the agent-memory store.
 */
export async function saveMemory(
  db: ShadowLearnDB,
  opts: { content: string, tags: string[], importance: 1 | 2 | 3, lessonId?: string },
): Promise<{ id: string }> {
  const id = crypto.randomUUID()
  const now = Date.now()
  const memory: AgentMemory = {
    id,
    content: opts.content,
    tags: opts.tags,
    importance: opts.importance,
    createdAt: now,
    lastAccessedAt: now,
    lessonId: opts.lessonId,
  }
  await saveAgentMemory(db, memory)
  return { id }
}

/**
 * Recall memories by keyword search on content + optional tag filtering.
 * Returns matches sorted by importance (desc) then recency (desc).
 */
export async function recallMemory(
  db: ShadowLearnDB,
  query: string,
  tags?: string[],
): Promise<AgentMemory[]> {
  let candidates: AgentMemory[]

  if (tags && tags.length > 0) {
    // Fetch by first tag, then filter by additional tags + query
    const tagResults = await Promise.all(tags.map(t => getAgentMemoriesByTag(db, t)))
    // Intersect: keep memories that appear in all tag queries
    const idSets = tagResults.map(arr => new Set(arr.map(m => m.id)))
    const allById = new Map(tagResults.flat().map(m => [m.id, m]))
    candidates = [...allById.values()].filter(m => idSets.every(s => s.has(m.id)))
  }
  else {
    candidates = await getAllAgentMemories(db)
  }

  // Keyword filter on content
  const lowerQuery = query.toLowerCase()
  const keywords = lowerQuery.split(SPLIT_REGEX).filter(Boolean)
  const filtered = keywords.length > 0
    ? candidates.filter(m => keywords.some(kw => m.content.toLowerCase().includes(kw)))
    : candidates

  // Sort: importance desc, then lastAccessedAt desc
  return filtered.sort((a, b) => {
    if (b.importance !== a.importance)
      return b.importance - a.importance
    return b.lastAccessedAt - a.lastAccessedAt
  })
}

/**
 * Get the top N most important memories for system prompt injection.
 */
export async function getMemorySummary(
  db: ShadowLearnDB,
  limit = 3,
): Promise<AgentMemory[]> {
  const all = await getAllAgentMemories(db)
  return all
    .sort((a, b) => {
      if (b.importance !== a.importance)
        return b.importance - a.importance
      return b.lastAccessedAt - a.lastAccessedAt
    })
    .slice(0, limit)
}

/**
 * Delete a memory entry by ID.
 */
export async function removeMemory(db: ShadowLearnDB, id: string): Promise<void> {
  await deleteAgentMemory(db, id)
}
