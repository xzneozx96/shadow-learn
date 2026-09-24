/**
 * Tests for IDB schema v6 migration — agent-memory store and indexes
 * Uses fake-indexeddb.
 */

import type { ShadowLearnDB } from '@/db/legacy'
import { afterEach, describe, expect, it } from 'vitest'
import { initDB } from '@/db/legacy'
import 'fake-indexeddb/auto'

let db: ShadowLearnDB

afterEach(() => {
  if (db)
    db.close()
  globalThis.indexedDB = new IDBFactory()
})

describe('schema v6 — agent-memory store', () => {
  it('creates agent-memory store during init', async () => {
    db = await initDB()
    expect([...db.objectStoreNames]).toContain('agent-memory')
  })

  it('indexes agent-memory tags as a multi-entry index', async () => {
    db = await initDB()
    await db.put('agent-memory', { id: 'a', content: 'grammar', tags: ['grammar', 'hsk4'], importance: 1, createdAt: 1, lastAccessedAt: 1 })
    await db.put('agent-memory', { id: 'b', content: 'vocab', tags: ['vocab'], importance: 1, createdAt: 1, lastAccessedAt: 1 })

    expect((await db.getAllFromIndex('agent-memory', 'tags', 'hsk4')).map(m => m.id)).toEqual(['a'])
    expect(await db.getAllFromIndex('agent-memory', 'tags', 'nonexistent')).toEqual([])
  })
})
