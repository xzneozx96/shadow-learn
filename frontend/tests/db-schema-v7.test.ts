/**
 * Tests for IDB schema v7 migration — exercise-stats and agent-logs stores.
 * Uses fake-indexeddb.
 */

import type { ShadowLearnDB } from '@/db'
import { afterEach, describe, expect, it } from 'vitest'
import {
  appendAgentLog,
  getExerciseAccuracy,
  initDB,
  upsertExerciseStat,
} from '@/db'
import 'fake-indexeddb/auto'

let db: ShadowLearnDB

afterEach(() => {
  if (db)
    db.close()
  globalThis.indexedDB = new IDBFactory()
})

describe('schema v7 — exercise-stats store', () => {
  it('creates exercise-stats store during init', async () => {
    db = await initDB()
    expect([...db.objectStoreNames]).toContain('exercise-stats')
  })

  it('upsertExerciseStat creates entry on first call', async () => {
    db = await initDB()
    await upsertExerciseStat(db, 'vocab-1:dictation', true)
    const stat = await db.get('exercise-stats', 'vocab-1:dictation')
    expect(stat).toBeDefined()
    expect(stat!.correct).toBe(1)
    expect(stat!.total).toBe(1)
  })

  it('upsertExerciseStat increments existing entry', async () => {
    db = await initDB()
    await upsertExerciseStat(db, 'vocab-1:dictation', true)
    await upsertExerciseStat(db, 'vocab-1:dictation', false)
    await upsertExerciseStat(db, 'vocab-1:dictation', true)
    const stat = await db.get('exercise-stats', 'vocab-1:dictation')
    expect(stat!.correct).toBe(2)
    expect(stat!.total).toBe(3)
  })

  it('getExerciseAccuracy aggregates by exercise type', async () => {
    db = await initDB()
    await upsertExerciseStat(db, 'vocab-1:dictation', true)
    await upsertExerciseStat(db, 'vocab-2:dictation', false)
    await upsertExerciseStat(db, 'vocab-1:translation', true)
    const accuracy = await getExerciseAccuracy(db)
    expect(accuracy.dictation).toBeDefined()
    expect(accuracy.dictation.attempts).toBe(2)
    expect(accuracy.dictation.accuracy).toBeCloseTo(0.5)
    expect(accuracy.translation.attempts).toBe(1)
    expect(accuracy.translation.accuracy).toBe(1)
  })

  it('getExerciseAccuracy returns empty object when no stats', async () => {
    db = await initDB()
    const accuracy = await getExerciseAccuracy(db)
    expect(Object.keys(accuracy)).toHaveLength(0)
  })
})

describe('schema v7 — agent-logs store', () => {
  it('creates agent-logs store during init', async () => {
    db = await initDB()
    expect([...db.objectStoreNames]).toContain('agent-logs')
  })

  it('appendAgentLog writes a log entry', async () => {
    db = await initDB()
    await appendAgentLog(db, {
      lessonId: 'lesson-1',
      timestamp: '2026-03-27T10:00:00.000Z',
      durationMs: 120000,
      messageCount: 5,
      toolCallCount: 3,
      errorCount: 0,
      exercisesCompleted: 2,
    })
    const all = await db.getAll('agent-logs')
    expect(all).toHaveLength(1)
    expect(all[0].lessonId).toBe('lesson-1')
    expect(all[0].toolCallCount).toBe(3)
  })

  it('appendAgentLog assigns autoincrement id', async () => {
    db = await initDB()
    const log = {
      lessonId: 'lesson-1',
      timestamp: '2026-03-27T10:00:00.000Z',
      durationMs: 60000,
      messageCount: 2,
      toolCallCount: 1,
      errorCount: 0,
      exercisesCompleted: 1,
    }
    await appendAgentLog(db, log)
    await appendAgentLog(db, log)
    const all = await db.getAll('agent-logs')
    expect(all).toHaveLength(2)
    expect(all[0].id).toBe(1)
    expect(all[1].id).toBe(2)
  })
})
