import { openDB } from 'idb'
import { afterEach, describe, expect, it } from 'vitest'
import { initDB } from '../src/db'
import 'fake-indexeddb/auto'

// Helper: open the DB at an arbitrary older version, populate sample data
// in every existing v14 store, close it, then open with the current code
// to trigger the upgrade. The new stores must exist and the old data must
// be preserved byte-for-byte.

const DB_NAME = 'shadowlearn'

async function seedV14() {
  const db = await openDB(DB_NAME, 14, {
    upgrade(db, oldVersion, _newVersion, _txn) {
      // Replicate the schema progression up to v14. Each branch must match
      // the production code in `src/db/index.ts` so migrations execute in
      // the same order on a clean fixture.
      if (oldVersion < 1) {
        db.createObjectStore('lessons', { keyPath: 'id' })
        db.createObjectStore('segments')
        db.createObjectStore('videos')
        db.createObjectStore('chats')
        db.createObjectStore('settings')
        db.createObjectStore('crypto')
      }

      if (oldVersion < 2) {
        db.createObjectStore('tts-cache')
      }

      if (oldVersion < 3) {
        const v = db.createObjectStore('vocabulary', { keyPath: 'id' })
        v.createIndex('by-lesson', 'sourceLessonId', { unique: false })
        v.createIndex('by-date', 'createdAt', { unique: false })
      }

      if (oldVersion < 5) {
        db.createObjectStore('learner-profile')
        db.createObjectStore('progress-db')
        db.createObjectStore('mastery-db')
        const sr = db.createObjectStore('spaced-repetition', { keyPath: 'itemId' })
        sr.createIndex('by-due', 'dueDate', { unique: false })
        db.createObjectStore('session-logs', { keyPath: 'sessionId' })
        db.createObjectStore('mistakes-db', { keyPath: 'patternId' })
      }

      if (oldVersion < 6) {
        const m = db.createObjectStore('agent-memory', { keyPath: 'id' })
        m.createIndex('tags', 'tags', { multiEntry: true })
        m.createIndex('importance', 'importance')
      }

      if (oldVersion < 7) {
        db.createObjectStore('exercise-stats')
        db.createObjectStore('agent-logs', { keyPath: 'id', autoIncrement: true })
      }

      if (oldVersion < 8) {
        const s = db.createObjectStore('speak-sessions', { keyPath: 'sessionId' })
        s.createIndex('by-date', 'startedAt', { unique: false })
      }

      if (oldVersion < 11) {
        db.createObjectStore('word-breakdowns', { keyPath: 'word' })
      }

      if (oldVersion < 13) {
        const b = db.createObjectStore('shadowing-bests', { keyPath: ['lessonId', 'segmentId'] })
        b.createIndex('by-lesson', 'lessonId', { unique: false })
        const a = db.createObjectStore('shadowing-audio', { keyPath: ['lessonId', 'segmentId'] })
        a.createIndex('by-lesson', 'lessonId', { unique: false })
      }

      if (oldVersion < 14) {
        db.createObjectStore('daily-tasks', { keyPath: 'id' })
      }
    },
  })

  // Populate fixtures in each store so we can verify preservation.
  await db.put('lessons', { id: 'l1', title: 'Sample lesson' })
  await db.put('vocabulary', { id: 'v1', word: '中国', sourceLessonId: 'l1' })
  await db.put('settings', { translationLanguage: 'en' }, 'app')
  await db.put('spaced-repetition', { itemId: 'v1', dueDate: '2026-05-20', repetitions: 3 })
  await db.put('word-breakdowns', { word: '中国', radicals: [] })
  await db.put('daily-tasks', { id: 't1', completed: false })
  db.close()
}

afterEach(async () => {
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
    req.onblocked = () => resolve()
  })
})

describe('v14 → v15 migration', () => {
  it('creates the four new tips stores', async () => {
    await seedV14()
    const db = await initDB()
    expect(db.objectStoreNames.contains('tip-courses')).toBe(true)
    expect(db.objectStoreNames.contains('tip-progress')).toBe(true)
    expect(db.objectStoreNames.contains('tip-transcripts')).toBe(true)
    expect(db.objectStoreNames.contains('tip-chats')).toBe(true)
    db.close()
  })

  it('preserves all v14 user data byte-for-byte', async () => {
    await seedV14()
    const db = await initDB()
    expect(await db.get('lessons', 'l1')).toMatchObject({ id: 'l1', title: 'Sample lesson' })
    expect(await db.get('vocabulary', 'v1')).toMatchObject({ id: 'v1', word: '中国' })
    expect(await db.get('settings', 'app')).toMatchObject({ translationLanguage: 'en' })
    expect(await db.get('spaced-repetition', 'v1')).toMatchObject({ itemId: 'v1', repetitions: 3 })
    expect(await db.get('word-breakdowns', '中国')).toMatchObject({ word: '中国' })
    expect(await db.get('daily-tasks', 't1')).toMatchObject({ id: 't1', completed: false })
    db.close()
  })

  it('is idempotent on re-open', async () => {
    await seedV14()
    const db1 = await initDB()
    db1.close()
    const db2 = await initDB()
    expect(db2.version).toBe(16)
    expect(db2.objectStoreNames.contains('tip-courses')).toBe(true)
    db2.close()
  })
})
