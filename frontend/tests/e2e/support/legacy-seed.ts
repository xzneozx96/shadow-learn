import type { Page } from '@playwright/test'

export interface BlobSpec {
  $blob: { size: number, type: string, fill: number }
}

export interface SeedRow {
  key?: IDBValidKey
  value: unknown
}

export interface LegacyFixture {
  version: 10 | 21
  stores: Record<string, SeedRow[]>
  keys?: { pin: string, plaintext: Record<string, string> }
}

export const LESSON_A = '6f1c2b1e-8d4f-4c1a-9a51-3f3d2c1b0a99'
export const LESSON_B = '0b7e5a40-2f7c-4a9e-9d7b-8f5b3c2e1d10'
export const LEGACY_LESSON = 'lesson_1710400000000'
export const PIN = '4821'

function blob(size: number, type: string, fill: number): BlobSpec {
  return { $blob: { size, type, fill } }
}

function lesson(id: string, title: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    title,
    source: 'youtube',
    sourceUrl: `https://youtu.be/${id.slice(0, 8)}`,
    duration: 5.25,
    segmentCount: 2,
    translationLanguages: ['en'],
    sourceLanguage: 'zh-CN',
    createdAt: '2026-05-01T08:30:00.123Z',
    lastOpenedAt: '2026-06-01T09:00:00.000Z',
    progressSegmentId: 's2',
    tags: ['greetings'],
    ...extra,
  }
}

function segments(prefix: string) {
  return [
    { id: 's1', start: 0, end: 2.5, text: `${prefix}你好`, romanization: 'nǐ hǎo', translations: { en: 'hello' }, words: [{ word: '你好', romanization: 'nǐ hǎo', meaning: 'hello', usage: '' }] },
    { id: 's2', start: 2.5, end: 5.25, text: `${prefix}谢谢`, romanization: 'xiè xie', translations: { en: 'thanks' }, words: [] },
  ]
}

function vocab(n: number, lessonId: string) {
  return {
    id: `vocab-${lessonId.slice(0, 6)}-${n}`,
    word: `词${n}`,
    romanization: 'cí',
    meaning: `word ${n}`,
    usage: '',
    sourceLessonId: lessonId,
    sourceLessonTitle: 'Greetings',
    sourceSegmentId: 's1',
    sourceSegmentText: '你好',
    sourceSegmentTranslation: 'hello',
    sourceLanguage: 'zh-CN',
    createdAt: `2026-05-0${1 + (n % 9)}T10:00:00.000Z`,
  }
}

export interface FixtureOptions {
  variant?: 'A' | 'B'
  version?: 10 | 21
  withKeys?: boolean
  videoBytes?: number
  recordings?: number
  vocabulary?: number
  extraLessons?: number
  totalSessions?: number
  lessonId?: string
  legacyLessonId?: string
}

