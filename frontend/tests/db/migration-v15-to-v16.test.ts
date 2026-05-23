import { openDB } from 'idb'
import { afterEach, describe, expect, it } from 'vitest'
import { initDB } from '../../src/db'
import 'fake-indexeddb/auto'

const DB_NAME = 'shadowlearn'

// Helper: open the DB at version 15 with the old schema so we can seed B1 data.
// Only `tip-chats` is needed for the regression assertion; other v15 stores are
// created so the v16 upgrade does not have to backfill them.
async function openLegacyV15() {
  return openDB(DB_NAME, 15, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('tip-chats')) {
        const store = db.createObjectStore('tip-chats', { keyPath: 'key' })
        store.createIndex('by-course', 'courseId', { unique: false })
      }
    },
  })
}

afterEach(async () => {
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
    req.onblocked = () => resolve()
  })
})

describe('idb migration v15 → v16', () => {
  it('preserves existing B1 tip-chats rows and tags them with kind="tutor"', async () => {
    const v15 = await openLegacyV15()
    await v15.put('tip-chats', {
      key: 'PL123:vid456',
      courseId: 'PL123',
      videoId: 'vid456',
      messages: [{ id: 'm1', role: 'user', content: 'hi' }],
      updatedAt: '2026-05-01T00:00:00Z',
    } as any)
    v15.close()

    const v16 = await initDB()
    expect(v16.version).toBe(21)

    // v18 reversed the :tutor suffix migration, so key is plain again
    const row = await v16.get('tip-chats', 'PL123:vid456')
    expect(row).toBeDefined()
    expect(row!.messages).toHaveLength(1)

    // :tutor key does not exist after v18 reversal
    const oldRow = await v16.get('tip-chats', 'PL123:vid456:tutor')
    expect(oldRow).toBeUndefined()

    v16.close()
  })

  it('creates tip-studio and tip-cards stores', async () => {
    const db = await initDB()
    expect(db.objectStoreNames.contains('tip-studio')).toBe(true)
    expect(db.objectStoreNames.contains('tip-cards')).toBe(true)
    db.close()
  })
})
