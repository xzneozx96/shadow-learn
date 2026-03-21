import type { UIMessage } from '@ai-sdk/react'
import type { DBSchema, IDBPDatabase } from 'idb'
import type { AppSettings, LessonMeta, Segment, VocabEntry } from '../types'
import { openDB } from 'idb'

const DB_NAME = 'shadowlearn'
const DB_VERSION = 6

export interface LearnerProfile {
  name: string
  nativeLanguage: string
  targetLanguage: string
  currentLevel: string
  dailyGoalMinutes: number
  currentStreakDays: number
  totalSessions: number
  totalStudyMinutes: number
  lastStudyDate: string | null
  profileCreated: string
}

export interface DailyAccuracy { date: string, accuracy: number, exercises: number }
export interface SkillStats { sessions: number, accuracy: number, lastPracticed: string | null }

export interface ProgressStats {
  totalSessions: number
  totalExercises: number
  totalCorrect: number
  totalIncorrect: number
  accuracyRate: number
  totalStudyMinutes: number
  accuracyTrend: DailyAccuracy[]
  skillProgress: Record<'writing' | 'speaking' | 'vocabulary' | 'reading' | 'listening', SkillStats>
}

export interface SpacedRepetitionItem {
  itemId: string
  itemType: 'vocabulary'
  easinessFactor: number
  intervalDays: number
  repetitions: number
  consecutiveCorrect: number
  consecutiveIncorrect: number
  masteryLevel: number
  dueDate: string
  lastReviewed: string | null
  reviewHistory: { date: string, quality: number, intervalDays: number }[]
}

export interface MistakeExample {
  userAnswer: string
  correctAnswer: string
  context?: string
  date: string
}

export interface ErrorPattern {
  patternId: string
  frequency: number
  lastOccurred: string
  examples: MistakeExample[]
}

export interface SessionLog {
  sessionId: string
  date: string
  durationMinutes: number
  skillPracticed: 'writing' | 'speaking' | 'vocabulary' | 'reading' | 'listening' | 'mixed'
  exercisesCompleted: number
  exercisesCorrect: number
  accuracy: number
  itemsMastered: string[]
}

export interface SkillMastery {
  masteryLevel: number
  confidenceScore: number
  totalPracticeTime: number
  lastPracticed: string | null
}
export type MasteryData = Record<'writing' | 'speaking' | 'vocabulary' | 'reading' | 'listening', SkillMastery>

export interface AgentMemory {
  id: string
  content: string
  tags: string[]
  importance: 1 | 2 | 3
  createdAt: number
  lastAccessedAt: number
  lessonId?: string
}