export function legacyFixture(options: FixtureOptions = {}): LegacyFixture {
  const {
    variant = 'A',
    version = 21,
    withKeys = false,
    videoBytes = 300_000,
    recordings = 1,
    vocabulary = 3,
    extraLessons = 0,
    totalSessions = 3,
    legacyLessonId = LEGACY_LESSON,
  } = options
  const main = options.lessonId ?? (variant === 'A' ? LESSON_A : LESSON_B)
  const title = variant === 'A' ? 'Greetings, renamed' : 'Second device lesson'
  const extras = Array.from({ length: extraLessons }, (_, i) => `${main.slice(0, 24)}${String(i).padStart(12, '0')}`)

  const stores: Record<string, SeedRow[]> = {
    'lessons': [
      { value: lesson(main, title) },
      ...extras.map(id => ({ value: lesson(id, `Lesson ${id.slice(-3)}`) })),
    ],
    'segments': [
      { key: main, value: segments(variant) },
      ...extras.map(id => ({ key: id, value: segments(id.slice(-3)) })),
    ],
    'videos': [{ key: main, value: blob(videoBytes, 'video/mp4', 7) }],
    'settings': [{ key: 'settings', value: { translationLanguage: 'vi', uiLanguage: variant === 'A' ? 'en' : 'vi' } }],
    'crypto': [],
    'tts-cache': [{ key: 'tts-1', value: blob(64, 'audio/mpeg', 1) }],
    'chats': [],
    'vocabulary': Array.from({ length: vocabulary }, (_, n) => ({ value: vocab(n, main) })),
    'learner-profile': [{ key: 'profile', value: { name: 'Ada', nativeLanguage: 'vi', targetLanguage: 'zh-CN', currentLevel: 'HSK 2', dailyGoalMinutes: 15, currentStreakDays: 2, totalSessions, totalStudyMinutes: 42.5, lastStudyDate: '2026-06-01', profileCreated: '2026-03-20T00:00:00.000Z' } }],
    'progress-db': [{ key: 'global', value: { totalSessions, totalExercises: 20, totalCorrect: 15, totalIncorrect: 5, accuracyRate: 0.75, totalStudyMinutes: 42.5, accuracyTrend: [{ date: '2026-06-01', accuracy: 0.75, exercises: 20 }], skillProgress: { writing: { sessions: 1, accuracy: 0.5, lastPracticed: null }, speaking: { sessions: 2, accuracy: 1, lastPracticed: '2026-06-01' }, vocabulary: { sessions: 0, accuracy: 0, lastPracticed: null }, reading: { sessions: 0, accuracy: 0, lastPracticed: null }, listening: { sessions: 0, accuracy: 0, lastPracticed: null } } } }],
    'mastery-db': [{ key: 'global', value: { writing: { masteryLevel: 1, confidenceScore: 0.5, totalPracticeTime: 10, lastPracticed: null }, speaking: { masteryLevel: 2, confidenceScore: 0.25, totalPracticeTime: 3.5, lastPracticed: '2026-06-01' }, vocabulary: { masteryLevel: 0, confidenceScore: 0, totalPracticeTime: 0, lastPracticed: null }, reading: { masteryLevel: 0, confidenceScore: 0, totalPracticeTime: 0, lastPracticed: null }, listening: { masteryLevel: 0, confidenceScore: 0, totalPracticeTime: 0, lastPracticed: null } } }],
    'spaced-repetition': [{ value: { itemId: vocab(0, main).id, itemType: 'vocabulary', easinessFactor: 2.5, intervalDays: 1, repetitions: 1, consecutiveCorrect: 1, consecutiveIncorrect: 0, masteryLevel: 1, dueDate: '2026-06-02', lastReviewed: '2026-06-01', reviewHistory: [{ date: '2026-06-01', quality: 4, intervalDays: 1 }] } }],
    'session-logs': [{ value: { sessionId: `session-${variant}`, date: '2026-06-01', durationMinutes: 12, skillPracticed: 'mixed', exercisesCompleted: 10, exercisesCorrect: 8, accuracy: 0.8, itemsMastered: [] } }],
    'mistakes-db': [{ value: { patternId: 'tone:ma', frequency: 2, lastOccurred: '2026-06-01T10:00:00.000Z', examples: [{ userAnswer: 'mà', correctAnswer: 'mǎ', context: '马', date: '2026-06-01' }] } }],
    'agent-memory': [{ value: { id: `memory-${variant}`, content: 'Likes tea', tags: ['food', 'preference'], importance: 2, createdAt: 1717200000000, lastAccessedAt: 1717200000123 } }],
    'exercise-stats': [
      { key: `${vocab(0, main).id}:cloze`, value: { correct: 3, total: 4, lastAttempt: '2026-06-01' } },
      { key: 'vocab:with:colons:dictation', value: { correct: 1, total: 1, lastAttempt: '2026-06-01' } },
    ],
    'agent-logs': [],
    'speak-sessions': [{ value: { sessionId: `speak-${variant}`, lessonId: main, startedAt: '2026-06-01T10:00:00.000Z', endedAt: '2026-06-01T10:05:00.000Z', durationSeconds: 300, status: 'completed', transcript: [{ role: 'user', content: '你好', timestamp: '2026-06-01T10:00:01.000Z' }], transcriptText: '你好', evaluation: null, promptVersion: 'v3', modelId: 'gemini', targetLanguage: 'zh-CN', proficiencyLevel: 'intermediate', levelLabel: 'HSK 3-4', situationTitle: 'Casual Chat', userGoal: '' } }],
  }

  if (version === 21) {
    stores.lessons.push(
      { value: lesson(legacyLessonId, 'March lesson', { source: 'upload', sourceUrl: null }) },
      { value: lesson(`${main.slice(0, 30)}999999`, 'Still processing', { status: 'processing', jobId: 'job-1' }) },
    )
    stores.segments.push({ key: legacyLessonId, value: segments('M') })
    stores.videos.push({ key: legacyLessonId, value: blob(4_000, 'audio/mpeg', 3) })
    stores.vocabulary.push({ value: vocab(99, legacyLessonId) })
    stores['agent-memory'].push({ value: { id: `memory-legacy-${variant}`, content: 'Uploaded a lesson', tags: ['lesson'], importance: 1, createdAt: 1710400000000, lastAccessedAt: 1710400000000, lessonId: legacyLessonId } })
    stores['agent-logs'].push({ value: { lessonId: main, timestamp: '2026-06-01T10:00:00.000Z', durationMs: 10, messageCount: 1, toolCallCount: 0, errorCount: 0, exercisesCompleted: 0 } })
    stores['daily-tasks'] = [{ value: { id: `task-${variant}`, title: 'Review tones', createdDate: '2026-06-01', completedDate: null } }]
    stores['word-breakdowns'] = [
      { value: { word: '你好', sourceLanguage: 'zh-CN', characters: [], story: 'A person greets a friend at the door.', storyLanguage: 'vi', generatedAt: '2026-06-01T10:00:00.000Z' } },
      { value: { word: '谢谢', sourceLanguage: 'zh-CN', characters: [], story: null, storyLanguage: 'vi', generatedAt: null } },
    ]
    stores['shadowing-bests'] = [{ value: { lessonId: legacyLessonId, segmentId: 's1', score: 88, breakdown: { overall: { accuracy: 88, fluency: 80, completeness: 100, prosody: 70 }, words: [] }, recordedAt: '2026-06-01T10:00:00.000Z' } }]
    stores['shadowing-audio'] = [
      ...Array.from({ length: recordings }, (_, n) => ({ value: { lessonId: main, segmentId: `s${n + 1}`, blob: blob(20_000 + n, 'audio/webm', 11 + n) } })),
      { value: { lessonId: 'deleted-lesson', segmentId: 's1', blob: blob(100, 'audio/webm', 5) } },
    ]
    stores['tip-courses'] = [{ value: { id: 'course-1', title: 'Tones' } }]
    stores['tip-progress'] = [{ value: { key: 'course-1:video-1', courseId: 'course-1', videoId: 'video-1', watchedSec: 30, totalSec: 120, completed: false, lastSeenAt: '2026-06-01T10:00:00.000Z', title: 'Tone basics' } }]
    stores['tip-transcripts'] = [{ value: { videoId: 'video-1', text: 'transcript' } }]
    stores['tip-chats'] = []
    stores['tip-studio'] = [{ value: { key: 'video-1:en:summary', data: {} } }]
    stores['tip-cards'] = [{ value: { key: 'video-1:en', videoId: 'video-1', locale: 'en', generatedAt: '2026-06-01T10:00:00.000Z', cards: [
      { id: 'c1', front: 'What is tone 3?', rule: 'dip', example: 'mǎ', trap: null, state: 'known', updatedAt: '2026-06-01T10:00:00.000Z' },
      { id: 'c2', front: 'What is tone 4?', rule: 'fall', example: 'mà', trap: null, state: 'learning', updatedAt: '2026-06-01T11:00:00.000Z' },
    ] } }]
    stores['tip-notes'] = [{ value: { id: `note-${variant}`, videoId: 'video-1', title: 'Tone notes', html: '<p>dip</p>', createdAt: '2026-06-01T10:00:00.000Z', updatedAt: '2026-06-01T10:00:00.000Z', source: 'freeform' } }]
    stores['user-materials'] = [{ value: { id: `material-${variant}`, source: 'playlist', externalId: 'PL-shared', name: 'Tones playlist', skill: 'Pronunciation', instructionLanguage: 'English', contentType: 'tip', cachedMeta: { thumbnailUrl: null, channel: null, videoCount: 3, publishedAt: null, duration: null, viewCount: null }, createdAt: '2026-06-01T10:00:00.000Z' } }]
    stores.threads = [
      { value: { id: '__global', surface: 'global', ownerId: null, messages: [{ id: `g-${variant}`, role: 'user', parts: [{ type: 'text', text: 'hi' }] }], updatedAt: 1717200000000, createdAt: 1717200000000 } },
      { value: { id: legacyLessonId, surface: 'lesson', ownerId: legacyLessonId, messages: [], updatedAt: 1710400000000, createdAt: 1710400000000 } },
    ]
    stores['thread-summaries'] = [{ value: { threadId: legacyLessonId, summary: 'talked about the March lesson', coversThroughMessageId: 'm1', coversThroughIndex: 0, tokenBudget: 1000, createdAt: 1710400000000 } }]
  }
  else {
    stores.chats = [
      { key: '__global', value: [{ id: 'g-v10', role: 'user', parts: [{ type: 'text', text: 'hi from v10' }] }] },
      { key: main, value: [] },
    ]
  }

  return { version, stores, keys: withKeys ? { pin: PIN, plaintext: { openrouterApiKey: 'sk-or-dummy-key-0001', azureSpeechKey: 'dummy-azure-key-0002', azureSpeechRegion: 'eastus', googleRealtimeKey: 'dummy-google-key-0003' } } : undefined }
}

