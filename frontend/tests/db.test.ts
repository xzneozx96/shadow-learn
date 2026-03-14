import { IDBFactory } from 'fake-indexeddb'

import { beforeEach, describe, expect, it } from 'vitest'
import {
  deleteFullLesson,
  deleteLessonMeta,
  getAllLessonMetas,
  getChatMessages,
  getCryptoData,
  getLessonMeta,
  getSegments,
  getSettings,
  initDB,
  saveChatMessages,
  saveCryptoData,
  saveLessonMeta,
  saveSegments,
  saveSettings,
} from '../src/db'

// We'll use fake-indexeddb for testing
import 'fake-indexeddb/auto'

describe('indexedDB storage', () => {
  beforeEach(async () => {
    // Reset the database before each test by replacing the global IDB factory
    globalThis.indexedDB = new IDBFactory()
  })

  it('should save and retrieve lesson metadata', async () => {
    const db = await initDB()
    const meta = {
      id: 'lesson_1',
      title: 'Test Lesson',
      source: 'youtube' as const,
      sourceUrl: 'https://youtube.com/watch?v=123',
      duration: 120,
      segmentCount: 5,
      translationLanguages: ['en'],
      createdAt: new Date().toISOString(),
      lastOpenedAt: new Date().toISOString(),
      progressSegmentId: null,
      tags: [],
    }
    await saveLessonMeta(db, meta)
    const retrieved = await getLessonMeta(db, 'lesson_1')
    expect(retrieved).toEqual(meta)
  })

  it('should list all lesson metadata', async () => {
    const db = await initDB()
    await saveLessonMeta(db, {
      id: 'lesson_1',
      title: 'A',
      source: 'youtube',
      sourceUrl: null,
      duration: 60,
      segmentCount: 2,
      translationLanguages: ['en'],
      createdAt: new Date().toISOString(),
      lastOpenedAt: new Date().toISOString(),
      progressSegmentId: null,
      tags: [],
    })
    await saveLessonMeta(db, {
      id: 'lesson_2',
      title: 'B',
      source: 'upload',
      sourceUrl: null,
      duration: 90,
      segmentCount: 3,
      translationLanguages: ['en'],
      createdAt: new Date().toISOString(),
      lastOpenedAt: new Date().toISOString(),
      progressSegmentId: null,
      tags: [],
    })
    const all = await getAllLessonMetas(db)
    expect(all).toHaveLength(2)
  })

  it('should delete a lesson', async () => {
    const db = await initDB()
    await saveLessonMeta(db, {
      id: 'lesson_1',
      title: 'A',
      source: 'youtube',
      sourceUrl: null,
      duration: 60,
      segmentCount: 2,
      translationLanguages: ['en'],
      createdAt: new Date().toISOString(),
      lastOpenedAt: new Date().toISOString(),
      progressSegmentId: null,
      tags: [],
    })
    await deleteLessonMeta(db, 'lesson_1')
    const retrieved = await getLessonMeta(db, 'lesson_1')
    expect(retrieved).toBeUndefined()
  })

  it('should save and retrieve segments', async () => {
    const db = await initDB()
    const segments = [
      { id: 'seg_000', start: 0, end: 1, chinese: '你好', pinyin: 'nǐ hǎo', translations: { en: 'Hello' }, words: [] },
    ]
    await saveSegments(db, 'lesson_1', segments)
    const retrieved = await getSegments(db, 'lesson_1')
    expect(retrieved).toEqual(segments)
  })

  it('should save and retrieve settings', async () => {
    const db = await initDB()
    const s = { translationLanguage: 'en', defaultModel: 'openai/gpt-4o' }
    await saveSettings(db, s)
    const retrieved = await getSettings(db)
    expect(retrieved).toEqual(s)
  })

  it('should save and retrieve chat messages', async () => {
    const db = await initDB()
    const msgs = [
      { role: 'user' as const, content: 'Hello', timestamp: new Date().toISOString() },
      { role: 'assistant' as const, content: 'Hi!', timestamp: new Date().toISOString() },
    ]
    await saveChatMessages(db, 'lesson_1', msgs)
    const retrieved = await getChatMessages(db, 'lesson_1')
    expect(retrieved).toEqual(msgs)
  })

  it('should save and retrieve crypto data', async () => {
    const db = await initDB()
    const data = {
      encrypted: new ArrayBuffer(16),
      salt: new Uint8Array(16),
      iv: new Uint8Array(12),
    }
    await saveCryptoData(db, data)
    const retrieved = await getCryptoData(db)
    expect(retrieved).toBeDefined()
    expect(retrieved!.salt).toEqual(data.salt)
  })

  it('should delete full lesson across all stores', async () => {
    const db = await initDB()
    await saveLessonMeta(db, {
      id: 'lesson_del',
      title: 'Delete Me',
      source: 'youtube',
      sourceUrl: null,
      duration: 60,
      segmentCount: 1,
      translationLanguages: ['en'],
      createdAt: new Date().toISOString(),
      lastOpenedAt: new Date().toISOString(),
      progressSegmentId: null,
      tags: [],
    })
    await saveSegments(db, 'lesson_del', [])
    await deleteFullLesson(db, 'lesson_del')
    expect(await getLessonMeta(db, 'lesson_del')).toBeUndefined()
    expect(await getSegments(db, 'lesson_del')).toBeUndefined()
  })
})
