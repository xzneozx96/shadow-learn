/**
 * Tests for IDB schema v10 migration — SpeakSession language/level fields.
 * Uses fake-indexeddb.
 */

import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { initDB } from '@/db'
import type { ShadowLearnDB } from '@/db'

let db: ShadowLearnDB

afterEach(() => {
  if (db)
    db.close()
  globalThis.indexedDB = new IDBFactory()
})

describe('DB v10 migration', () => {
  it('new sessions carry the new fields', async () => {
    db = await initDB()
    await db.put('speak-sessions', {
      sessionId: 'sess-v10-test',
      lessonId: 'lesson-1',
      startedAt: '2026-04-20T10:00:00Z',
      endedAt: null,
      durationSeconds: 0,
      status: 'active',
      transcript: [],
      transcriptText: '',
      evaluation: null,
      promptVersion: 'v2',
      modelId: 'gemini-realtime',
      targetLanguage: 'ja',
      proficiencyLevel: 'beginner',
      levelLabel: 'N5',
      situationTitle: 'Ordering Food',
      userGoal: 'Order a bowl of ramen',
    } as any)
    const read = await db.get('speak-sessions', 'sess-v10-test') as any
    expect(read.targetLanguage).toBe('ja')
    expect(read.levelLabel).toBe('N5')
    expect(read.situationTitle).toBe('Ordering Food')
    expect(read.userGoal).toBe('Order a bowl of ramen')
    expect(read.proficiencyLevel).toBe('beginner')
  })
})
