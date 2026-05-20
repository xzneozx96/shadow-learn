import { openDB } from 'idb'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  deleteThread,
  getLatestSummary,
  getThread,
  initDB,
  listThreadsBySurface,
  putThreadSummary,
  saveThreadMessages,
} from '../src/db'
import 'fake-indexeddb/auto'

const DB_NAME = 'shadowlearn'

async function seedV19(): Promise<void> {
  const db = await openDB(DB_NAME, 19, {
    async upgrade(d) {
      if (!d.objectStoreNames.contains('chats'))
        d.createObjectStore('chats')
      if (!d.objectStoreNames.contains('tip-chats')) {
        const tc = d.createObjectStore('tip-chats', { keyPath: 'key' })
        tc.createIndex('by-course', 'courseId', { unique: false })
      }
    },
  })
  await db.put('chats', [{ id: 'm1', role: 'user', parts: [{ type: 'text', text: 'hi lesson' }] }] as any, 'lesson-abc')
  await db.put('chats', [{ id: 'g1', role: 'user', parts: [{ type: 'text', text: 'hi global' }] }] as any, '__global')
  await db.put('tip-chats', {
    key: 'course-x:video-y',
    courseId: 'course-x',
    videoId: 'video-y',
    messages: [{ id: 't1', role: 'user', parts: [{ type: 'text', text: 'hi tip' }] }],
    updatedAt: '2026-05-20T00:00:00.000Z',
  } as any)
  db.close()
}

describe('iDB v20 migration', () => {
  beforeEach(() => { globalThis.indexedDB = new IDBFactory() })
  afterEach(() => { globalThis.indexedDB = new IDBFactory() })

  it('migrates lesson/global/tip chats into threads with correct surface tags', async () => {
    await seedV19()
    const db = await initDB()
    const threads = await db.getAll('threads')
    expect(threads).toHaveLength(3)

    const lesson = threads.find(t => t.id === 'lesson-abc')!
    expect(lesson.surface).toBe('lesson')
    expect(lesson.ownerId).toBe('lesson-abc')
    expect((lesson.messages[0] as any).parts[0].text).toBe('hi lesson')

    const global = threads.find(t => t.id === '__global')!
    expect(global.surface).toBe('global')
    expect(global.ownerId).toBeNull()

    const tip = threads.find(t => t.id === 'course-x:video-y')!
    expect(tip.surface).toBe('tip')
    expect(tip.courseId).toBe('course-x')
    expect(tip.videoId).toBe('video-y')
    db.close()
  })

  it('is idempotent on re-run', async () => {
    await seedV19()
    let db = await initDB()
    db.close()
    db = await initDB()
    const threads = await db.getAll('threads')
    expect(threads).toHaveLength(3)
    db.close()
  })

  it('preserves legacy stores for fallback reads', async () => {
    await seedV19()
    const db = await initDB()
    expect(await db.get('chats', 'lesson-abc')).toBeDefined()
    expect(await db.get('tip-chats', 'course-x:video-y')).toBeDefined()
    db.close()
  })
})

describe('thread helpers', () => {
  beforeEach(() => { globalThis.indexedDB = new IDBFactory() })
  afterEach(() => { globalThis.indexedDB = new IDBFactory() })

  it('saveThreadMessages + getThread round-trip', async () => {
    const db = await initDB()
    const msgs = [{ id: 'a', role: 'user', parts: [{ type: 'text', text: 'hello' }] }] as any
    await saveThreadMessages(db, 'tid', msgs, 'lesson', 'tid')
    const got = await getThread(db, 'tid')
    expect(got?.messages).toEqual(msgs)
    expect(got?.surface).toBe('lesson')
    db.close()
  })

  it('listThreadsBySurface filters by surface', async () => {
    const db = await initDB()
    await saveThreadMessages(db, 'l1', [] as any, 'lesson', 'l1')
    await saveThreadMessages(db, 'l2', [] as any, 'lesson', 'l2')
    await saveThreadMessages(db, '__global', [] as any, 'global', null)
    expect(await listThreadsBySurface(db, 'lesson')).toHaveLength(2)
    expect(await listThreadsBySurface(db, 'global')).toHaveLength(1)
    db.close()
  })

  it('deleteThread removes row + cascades summaries', async () => {
    const db = await initDB()
    await saveThreadMessages(db, 'tid', [] as any, 'lesson', 'tid')
    await putThreadSummary(db, { threadId: 'tid', generation: 1, summary: 's', coversThroughMessageId: 'm', tokenBudget: 0, createdAt: 0 })
    await deleteThread(db, 'tid')
    expect(await getThread(db, 'tid')).toBeUndefined()
    expect(await getLatestSummary(db, 'tid')).toBeUndefined()
    db.close()
  })

  it('getLatestSummary returns highest generation', async () => {
    const db = await initDB()
    await saveThreadMessages(db, 't', [] as any, 'lesson', 't')
    await putThreadSummary(db, { threadId: 't', generation: 1, summary: 'one', coversThroughMessageId: 'm1', tokenBudget: 100, createdAt: 1 })
    await putThreadSummary(db, { threadId: 't', generation: 2, summary: 'two', coversThroughMessageId: 'm2', tokenBudget: 200, createdAt: 2 })
    const latest = await getLatestSummary(db, 't')
    expect(latest?.generation).toBe(2)
    expect(latest?.summary).toBe('two')
    db.close()
  })
})
