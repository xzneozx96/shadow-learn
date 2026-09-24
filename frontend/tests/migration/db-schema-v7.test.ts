/**
 * Tests for IDB schema v7 migration — exercise-stats and agent-logs stores.
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

describe('schema v7', () => {
  it('creates the exercise-stats and agent-logs stores during init', async () => {
    db = await initDB()
    expect([...db.objectStoreNames]).toEqual(expect.arrayContaining(['exercise-stats', 'agent-logs']))
  })

  it('keys exercise-stats out of line by `<vocabId>:<exerciseType>`', async () => {
    db = await initDB()
    await db.put('exercise-stats', { correct: 1, total: 2, lastAttempt: '2026-03-27' }, 'vocab-1:dictation')
    expect(await db.getAllKeys('exercise-stats')).toEqual(['vocab-1:dictation'])
  })

  it('assigns agent-logs an autoincrement id', async () => {
    db = await initDB()
    const log = { lessonId: 'l1', timestamp: 't', durationMs: 1, messageCount: 1, toolCallCount: 0, errorCount: 0, exercisesCompleted: 0 }
    await db.add('agent-logs', log as any)
    await db.add('agent-logs', log as any)
    expect((await db.getAll('agent-logs')).map(l => l.id)).toEqual([1, 2])
  })
})