interface ShadowLearnSchema extends DBSchema {
  'lessons': { key: string, value: LessonMeta }
  'segments': { key: string, value: Segment[] }
  'videos': { key: string, value: Blob }
  'chats': { key: string, value: UIMessage[] }
  'settings': { key: string, value: AppSettings }
  'crypto': { key: string, value: { encrypted: ArrayBuffer, salt: Uint8Array, iv: Uint8Array } }
  'tts-cache': { key: string, value: Blob }
  'vocabulary': {
    key: string
    value: VocabEntry
    indexes: { 'by-lesson': string, 'by-date': string }
  }
  'learner-profile': { key: string, value: LearnerProfile }
  'progress-db': { key: string, value: ProgressStats }
  'mastery-db': { key: string, value: MasteryData }
  'spaced-repetition': {
    key: string
    value: SpacedRepetitionItem
    indexes: { 'by-due': string }
  }
  'session-logs': { key: string, value: SessionLog }
  'mistakes-db': { key: string, value: ErrorPattern }
  'agent-memory': {
    key: string
    value: AgentMemory
    indexes: {
      tags: string
      importance: number
    }
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
      if (oldVersion < 5) {
        db.createObjectStore('learner-profile')
        db.createObjectStore('progress-db')
        db.createObjectStore('mastery-db')
        const srStore = db.createObjectStore('spaced-repetition', { keyPath: 'itemId' })
        srStore.createIndex('by-due', 'dueDate', { unique: false })
        db.createObjectStore('session-logs', { keyPath: 'sessionId' })
        db.createObjectStore('mistakes-db', { keyPath: 'patternId' })
      }
      if (oldVersion < 6) {
        const memStore = db.createObjectStore('agent-memory', { keyPath: 'id' })
        memStore.createIndex('tags', 'tags', { multiEntry: true })
        memStore.createIndex('importance', 'importance')
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
export async function saveChatMessages(db: ShadowLearnDB, lessonId: string, messages: UIMessage[]): Promise<void> {
  await db.put('chats', messages, lessonId)
}

export async function getChatMessages(db: ShadowLearnDB, lessonId: string): Promise<UIMessage[] | undefined> {
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

// Vocabulary by ID (needed for SM-2 review sessions)
export async function getVocabEntryById(db: ShadowLearnDB, id: string): Promise<VocabEntry | undefined> {
  return db.get('vocabulary', id)
}

// Spaced Repetition
export async function getSpacedRepetitionItem(db: ShadowLearnDB, itemId: string) {
  return db.get('spaced-repetition', itemId)
}
export async function saveSpacedRepetitionItem(db: ShadowLearnDB, item: SpacedRepetitionItem) {
  await db.put('spaced-repetition', item)
}
export async function deleteSpacedRepetitionItem(db: ShadowLearnDB, itemId: string) {
  await db.delete('spaced-repetition', itemId)
}
export async function getDueItems(db: ShadowLearnDB, today: string): Promise<SpacedRepetitionItem[]> {
  return db.getAllFromIndex('spaced-repetition', 'by-due', IDBKeyRange.upperBound(today))
}

// Progress Stats
export async function getProgressStats(db: ShadowLearnDB) {
  return db.get('progress-db', 'global')
}
export async function saveProgressStats(db: ShadowLearnDB, stats: ProgressStats) {
  await db.put('progress-db', stats, 'global')
}

// Mastery
export async function getMasteryData(db: ShadowLearnDB) {
  return db.get('mastery-db', 'global')
}
export async function saveMasteryData(db: ShadowLearnDB, data: MasteryData) {
  await db.put('mastery-db', data, 'global')
}

// Mistakes
export async function getErrorPattern(db: ShadowLearnDB, patternId: string) {
  return db.get('mistakes-db', patternId)
}
export async function deleteErrorPattern(db: ShadowLearnDB, patternId: string) {
  await db.delete('mistakes-db', patternId)
}
export async function saveErrorPattern(db: ShadowLearnDB, pattern: ErrorPattern) {
  await db.put('mistakes-db', pattern)
}
export async function getRecentMistakes(db: ShadowLearnDB, limit = 20): Promise<ErrorPattern[]> {
  const all = await db.getAll('mistakes-db')
  return all.sort((a, b) => b.lastOccurred.localeCompare(a.lastOccurred)).slice(0, limit)
}

// Session Logs
export async function saveSessionLog(db: ShadowLearnDB, log: SessionLog) {
  await db.put('session-logs', log)
}

// Learner Profile
export async function getLearnerProfile(db: ShadowLearnDB): Promise<LearnerProfile | undefined> {
  return db.get('learner-profile', 'profile')
}

export async function saveLearnerProfile(db: ShadowLearnDB, profile: LearnerProfile): Promise<void> {
  await db.put('learner-profile', profile, 'profile')
}

// Agent Memory
export async function saveAgentMemory(db: ShadowLearnDB, memory: AgentMemory): Promise<void> {
  await db.put('agent-memory', memory)
}

export async function getAgentMemory(db: ShadowLearnDB, id: string): Promise<AgentMemory | undefined> {
  return db.get('agent-memory', id)
}

export async function getAllAgentMemories(db: ShadowLearnDB): Promise<AgentMemory[]> {
  return db.getAll('agent-memory')
}

export async function getAgentMemoriesByTag(db: ShadowLearnDB, tag: string): Promise<AgentMemory[]> {
  return db.getAllFromIndex('agent-memory', 'tags', tag)
}

export async function deleteAgentMemory(db: ShadowLearnDB, id: string): Promise<void> {
  await db.delete('agent-memory', id)
}
