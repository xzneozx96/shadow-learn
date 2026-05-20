import type { UIMessage } from '@ai-sdk/react'
import type { DBSchema, IDBPDatabase } from 'idb'
import type { AppSettings, GrammarFeedback, LessonMeta, Segment, SessionEvaluation, ShadowingAudio, ShadowingBest, VocabEntry } from '../types'
import type { UserMaterial } from '../types/collection'
import type { StudioKind, StudioLocale, TipCardsRecord, TipChatRecord, TipCourse, TipNote, TipProgress, TipStudioRecord, TipTranscriptRecord } from '../types/tips'
import { openDB } from 'idb'

const DB_NAME = 'shadowlearn'
const DB_VERSION = 20

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

export type ThreadSurface = 'lesson' | 'global' | 'tip'

export interface ThreadRecord {
  id: string // canonical id: lessonId | '__global' | `${courseId}:${videoId}`
  surface: ThreadSurface
  ownerId: string | null // lessonId | null | `${courseId}:${videoId}`
  courseId?: string // tip only
  videoId?: string // tip only
  messages: UIMessage[]
  updatedAt: number // ms epoch
  createdAt: number
  latestSummaryGen?: number
}

export interface ThreadSummaryRecord {
  threadId: string
  generation: number
  summary: string
  coversThroughMessageId: string
  tokenBudget: number
  createdAt: number
}

export interface ExerciseStat {
  correct: number
  total: number
  lastAttempt: string // ISO date string
}

export interface DailyTask {
  id: string
  title: string
  createdDate: string // ISO date 'YYYY-MM-DD'
  completedDate: string | null // null = never; === todayISO() means done today
}

export interface AgentLog {
  id?: number // auto-increment primary key
  lessonId: string
  timestamp: string // ISO
  durationMs: number
  messageCount: number
  toolCallCount: number
  errorCount: number
  exercisesCompleted: number
}

export interface SpeakSession {
  sessionId: string
  lessonId: string
  startedAt: string
  endedAt: string | null
  durationSeconds: number
  status: 'active' | 'completed' | 'abandoned'
  transcript: SpeakTurn[]
  transcriptText: string
  evaluation: SessionEvaluation | null
  // Grammar feedback keyed by SpeakTurn.id. Optional so v8 rows read cleanly.
  feedbacks?: Record<string, GrammarFeedback>
  promptVersion: string
  modelId: string
  // v10
  targetLanguage: string
  proficiencyLevel: 'beginner' | 'intermediate' | 'advanced'
  levelLabel: string
  situationTitle: string
  userGoal: string
}

export interface SpeakTurn {
  // Stable turn ID (sourced from LiveKit ReceivedMessage.id during a live session).
  // Optional on the type so v8 rows without IDs remain readable.
  id?: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  translation?: string
  romanization?: string
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
  'exercise-stats': {
    key: string // 'vocabId:exerciseType'
    value: ExerciseStat
  }
  'daily-tasks': {
    key: string
    value: DailyTask
  }
  'agent-logs': {
    key: number // autoincrement
    value: AgentLog
  }
  'speak-sessions': {
    key: string
    value: SpeakSession
    indexes: { 'by-date': string }
  }
  'word-breakdowns': {
    key: string
    value: import('../types').WordBreakdown
  }
  'shadowing-bests': {
    key: [string, string]
    value: ShadowingBest
    indexes: { 'by-lesson': string }
  }
  'shadowing-audio': {
    key: [string, string]
    value: ShadowingAudio
    indexes: { 'by-lesson': string }
  }
  'tip-courses': {
    key: string
    value: TipCourse
  }
  'tip-progress': {
    key: string
    value: TipProgress
    indexes: { 'by-course': string }
  }
  'tip-transcripts': {
    key: string
    value: TipTranscriptRecord
  }
  'tip-chats': {
    key: string
    value: TipChatRecord
    indexes: { 'by-course': string }
  }
  'tip-studio': {
    key: string
    value: TipStudioRecord
  }
  'tip-cards': {
    key: string
    value: TipCardsRecord
  }
  'tip-notes': {
    key: [string, string] // [videoId, id]
    value: TipNote
    indexes: { 'by-video': string }
  }
  'user-materials': {
    key: string
    value: UserMaterial
    indexes: { 'by-external': string, 'by-skill': string }
  }
  'threads': {
    key: string
    value: ThreadRecord
    indexes: { 'by-surface': string, 'by-owner': string, 'by-updated': number }
  }
  'thread-summaries': {
    key: [string, number]
    value: ThreadSummaryRecord
    indexes: { 'by-thread': string }
  }
}

