/**
 * Tests for agent-memory.ts — saveMemory, recallMemory, getMemorySummary
 * Uses fake-indexeddb for IDB testing.
 */

import type { ShadowLearnDB } from '@/db'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { initDB } from '@/db'
import { getMemorySummary, recallMemory, removeMemory, saveMemory } from '@/lib/agent-memory'
import 'fake-indexeddb/auto'

let db: ShadowLearnDB

beforeEach(async () => {
  db = await initDB()
})

afterEach(() => {
  db.close()
  // Reset IDB between tests
  globalThis.indexedDB = new IDBFactory()
})

describe('saveMemory', () => {
  it('saves a memory and returns an id', async () => {
    const result = await saveMemory(db, {
      content: 'User confuses 了 and 过',
      tags: ['grammar'],
      importance: 2,
    })
    expect(result.id).toBeDefined()
    expect(typeof result.id).toBe('string')
  })

  it('saved memory can be retrieved', async () => {
    const { id } = await saveMemory(db, {
      content: 'Loves cooking vocabulary',
      tags: ['vocab', 'cooking'],
      importance: 1,
      lessonId: 'lesson-1',
    })
    const stored = await db.get('agent-memory', id)
    expect(stored).toBeDefined()
    expect(stored!.content).toBe('Loves cooking vocabulary')
    expect(stored!.tags).toEqual(['vocab', 'cooking'])
    expect(stored!.importance).toBe(1)
    expect(stored!.lessonId).toBe('lesson-1')
  })
})

describe('recallMemory', () => {
  beforeEach(async () => {
    await saveMemory(db, { content: 'Struggles with tone 3 sandhi', tags: ['pronunciation', 'tones'], importance: 3 })
    await saveMemory(db, { content: 'Prefers dictation exercises', tags: ['preferences'], importance: 2 })
    await saveMemory(db, { content: 'Recently learned cooking vocabulary', tags: ['vocab', 'cooking'], importance: 1 })
  })

  it('filters by keyword', async () => {
    const results = await recallMemory(db, 'tone')
    expect(results.length).toBe(1)
    expect(results[0].content).toContain('tone 3 sandhi')
  })

  it('returns empty for unmatched keyword', async () => {
    const results = await recallMemory(db, 'xyz_not_found')
    expect(results.length).toBe(0)
  })

  it('filters by tags', async () => {
    const results = await recallMemory(db, '', ['pronunciation'])
    expect(results.length).toBe(1)
    expect(results[0].content).toContain('tone 3 sandhi')
  })

  it('intersects multiple tags', async () => {
    const results = await recallMemory(db, '', ['pronunciation', 'tones'])
    expect(results.length).toBe(1)
    expect(results[0].content).toContain('tone 3 sandhi')

    // No memory has both 'pronunciation' and 'cooking'
    const noResults = await recallMemory(db, '', ['pronunciation', 'cooking'])
    expect(noResults.length).toBe(0)
  })

  it('sorts by importance desc then recency desc', async () => {
    const results = await recallMemory(db, '') // empty query = all
    expect(results.length).toBe(3)
    expect(results[0].importance).toBe(3)
    expect(results[1].importance).toBe(2)
    expect(results[2].importance).toBe(1)
  })
})

describe('getMemorySummary', () => {
  it('returns top N by importance', async () => {
    await saveMemory(db, { content: 'Low importance', tags: [], importance: 1 })
    await saveMemory(db, { content: 'High importance', tags: [], importance: 3 })
    await saveMemory(db, { content: 'Medium importance', tags: [], importance: 2 })
    await saveMemory(db, { content: 'Another low', tags: [], importance: 1 })

    const top2 = await getMemorySummary(db, 2)
    expect(top2.length).toBe(2)
    expect(top2[0].importance).toBe(3)
    expect(top2[1].importance).toBe(2)
  })

  it('returns empty array when no memories exist', async () => {
    const result = await getMemorySummary(db)
    expect(result).toEqual([])
  })
})

describe('removeMemory', () => {
  it('deletes a memory by id', async () => {
    const { id } = await saveMemory(db, { content: 'temp', tags: [], importance: 1 })
    expect(await db.get('agent-memory', id)).toBeDefined()
    await removeMemory(db, id)
    expect(await db.get('agent-memory', id)).toBeUndefined()
  })
})
