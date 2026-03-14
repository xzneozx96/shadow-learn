import type { IDBPDatabase } from 'idb'
import type { AppSettings, ChatMessage, LessonMeta, Segment } from '../types'
import { openDB } from 'idb'

const DB_NAME = 'shadowlearn'
const DB_VERSION = 1

export type ShadowLearnDB = IDBPDatabase

export async function initDB(): Promise<ShadowLearnDB> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('lessons')) {
        db.createObjectStore('lessons', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('segments')) {
        db.createObjectStore('segments')
      }
      if (!db.objectStoreNames.contains('videos')) {
        db.createObjectStore('videos')
      }
      if (!db.objectStoreNames.contains('chats')) {
        db.createObjectStore('chats')
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings')
      }
      if (!db.objectStoreNames.contains('crypto')) {
        db.createObjectStore('crypto')
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
