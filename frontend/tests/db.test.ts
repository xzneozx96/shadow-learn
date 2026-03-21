import type { VocabEntry } from '../src/types'

import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  deleteErrorPattern,
  deleteFullLesson,
  deleteLessonMeta,
  deleteSpacedRepetitionItem,
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
      { id: 'seg_000', start: 0, end: 1, text: '你好', romanization: 'nǐ hǎo', translations: { en: 'Hello' }, words: [] },
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
      {
        id: '1',
        role: 'user' as const,
        content: 'Hello',
        timestamp: new Date().toISOString(),
        parts: [{ type: 'text' as const, text: 'Hello' }],
      },
      {
        id: '2',
        role: 'assistant' as const,
        content: 'Hi!',
        timestamp: new Date().toISOString(),
        parts: [{ type: 'text' as const, text: 'Hi!' }],
      },
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

describe('deleteSpacedRepetitionItem', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory()
  })

  it('removes the SR record by itemId', async () => {
    const db = await initDB()
    await db.put('spaced-repetition', {
      itemId: 'entry-1',
      itemType: 'vocabulary',
      easinessFactor: 2.5,
      intervalDays: 1,
      repetitions: 3,
      consecutiveCorrect: 2,
      consecutiveIncorrect: 0,
      masteryLevel: 1,
      dueDate: '2026-01-01',
      lastReviewed: '2025-12-01',
      reviewHistory: [],
    })
    await deleteSpacedRepetitionItem(db, 'entry-1')
    expect(await db.get('spaced-repetition', 'entry-1')).toBeUndefined()
  })

  it('is a no-op if the record does not exist', async () => {
    const db = await initDB()
    await expect(deleteSpacedRepetitionItem(db, 'missing')).resolves.not.toThrow()
  })
})

describe('deleteErrorPattern', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory()
  })

  it('removes the mistake record by patternId', async () => {
    const db = await initDB()
    await db.put('mistakes-db', { patternId: 'entry-1', frequency: 2, lastOccurred: '2026-01-01', examples: [] })
    await deleteErrorPattern(db, 'entry-1')
    expect(await db.get('mistakes-db', 'entry-1')).toBeUndefined()
  })

  it('is a no-op if the record does not exist', async () => {
    const db = await initDB()
    await expect(deleteErrorPattern(db, 'missing')).resolves.not.toThrow()
  })

  it('does not delete agent-created err-word patterns when removing by entry id', async () => {
    const db = await initDB()
    await db.put('mistakes-db', { patternId: 'err-好', frequency: 1, lastOccurred: '2026-01-01', examples: [] })
    await deleteErrorPattern(db, 'entry-1') // different key — must not affect err-好
    expect(await db.get('mistakes-db', 'err-好')).toBeDefined()
  })
})

describe('vocabulary store', () => {
  it('saves and retrieves a VocabEntry by lesson', async () => {
    const db = await initDB()
    const entry: VocabEntry = {
      id: 'test-id-1',
      word: '今天',
      romanization: 'jīntiān',
      meaning: 'today',
      usage: '今天天气很好。',
      sourceLessonId: 'lesson_abc',
      sourceLessonTitle: 'Test Lesson',
      sourceSegmentId: 'seg_001',
      sourceSegmentText: '今天天气非常好！',
      sourceSegmentTranslation: 'The weather is nice today!',
      sourceLanguage: 'zh-CN',
      createdAt: new Date().toISOString(),
    }
    await db.put('vocabulary', entry)
    const results = await db.getAllFromIndex('vocabulary', 'by-lesson', 'lesson_abc')
    expect(results).toHaveLength(1)
    expect(results[0].word).toBe('今天')
  })
})
