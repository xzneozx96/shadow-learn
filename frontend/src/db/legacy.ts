import type { UIMessage } from '@ai-sdk/react'
import type { DBSchema, IDBPDatabase } from 'idb'
import type { UserMaterial } from '@/features/learning-materials/domain/collection'
import type { TipCardsRecord, TipChatRecord, TipCourse, TipNote, TipProgress, TipStudioRecord, TipTranscriptRecord } from '@/features/learning-materials/domain/tips'
import type { AppSettings, GrammarFeedback, LessonMeta, Segment, SessionEvaluation, ShadowingAudio, ShadowingBest, VocabEntry } from '@/shared/types'
import { openDB } from 'idb'

const DB_NAME = 'shadowlearn'
const DB_VERSION = 21

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
}

export interface ThreadSummaryRecord {
  threadId: string
  summary: string
  coversThroughMessageId: string
  /**
   * Position of the cut in the history at summary time. Lets compaction trim by
   * index when the id can't be found (paginated/restored threads), instead of
   * falling back to sending the full untrimmed history. Optional for back-compat.
   */
  coversThroughIndex?: number
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
    value: import('@/shared/types').WordBreakdown
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
    key: string
    value: ThreadSummaryRecord
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
      if (oldVersion < 21) {
        // Simplify thread-summaries: drop append-only log (keyed by [threadId, generation])
        // in favour of a single record per thread keyed by threadId.
        // Old generations are never read; getLatestSummary always took the highest one.
        if (db.objectStoreNames.contains('thread-summaries'))
          db.deleteObjectStore('thread-summaries')
        db.createObjectStore('thread-summaries', { keyPath: 'threadId' })
      }
    },
  })
}
