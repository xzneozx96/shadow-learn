import type { DBSchema, IDBPDatabase } from 'idb'
import type { AppSettings, ChatMessage, LessonMeta, Segment, VocabEntry } from '../types'
import { openDB } from 'idb'

const DB_NAME = 'shadowlearn'
const DB_VERSION = 4

interface ShadowLearnSchema extends DBSchema {
  'lessons': { key: string, value: LessonMeta }
  'segments': { key: string, value: Segment[] }
  'videos': { key: string, value: Blob }
  'chats': { key: string, value: ChatMessage[] }
  'settings': { key: string, value: AppSettings }
  'crypto': { key: string, value: { encrypted: ArrayBuffer, salt: Uint8Array, iv: Uint8Array } }
  'tts-cache': { key: string, value: Blob }
  'vocabulary': {
    key: string
    value: VocabEntry
    indexes: { 'by-lesson': string, 'by-date': string }
  }
}

export type ShadowLearnDB = IDBPDatabase<ShadowLearnSchema>

export async function initDB(): Promise<ShadowLearnDB> {
  return openDB<ShadowLearnSchema>(DB_NAME, DB_VERSION, {
    async upgrade(db, oldVersion, _newVersion, transaction) {
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
        const vocabStore = db.createObjectStore('vocabulary', { keyPath: 'id' })
        vocabStore.createIndex('by-lesson', 'sourceLessonId', { unique: false })
        vocabStore.createIndex('by-date', 'createdAt', { unique: false })
      }
      if (oldVersion < 4) {
        // segments store: each record value is a Segment[] array stored under lessonId as key
        const segStore = transaction.objectStore('segments')
        let segCursor = await segStore.openCursor()
        while (segCursor) {
          const segments = segCursor.value as any[]
          const migrated = segments.map((s: any) => {
            const { chinese, pinyin, ...rest } = s
            return {
              ...rest,
              text: chinese ?? s.text ?? '',
              romanization: pinyin ?? s.romanization ?? '',
            }
          })
          await segCursor.update(migrated)
          segCursor = await segCursor.continue()
        }

        // vocabulary store: each record is a flat VocabEntry
        const vocabStore = transaction.objectStore('vocabulary')
        let vocabCursor = await vocabStore.openCursor()
        while (vocabCursor) {
          const entry = vocabCursor.value as any
          const { pinyin, sourceSegmentChinese, ...rest } = entry
          await vocabCursor.update({
            ...rest,
            romanization: pinyin ?? entry.romanization ?? '',
            sourceSegmentText: sourceSegmentChinese ?? entry.sourceSegmentText ?? '',
            sourceLanguage: entry.sourceLanguage ?? 'zh-CN',
          })
          vocabCursor = await vocabCursor.continue()
        }
      }
    },
  })
}

// Lesson metadata
export async function saveLessonMeta(db: ShadowLearnDB, meta: LessonMeta): Promise<void> {
  await db.put('lessons', meta)
}

export async function getLessonMeta(db: ShadowLearnDB, id: string): Promise<LessonMeta | undefined> {
  return db.get('lessons', id)
}

export async function getAllLessonMetas(db: ShadowLearnDB): Promise<LessonMeta[]> {
  return db.getAll('lessons')
}

export async function deleteLessonMeta(db: ShadowLearnDB, id: string): Promise<void> {
  await db.delete('lessons', id)
}

// Segments
export async function saveSegments(db: ShadowLearnDB, lessonId: string, segments: Segment[]): Promise<void> {
  await db.put('segments', segments, lessonId)
}

export async function getSegments(db: ShadowLearnDB, lessonId: string): Promise<Segment[] | undefined> {
  return db.get('segments', lessonId)
}

export async function deleteSegments(db: ShadowLearnDB, lessonId: string): Promise<void> {
  await db.delete('segments', lessonId)
}

// Videos (uploaded file blobs)
export async function saveVideo(db: ShadowLearnDB, lessonId: string, blob: Blob): Promise<void> {
  await db.put('videos', blob, lessonId)
}

export async function getVideo(db: ShadowLearnDB, lessonId: string): Promise<Blob | undefined> {
  return db.get('videos', lessonId)
}

export async function deleteVideo(db: ShadowLearnDB, lessonId: string): Promise<void> {
  await db.delete('videos', lessonId)
}

// Chat history
export async function saveChatMessages(db: ShadowLearnDB, lessonId: string, messages: ChatMessage[]): Promise<void> {
  await db.put('chats', messages, lessonId)
}

export async function getChatMessages(db: ShadowLearnDB, lessonId: string): Promise<ChatMessage[] | undefined> {
  return db.get('chats', lessonId)
}

export async function deleteChatMessages(db: ShadowLearnDB, lessonId: string): Promise<void> {
  await db.delete('chats', lessonId)
}

// Settings
export async function saveSettings(db: ShadowLearnDB, settings: AppSettings): Promise<void> {
  await db.put('settings', settings, 'settings')
}

export async function getSettings(db: ShadowLearnDB): Promise<AppSettings | undefined> {
  return db.get('settings', 'settings')
}

// Crypto store
export async function saveCryptoData(db: ShadowLearnDB, data: { encrypted: ArrayBuffer, salt: Uint8Array, iv: Uint8Array }): Promise<void> {
  await db.put('crypto', data, 'keys')
}

export async function getCryptoData(db: ShadowLearnDB): Promise<{ encrypted: ArrayBuffer, salt: Uint8Array, iv: Uint8Array } | undefined> {
  const data = await db.get('crypto', 'keys')
  if (!data)
    return undefined
  // Normalize typed arrays in case of cross-realm issues (e.g. in tests with fake-indexeddb)
  return {
    encrypted: data.encrypted,
    salt: new Uint8Array(data.salt),
    iv: new Uint8Array(data.iv),
  }
}

export async function deleteCryptoData(db: ShadowLearnDB): Promise<void> {
  await db.delete('crypto', 'keys')
}

// Full lesson delete (all stores)
export async function deleteFullLesson(db: ShadowLearnDB, lessonId: string): Promise<void> {
  await Promise.all([
    deleteLessonMeta(db, lessonId),
    deleteSegments(db, lessonId),
    deleteVideo(db, lessonId),
    deleteChatMessages(db, lessonId),
  ])
}

// TTS audio cache (keyed by text, value is MP3 Blob)
export async function getTTSCache(db: ShadowLearnDB, text: string): Promise<Blob | undefined> {
  return db.get('tts-cache', text)
}

export async function saveTTSCache(db: ShadowLearnDB, text: string, blob: Blob): Promise<void> {
  await db.put('tts-cache', blob, text)
}

// Vocabulary store
export async function saveVocabEntry(db: ShadowLearnDB, entry: VocabEntry): Promise<void> {
  await db.put('vocabulary', entry)
}

export async function getVocabEntriesByLesson(db: ShadowLearnDB, lessonId: string): Promise<VocabEntry[]> {
  return db.getAllFromIndex('vocabulary', 'by-lesson', lessonId)
}

export async function deleteVocabEntry(db: ShadowLearnDB, id: string): Promise<void> {
  await db.delete('vocabulary', id)
}