/** Self-contained, and it takes JSON, so it runs inside page.evaluate as well as in vitest. */
export async function seedLegacyDatabase(input: LegacyFixture | string): Promise<void> {
  const fixture: LegacyFixture = typeof input === 'string' ? JSON.parse(input) : input
  const LAYOUT: [name: string, since: number, keyPath: string | string[] | null, autoIncrement: boolean, indexes: [string, string | string[], boolean][]][] = [
    ['lessons', 1, 'id', false, []],
    ['segments', 1, null, false, []],
    ['videos', 1, null, false, []],
    ['chats', 1, null, false, []],
    ['settings', 1, null, false, []],
    ['crypto', 1, null, false, []],
    ['tts-cache', 2, null, false, []],
    ['vocabulary', 3, 'id', false, [['by-lesson', 'sourceLessonId', false], ['by-date', 'createdAt', false]]],
    ['learner-profile', 5, null, false, []],
    ['progress-db', 5, null, false, []],
    ['mastery-db', 5, null, false, []],
    ['spaced-repetition', 5, 'itemId', false, [['by-due', 'dueDate', false]]],
    ['session-logs', 5, 'sessionId', false, []],
    ['mistakes-db', 5, 'patternId', false, []],
    ['agent-memory', 6, 'id', false, [['tags', 'tags', true], ['importance', 'importance', false]]],
    ['exercise-stats', 7, null, false, []],
    ['agent-logs', 7, 'id', true, []],
    ['speak-sessions', 8, 'sessionId', false, [['by-date', 'startedAt', false]]],
    ['word-breakdowns', 11, 'word', false, []],
    ['shadowing-bests', 13, ['lessonId', 'segmentId'], false, [['by-lesson', 'lessonId', false]]],
    ['shadowing-audio', 13, ['lessonId', 'segmentId'], false, [['by-lesson', 'lessonId', false]]],
    ['daily-tasks', 14, 'id', false, []],
    ['tip-courses', 15, 'id', false, []],
    ['tip-progress', 15, 'key', false, [['by-course', 'courseId', false]]],
    ['tip-transcripts', 15, 'videoId', false, []],
    ['tip-chats', 15, 'key', false, [['by-course', 'courseId', false]]],
    ['tip-studio', 16, 'key', false, []],
    ['tip-cards', 16, 'key', false, []],
    ['tip-notes', 17, ['videoId', 'id'], false, [['by-video', 'videoId', false]]],
    ['user-materials', 19, 'id', false, [['by-external', 'externalId', false], ['by-skill', 'skill', false]]],
    ['threads', 20, 'id', false, [['by-surface', 'surface', false], ['by-owner', 'ownerId', false], ['by-updated', 'updatedAt', false]]],
    ['thread-summaries', 21, 'threadId', false, []],
  ]

  function materialize(value: unknown): unknown {
    if (Array.isArray(value))
      return value.map(materialize)
    if (value && typeof value === 'object') {
      const spec = (value as Partial<BlobSpec>).$blob
      if (spec)
        return new Blob([new Uint8Array(spec.size).fill(spec.fill)], { type: spec.type })
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, materialize(v)]))
    }
    return value
  }

  async function encrypt(pin: string, plaintext: Record<string, string>) {
    const salt = crypto.getRandomValues(new Uint8Array(16))
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveKey'])
    const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt'])
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(plaintext)))
    const copy = new ArrayBuffer(encrypted.byteLength)
    new Uint8Array(copy).set(new Uint8Array(encrypted))
    return { encrypted: copy, salt, iv }
  }

  const keys = fixture.keys ? await encrypt(fixture.keys.pin, fixture.keys.plaintext) : null
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('shadowlearn', fixture.version)
    request.onupgradeneeded = () => {
      for (const [name, since, keyPath, autoIncrement, indexes] of LAYOUT) {
        if (since > fixture.version || request.result.objectStoreNames.contains(name))
          continue
        const store = request.result.createObjectStore(name, keyPath === null ? { autoIncrement } : { keyPath, autoIncrement })
        for (const [index, path, multiEntry] of indexes)
          store.createIndex(index, path, { multiEntry })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  const names = Object.keys(fixture.stores).filter(name => db.objectStoreNames.contains(name) && fixture.stores[name].length > 0)
  if (keys)
    names.push('crypto')
  if (names.length === 0) {
    db.close()
    return
  }
  const tx = db.transaction([...new Set(names)], 'readwrite')
  for (const name of names) {
    for (const row of fixture.stores[name] ?? []) {
      const value = materialize(row.value)
      if (row.key === undefined)
        tx.objectStore(name).put(value)
      else
        tx.objectStore(name).put(value, row.key)
    }
  }
  if (keys)
    tx.objectStore('crypto').put(keys, 'keys')
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

export async function seedLegacy(page: Page, fixture: LegacyFixture): Promise<void> {
  await page.evaluate(seedLegacyDatabase, JSON.stringify(fixture))
}

export async function legacyDatabaseExists(page: Page): Promise<boolean> {
  return page.evaluate(async () => (await indexedDB.databases()).some(db => db.name === 'shadowlearn'))
}