export type ShadowLearnDB = IDBPDatabase<ShadowLearnSchema>

export async function initDB(onTerminated?: () => void): Promise<ShadowLearnDB> {
  return openDB<ShadowLearnSchema>(DB_NAME, DB_VERSION, {
    terminated: onTerminated,
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
      if (oldVersion < 7) {
        db.createObjectStore('exercise-stats')
        db.createObjectStore('agent-logs', { keyPath: 'id', autoIncrement: true })
      }
      if (oldVersion < 8) {
        const ssStore = db.createObjectStore('speak-sessions', { keyPath: 'sessionId' })
        ssStore.createIndex('by-date', 'startedAt', { unique: false })
      }
      if (oldVersion < 9) {
        // Additive schema change: transcript turns gain optional `id`, session
        // gains optional `feedbacks` map. Defaults applied at read sites; no row
        // rewrite needed. Version bump forces older tabs to close their handle.
      }
      if (oldVersion < 10) {
        const store = transaction.objectStore('speak-sessions')
        let cursor = await store.openCursor()
        while (cursor) {
          const s = cursor.value as any
          await cursor.update({
            ...s,
            targetLanguage: s.targetLanguage ?? 'zh-CN',
            proficiencyLevel: s.proficiencyLevel ?? 'intermediate',
            levelLabel: s.levelLabel ?? 'HSK 3-4',
            situationTitle: s.situationTitle ?? 'Casual Chat',
            userGoal: s.userGoal ?? '',
          })
          cursor = await cursor.continue()
        }
      }
      if (oldVersion < 11) {
        db.createObjectStore('word-breakdowns', { keyPath: 'word' })
      }
      if (oldVersion < 12) {
        // Recovery migration: some installs reached v11 without the
        // `word-breakdowns` store (incomplete prior upgrade). Create
        // it idempotently here.
        if (!db.objectStoreNames.contains('word-breakdowns'))
          db.createObjectStore('word-breakdowns', { keyPath: 'word' })
      }
      if (oldVersion < 13) {
        const bestsStore = db.createObjectStore('shadowing-bests', { keyPath: ['lessonId', 'segmentId'] })
        bestsStore.createIndex('by-lesson', 'lessonId', { unique: false })
        const audioStore = db.createObjectStore('shadowing-audio', { keyPath: ['lessonId', 'segmentId'] })
        audioStore.createIndex('by-lesson', 'lessonId', { unique: false })
      }
      if (oldVersion < 14) {
        db.createObjectStore('daily-tasks', { keyPath: 'id' })
      }
      if (oldVersion < 15) {
        db.createObjectStore('tip-courses', { keyPath: 'id' })
        const tp = db.createObjectStore('tip-progress', { keyPath: 'key' })
        tp.createIndex('by-course', 'courseId', { unique: false })
        db.createObjectStore('tip-transcripts', { keyPath: 'videoId' })
        const tc = db.createObjectStore('tip-chats', { keyPath: 'key' })
        tc.createIndex('by-course', 'courseId', { unique: false })
      }
      if (oldVersion < 16) {
        db.createObjectStore('tip-studio', { keyPath: 'key' })
        db.createObjectStore('tip-cards', { keyPath: 'key' })

        // Migrate existing tip-chats rows: add kind='tutor' and rewrite key
        // from `${courseId}:${videoId}` to `${courseId}:${videoId}:tutor`
        // so future Quiz chat (kind='quiz') will not overwrite tutor history.
        const chatStore = transaction.objectStore('tip-chats')
        let cursor = await chatStore.openCursor()
        const migrated: Array<{ oldKey: string, row: any }> = []
        while (cursor) {
          const row = cursor.value as any
          if (!row.kind)
            migrated.push({ oldKey: cursor.key as string, row })
          cursor = await cursor.continue()
        }
        for (const { oldKey, row } of migrated) {
          await chatStore.delete(oldKey)
          const newKey = `${row.courseId}:${row.videoId}:tutor`
          await chatStore.put({ ...row, key: newKey, kind: 'tutor' })
        }
      }
      if (oldVersion < 17) {
        const notesStore = db.createObjectStore('tip-notes', { keyPath: ['videoId', 'id'] })
        notesStore.createIndex('by-video', 'videoId', { unique: false })
      }
      if (oldVersion < 18) {
        // Collapse `${courseId}:${videoId}:tutor` keys back to `${courseId}:${videoId}`
        // and drop any `:quiz` records (Quiz feature removed; tutor + guided
        // share one history per video now).
        const chatStore = transaction.objectStore('tip-chats')
        let cursor = await chatStore.openCursor()
        const ops: Array<{ oldKey: string, newRow: any | null }> = []
        while (cursor) {
          const oldKey = cursor.key as string
          const row = cursor.value as any
          if (oldKey.endsWith(':quiz')) {
            ops.push({ oldKey, newRow: null })
          }
          else if (oldKey.endsWith(':tutor')) {
            const newKey = oldKey.slice(0, -':tutor'.length)
            const { kind: _kind, ...rest } = row
            ops.push({ oldKey, newRow: { ...rest, key: newKey } })
          }
          cursor = await cursor.continue()
        }
        for (const { oldKey, newRow } of ops) {
          await chatStore.delete(oldKey)
          if (newRow)
            await chatStore.put(newRow)
        }
      }
      if (oldVersion < 19) {
        const store = db.createObjectStore('user-materials', { keyPath: 'id' })
        store.createIndex('by-external', 'externalId', { unique: true })
        store.createIndex('by-skill', 'skill', { unique: false })
      }
      if (oldVersion < 20) {
        const threadsStore = db.createObjectStore('threads', { keyPath: 'id' })
        threadsStore.createIndex('by-surface', 'surface', { unique: false })
        threadsStore.createIndex('by-owner', 'ownerId', { unique: false })
        threadsStore.createIndex('by-updated', 'updatedAt', { unique: false })
        const summariesStore = db.createObjectStore('thread-summaries', { keyPath: ['threadId', 'generation'] })
        summariesStore.createIndex('by-thread', 'threadId', { unique: false })

        const now = Date.now()
        const newThreads: ThreadRecord[] = []

        if (db.objectStoreNames.contains('chats')) {
          const chatsStore = transaction.objectStore('chats')
          let c1 = await chatsStore.openCursor()
          while (c1) {
            const id = c1.key as string
            const messages = (c1.value as UIMessage[]) ?? []
            const surface: ThreadSurface = id === '__global' ? 'global' : 'lesson'
            newThreads.push({
              id,
              surface,
              ownerId: surface === 'lesson' ? id : null,
              messages,
              updatedAt: now,
              createdAt: now,
            })
            c1 = await c1.continue()
          }
        }

        if (db.objectStoreNames.contains('tip-chats')) {
          const tipStore = transaction.objectStore('tip-chats')
          let c2 = await tipStore.openCursor()
          while (c2) {
            const row = c2.value as { key: string, courseId: string, videoId: string, messages: UIMessage[], updatedAt: string }
            const updatedAtMs = Date.parse(row.updatedAt) || now
            newThreads.push({
              id: row.key,
              surface: 'tip',
              ownerId: row.key,
              courseId: row.courseId,
              videoId: row.videoId,
              messages: row.messages ?? [],
              updatedAt: updatedAtMs,
              createdAt: updatedAtMs,
            })
            c2 = await c2.continue()
          }
        }

        const out = transaction.objectStore('threads')
        for (const t of newThreads) {
          try {
            await out.add(t)
          }
          catch {
            // Already migrated; partial-crash re-run is a no-op
          }
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
export async function saveChatMessages(db: ShadowLearnDB, lessonId: string, messages: UIMessage[]): Promise<void> {
  await db.put('chats', messages, lessonId)
}

export async function getChatMessages(db: ShadowLearnDB, lessonId: string): Promise<UIMessage[] | undefined> {
  return db.get('chats', lessonId)
}

export async function deleteChatMessages(db: ShadowLearnDB, lessonId: string): Promise<void> {
  await db.delete('chats', lessonId)
}

// Threads (unified chat store) — DB v20

export async function getThread(db: ShadowLearnDB, id: string): Promise<ThreadRecord | undefined> {
  return db.get('threads', id)
}

export async function saveThreadMessages(
  db: ShadowLearnDB,
  id: string,
  messages: UIMessage[],
  surface: ThreadSurface,
  ownerId: string | null,
  courseId?: string,
  videoId?: string,
): Promise<void> {
  const existing = await db.get('threads', id)
  const now = Date.now()
  await db.put('threads', {
    id,
    surface,
    ownerId,
    courseId: courseId ?? existing?.courseId,
    videoId: videoId ?? existing?.videoId,
    messages,
    updatedAt: now,
    createdAt: existing?.createdAt ?? now,
    latestSummaryGen: existing?.latestSummaryGen,
  })
}

export async function deleteThread(db: ShadowLearnDB, id: string): Promise<void> {
  await db.delete('threads', id)
  const summaries = await db.getAllFromIndex('thread-summaries', 'by-thread', id)
  await Promise.all(summaries.map(s => db.delete('thread-summaries', [s.threadId, s.generation])))
}

export async function listThreadsBySurface(db: ShadowLearnDB, surface: ThreadSurface): Promise<ThreadRecord[]> {
  return db.getAllFromIndex('threads', 'by-surface', surface)
}

export async function putThreadSummary(db: ShadowLearnDB, summary: ThreadSummaryRecord): Promise<void> {
  await db.put('thread-summaries', summary)
  const t = await db.get('threads', summary.threadId)
  if (t) {
    await db.put('threads', { ...t, latestSummaryGen: summary.generation })
  }
}

export async function getLatestSummary(db: ShadowLearnDB, threadId: string): Promise<ThreadSummaryRecord | undefined> {
  const all = await db.getAllFromIndex('thread-summaries', 'by-thread', threadId)
  if (all.length === 0)
    return undefined
  return all.sort((a, b) => b.generation - a.generation)[0]
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
    deleteSpeakingBestsByLesson(db, lessonId),
    deleteSpeakingAudioByLesson(db, lessonId),
  ])
}

// TTS audio cache (keyed by "language::text" to avoid cross-language collisions)
function _ttsCacheKey(text: string, language: string): string {
  return `${language}::${text}`
}

export async function getTTSCache(db: ShadowLearnDB, text: string, language: string): Promise<Blob | undefined> {
  return db.get('tts-cache', _ttsCacheKey(text, language))
}

export async function saveTTSCache(db: ShadowLearnDB, text: string, blob: Blob, language: string): Promise<void> {
  await db.put('tts-cache', blob, _ttsCacheKey(text, language))
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

export async function getAllSessionLogs(db: ShadowLearnDB): Promise<SessionLog[]> {
  return db.getAll('session-logs')
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

// Exercise Stats

export async function upsertExerciseStat(
  db: ShadowLearnDB,
  key: string,
  correct: boolean,
): Promise<void> {
  const existing = await db.get('exercise-stats', key)
  const today = new Date().toISOString().split('T')[0]
  if (existing) {
    await db.put('exercise-stats', {
      correct: existing.correct + (correct ? 1 : 0),
      total: existing.total + 1,
      lastAttempt: today,
    }, key)
  }
  else {
    await db.put('exercise-stats', {
      correct: correct ? 1 : 0,
      total: 1,
      lastAttempt: today,
    }, key)
  }
}

export async function getExerciseAccuracy(
  db: ShadowLearnDB,
): Promise<Record<string, { accuracy: number, attempts: number }>> {
  const all = await db.getAll('exercise-stats')
  const keys = await db.getAllKeys('exercise-stats')
  const byType: Record<string, { correct: number, total: number }> = {}

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i] as string
    const colonIdx = key.lastIndexOf(':')
    if (colonIdx === -1)
      continue
    const exerciseType = key.slice(colonIdx + 1)
    const stat = all[i]
    if (!byType[exerciseType])
      byType[exerciseType] = { correct: 0, total: 0 }
    byType[exerciseType].correct += stat.correct
    byType[exerciseType].total += stat.total
  }

  const result: Record<string, { accuracy: number, attempts: number }> = {}
  for (const [type, agg] of Object.entries(byType)) {
    result[type] = {
      accuracy: agg.total > 0 ? agg.correct / agg.total : 0,
      attempts: agg.total,
    }
  }
  return result
}

// Agent Logs

export async function appendAgentLog(
  db: ShadowLearnDB,
  log: Omit<AgentLog, 'id'>,
): Promise<void> {
  await db.add('agent-logs', log as AgentLog)
}

export async function saveBreakdown(
  db: ShadowLearnDB,
  entry: import('../types').WordBreakdown,
): Promise<void> {
  await db.put('word-breakdowns', entry)
}

export async function getBreakdown(
  db: ShadowLearnDB,
  word: string,
): Promise<import('../types').WordBreakdown | undefined> {
  return db.get('word-breakdowns', word)
}

export async function deleteBreakdown(db: ShadowLearnDB, word: string): Promise<void> {
  await db.delete('word-breakdowns', word)
}

// Shadowing personal bests

export async function getSpeakingBest(db: ShadowLearnDB, lessonId: string, segmentId: string): Promise<ShadowingBest | undefined> {
  return db.get('shadowing-bests', [lessonId, segmentId])
}

export async function saveSpeakingBest(db: ShadowLearnDB, best: ShadowingBest): Promise<void> {
  await db.put('shadowing-bests', best)
}

export async function getAllSpeakingBestsByLesson(db: ShadowLearnDB, lessonId: string): Promise<ShadowingBest[]> {
  return db.getAllFromIndex('shadowing-bests', 'by-lesson', lessonId)
}

export async function deleteSpeakingBestsByLesson(db: ShadowLearnDB, lessonId: string): Promise<void> {
  const all = await getAllSpeakingBestsByLesson(db, lessonId)
  await Promise.all(all.map(b => db.delete('shadowing-bests', [b.lessonId, b.segmentId])))
}

export async function getSpeakingAudio(db: ShadowLearnDB, lessonId: string, segmentId: string): Promise<Blob | undefined> {
  const record = await db.get('shadowing-audio', [lessonId, segmentId])
  return record?.blob
}

export async function saveSpeakingAudio(db: ShadowLearnDB, lessonId: string, segmentId: string, blob: Blob): Promise<void> {
  await db.put('shadowing-audio', { lessonId, segmentId, blob })
}

export async function deleteSpeakingAudioByLesson(db: ShadowLearnDB, lessonId: string): Promise<void> {
  const all = await db.getAllFromIndex('shadowing-audio', 'by-lesson', lessonId)
  await Promise.all(all.map(a => db.delete('shadowing-audio', [a.lessonId, a.segmentId])))
}

// Daily Tasks

export async function getDailyTasks(db: ShadowLearnDB): Promise<DailyTask[]> {
  return db.getAll('daily-tasks')
}

export async function saveDailyTask(db: ShadowLearnDB, task: DailyTask): Promise<void> {
  await db.put('daily-tasks', task)
}

export async function deleteDailyTask(db: ShadowLearnDB, id: string): Promise<void> {
  await db.delete('daily-tasks', id)
}

// Tips LMS accessors

export async function putTipCourse(db: ShadowLearnDB, course: TipCourse): Promise<void> {
  await db.put('tip-courses', course)
}

export async function getTipCourse(db: ShadowLearnDB, courseId: string): Promise<TipCourse | undefined> {
  return db.get('tip-courses', courseId)
}

export async function putTipProgress(db: ShadowLearnDB, progress: TipProgress): Promise<void> {
  await db.put('tip-progress', progress)
}

export async function getTipProgress(db: ShadowLearnDB, key: string): Promise<TipProgress | undefined> {
  return db.get('tip-progress', key)
}

export async function listTipProgressForCourse(db: ShadowLearnDB, courseId: string): Promise<TipProgress[]> {
  return db.getAllFromIndex('tip-progress', 'by-course', courseId)
}

export async function putTipTranscript(db: ShadowLearnDB, record: TipTranscriptRecord): Promise<void> {
  await db.put('tip-transcripts', record)
}

export async function getTipTranscript(db: ShadowLearnDB, videoId: string): Promise<TipTranscriptRecord | undefined> {
  return db.get('tip-transcripts', videoId)
}

export async function putTipChat(db: ShadowLearnDB, chat: TipChatRecord): Promise<void> {
  await db.put('tip-chats', chat)
}

export async function getTipChat(db: ShadowLearnDB, key: string): Promise<TipChatRecord | undefined> {
  return db.get('tip-chats', key)
}

// Tips B2 — composite-key helpers and accessors for tip-studio + tip-cards.

export function studioKey(videoId: string, kind: StudioKind, locale: StudioLocale): string {
  return `${videoId}:${kind}:${locale}`
}

export function cardsKey(videoId: string, locale: StudioLocale): string {
  return `${videoId}:${locale}`
}

export function chatKey(courseId: string, videoId: string): string {
  return `${courseId}:${videoId}`
}

export async function getTipStudio(db: ShadowLearnDB, key: string): Promise<TipStudioRecord | undefined> {
  return db.get('tip-studio', key)
}

export async function putTipStudio(db: ShadowLearnDB, record: TipStudioRecord): Promise<void> {
  await db.put('tip-studio', record)
}

export async function getTipCards(db: ShadowLearnDB, key: string): Promise<TipCardsRecord | undefined> {
  return db.get('tip-cards', key)
}

export async function putTipCards(db: ShadowLearnDB, record: TipCardsRecord): Promise<void> {
  await db.put('tip-cards', record)
}

export async function putTipNote(db: ShadowLearnDB, note: TipNote): Promise<void> {
  await db.put('tip-notes', note)
}

export async function getTipNotesForVideo(db: ShadowLearnDB, videoId: string): Promise<TipNote[]> {
  const rows = await db.getAllFromIndex('tip-notes', 'by-video', videoId)
  return rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export async function deleteTipNote(db: ShadowLearnDB, videoId: string, id: string): Promise<void> {
  await db.delete('tip-notes', [videoId, id])
}

// User-registered materials
export async function listUserMaterials(db: ShadowLearnDB): Promise<UserMaterial[]> {
  return db.getAll('user-materials')
}

export async function getUserMaterialByExternalId(
  db: ShadowLearnDB,
  externalId: string,
): Promise<UserMaterial | undefined> {
  return db.getFromIndex('user-materials', 'by-external', externalId)
}

export async function putUserMaterial(db: ShadowLearnDB, m: UserMaterial): Promise<void> {
  await db.put('user-materials', m)
}

export async function deleteUserMaterial(db: ShadowLearnDB, id: string): Promise<void> {
  await db.delete('user-materials', id)
}
