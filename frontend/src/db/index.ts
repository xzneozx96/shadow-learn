import type { UIMessage } from '@ai-sdk/react'
import type { DataClient } from './client'
import type { AgentLog, AgentMemory, DailyTask, ErrorPattern, LearnerProfile, MasteryData, ProgressStats, SessionLog, SpacedRepetitionItem, ThreadRecord, ThreadSummaryRecord, ThreadSurface } from './legacy'
import type { UserMaterial } from '@/features/learning-materials/domain/collection'
import type { StudioKind, StudioLocale, TipCardsRecord, TipChatRecord, TipCourse, TipNote, TipProgress, TipStudioRecord, TipTranscriptRecord } from '@/features/learning-materials/domain/tips'
import type { AppSettings, LessonMeta, Segment, ShadowingBest, VocabEntry } from '@/shared/types'
import { responseError } from '@/shared/lib/api'
import { API_BASE } from '@/shared/lib/config'

export type { ApiClient, DataClient } from './client'
export { createApiClient } from './client'
export type {
  AgentLog,
  AgentMemory,
  DailyAccuracy,
  DailyTask,
  ErrorPattern,
  ExerciseStat,
  LearnerProfile,
  MasteryData,
  MistakeExample,
  ProgressStats,
  SessionLog,
  ShadowLearnDB,
  SkillMastery,
  SkillStats,
  SpacedRepetitionItem,
  SpeakSession,
  SpeakTurn,
  ThreadRecord,
  ThreadSummaryRecord,
  ThreadSurface,
} from './legacy'
export { initDB } from './legacy'

type ClientLessonMeta = Partial<Pick<LessonMeta, 'progressSegmentId' | 'tags' | 'isDone'>>

export interface LessonSummary {
  id: string
  title: string
  source: LessonMeta['source']
  source_url: string | null
  duration: number
  source_language: string
  translation_languages: string[]
  created_at: string
  last_opened_at: string | null
  segment_count: number
  meta: ClientLessonMeta
}

interface LessonDetailResponse extends LessonSummary {
  segments: Segment[]
  video_url?: string
  audio_url?: string
}

export interface LessonMedia {
  id: string
  kind: 'video' | 'audio'
  url: string
}

export interface LessonDetail {
  meta: LessonMeta
  segments: Segment[]
  media: LessonMedia | null
}

const MEDIA_ID = /\/api\/media\/([^/?]+)/

export function toLessonMeta(summary: LessonSummary): LessonMeta {
  return {
    id: summary.id,
    title: summary.title,
    source: summary.source,
    sourceUrl: summary.source_url,
    duration: summary.duration,
    segmentCount: summary.segment_count,
    translationLanguages: summary.translation_languages,
    sourceLanguage: summary.source_language,
    createdAt: summary.created_at,
    lastOpenedAt: summary.last_opened_at ?? summary.created_at,
    progressSegmentId: summary.meta.progressSegmentId ?? null,
    tags: summary.meta.tags ?? [],
    isDone: summary.meta.isDone,
  }
}

export function toLessonMedia(kind: LessonMedia['kind'], path: string): LessonMedia {
  const id = MEDIA_ID.exec(path)?.[1]
  if (!id)
    throw new Error(`Not a media URL: ${path}`)
  return { id, kind, url: `${API_BASE}${path}` }
}

function lessonPath(id: string): string {
  return `/api/lessons/${encodeURIComponent(id)}`
}

function storePath(store: string, id: string): string {
  return `/api/store/${store}/${encodeURIComponent(id)}`
}

export async function getLesson(db: DataClient, id: string): Promise<LessonDetail | undefined> {
  const body = await db.api.get<LessonDetailResponse>(lessonPath(id))
  if (!body)
    return undefined
  const media = body.video_url
    ? toLessonMedia('video', body.video_url)
    : body.audio_url ? toLessonMedia('audio', body.audio_url) : null
  return { meta: toLessonMeta(body), segments: body.segments, media }
}

async function patchLesson(db: DataClient, id: string, body: object): Promise<void> {
  const res = await db.api.fetch(lessonPath(id), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok)
    throw await responseError(res, `Saving lesson failed: ${res.status}`)
}

export async function saveLessonMeta(db: DataClient, meta: LessonMeta): Promise<void> {
  const clientMeta: ClientLessonMeta = {
    progressSegmentId: meta.progressSegmentId,
    tags: meta.tags,
    isDone: meta.isDone,
  }
  await patchLesson(db, meta.id, { meta: clientMeta, last_opened_at: meta.lastOpenedAt })
}

export async function renameLesson(db: DataClient, id: string, title: string): Promise<void> {
  await patchLesson(db, id, { title })
}

export async function getLessonMeta(db: DataClient, id: string): Promise<LessonMeta | undefined> {
  return (await getLesson(db, id))?.meta
}

export async function getAllLessonMetas(db: DataClient): Promise<LessonMeta[]> {
  const summaries = await db.api.list<LessonSummary>('/api/lessons')
  return summaries.map(toLessonMeta)
}

export async function deleteLessonMeta(db: DataClient, id: string): Promise<void> {
  await db.api.del(lessonPath(id))
}

export async function getSegments(db: DataClient, lessonId: string): Promise<Segment[] | undefined> {
  return (await getLesson(db, lessonId))?.segments
}

export async function deleteSegments(_db: DataClient, _lessonId: string): Promise<void> {}

export async function getVideo(db: DataClient, lessonId: string): Promise<string | undefined> {
  return (await getLesson(db, lessonId))?.media?.url
}

export async function refreshMediaTicket(db: DataClient, mediaId: string): Promise<string> {
  const res = await db.api.fetch(`/api/media/${encodeURIComponent(mediaId)}/ticket`, { method: 'POST' })
  if (!res.ok)
    throw await responseError(res, `Media ticket failed: ${res.status}`)
  const ticket: { url: string } = await res.json()
  return `${API_BASE}${ticket.url}`
}

export async function deleteVideo(_db: DataClient, _lessonId: string): Promise<void> {}

// Chat history
export async function saveChatMessages(db: DataClient, lessonId: string, messages: UIMessage[]): Promise<void> {
  const surface: ThreadSurface = lessonId === '__global' ? 'global' : 'lesson'
  await saveThreadMessages(db, lessonId, messages, surface, surface === 'lesson' ? lessonId : null)
}

export async function getChatMessages(db: DataClient, lessonId: string): Promise<UIMessage[] | undefined> {
  return (await getThread(db, lessonId))?.messages
}

export async function deleteChatMessages(db: DataClient, lessonId: string): Promise<void> {
  await deleteThread(db, lessonId)
}

export async function getThread(db: DataClient, id: string): Promise<ThreadRecord | undefined> {
  return db.api.get<ThreadRecord>(storePath('threads', id))
}

export async function saveThreadMessages(
  db: DataClient,
  id: string,
  messages: UIMessage[],
  surface: ThreadSurface,
  ownerId: string | null,
  courseId?: string,
  videoId?: string,
): Promise<void> {
  const existing = await getThread(db, id)
  const now = Date.now()
  const thread: ThreadRecord = {
    id,
    surface,
    ownerId,
    courseId: courseId ?? existing?.courseId,
    videoId: videoId ?? existing?.videoId,
    messages,
    updatedAt: now,
    createdAt: existing?.createdAt ?? now,
  }
  await db.api.put(storePath('threads', id), thread)
}

export async function deleteThread(db: DataClient, id: string): Promise<void> {
  await Promise.all([
    db.api.del(storePath('threads', id)),
    db.api.del(storePath('thread-summaries', id)),
  ])
}

export async function listThreadsBySurface(db: DataClient, surface: ThreadSurface): Promise<ThreadRecord[]> {
  return db.api.list<ThreadRecord>('/api/store/threads', { index: 'by-surface', value: surface })
}

export async function putThreadSummary(db: DataClient, summary: ThreadSummaryRecord): Promise<void> {
  await db.api.put(storePath('thread-summaries', summary.threadId), summary)
}

export async function getLatestSummary(db: DataClient, threadId: string): Promise<ThreadSummaryRecord | undefined> {
  return db.api.get<ThreadSummaryRecord>(storePath('thread-summaries', threadId))
}

// Settings
export async function saveSettings(db: DataClient, settings: AppSettings): Promise<void> {
  await db.api.put(storePath('settings', 'settings'), settings)
}

export async function getSettings(db: DataClient): Promise<AppSettings | undefined> {
  return db.api.get<AppSettings>(storePath('settings', 'settings'))
}

// Crypto store
export async function saveCryptoData(db: DataClient, data: { encrypted: ArrayBuffer, salt: Uint8Array, iv: Uint8Array }): Promise<void> {
  await db.legacy.put('crypto', data, 'keys')
}

export async function getCryptoData(db: DataClient): Promise<{ encrypted: ArrayBuffer, salt: Uint8Array, iv: Uint8Array } | undefined> {
  const data = await db.legacy.get('crypto', 'keys')
  if (!data)
    return undefined
  // Normalize typed arrays in case of cross-realm issues (e.g. in tests with fake-indexeddb)
  return {
    encrypted: data.encrypted,
    salt: new Uint8Array(data.salt),
    iv: new Uint8Array(data.iv),
  }
}

export async function deleteCryptoData(db: DataClient): Promise<void> {
  await db.legacy.delete('crypto', 'keys')
}

// Full lesson delete (all stores)
export async function deleteFullLesson(db: DataClient, lessonId: string): Promise<void> {
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

export async function getTTSCache(db: DataClient, text: string, language: string): Promise<Blob | undefined> {
  return db.legacy.get('tts-cache', _ttsCacheKey(text, language))
}

export async function saveTTSCache(db: DataClient, text: string, blob: Blob, language: string): Promise<void> {
  await db.legacy.put('tts-cache', blob, _ttsCacheKey(text, language))
}

// Vocabulary store
export async function saveVocabEntry(db: DataClient, entry: VocabEntry): Promise<void> {
  await db.legacy.put('vocabulary', entry)
}

export async function getVocabEntriesByLesson(db: DataClient, lessonId: string): Promise<VocabEntry[]> {
  return db.legacy.getAllFromIndex('vocabulary', 'by-lesson', lessonId)
}

export async function deleteVocabEntry(db: DataClient, id: string): Promise<void> {
  await db.legacy.delete('vocabulary', id)
}

// Vocabulary by ID (needed for SM-2 review sessions)
export async function getVocabEntryById(db: DataClient, id: string): Promise<VocabEntry | undefined> {
  return db.legacy.get('vocabulary', id)
}

// Spaced Repetition
export async function getSpacedRepetitionItem(db: DataClient, itemId: string) {
  return db.legacy.get('spaced-repetition', itemId)
}
export async function saveSpacedRepetitionItem(db: DataClient, item: SpacedRepetitionItem) {
  await db.legacy.put('spaced-repetition', item)
}
export async function deleteSpacedRepetitionItem(db: DataClient, itemId: string) {
  await db.legacy.delete('spaced-repetition', itemId)
}
export async function getDueItems(db: DataClient, today: string): Promise<SpacedRepetitionItem[]> {
  return db.legacy.getAllFromIndex('spaced-repetition', 'by-due', IDBKeyRange.upperBound(today))
}

// Progress Stats
export async function getProgressStats(db: DataClient) {
  return db.legacy.get('progress-db', 'global')
}
export async function saveProgressStats(db: DataClient, stats: ProgressStats) {
  await db.legacy.put('progress-db', stats, 'global')
}

// Mastery
export async function getMasteryData(db: DataClient) {
  return db.legacy.get('mastery-db', 'global')
}
export async function saveMasteryData(db: DataClient, data: MasteryData) {
  await db.legacy.put('mastery-db', data, 'global')
}

// Mistakes
export async function getErrorPattern(db: DataClient, patternId: string) {
  return db.legacy.get('mistakes-db', patternId)
}
export async function deleteErrorPattern(db: DataClient, patternId: string) {
  await db.legacy.delete('mistakes-db', patternId)
}
export async function saveErrorPattern(db: DataClient, pattern: ErrorPattern) {
  await db.legacy.put('mistakes-db', pattern)
}
export async function getRecentMistakes(db: DataClient, limit = 20): Promise<ErrorPattern[]> {
  const all = await db.legacy.getAll('mistakes-db')
  return all.sort((a, b) => b.lastOccurred.localeCompare(a.lastOccurred)).slice(0, limit)
}

// Session Logs
export async function saveSessionLog(db: DataClient, log: SessionLog) {
  await db.legacy.put('session-logs', log)
}

export async function getAllSessionLogs(db: DataClient): Promise<SessionLog[]> {
  return db.legacy.getAll('session-logs')
}

// Learner Profile
export async function getLearnerProfile(db: DataClient): Promise<LearnerProfile | undefined> {
  return db.legacy.get('learner-profile', 'profile')
}

export async function saveLearnerProfile(db: DataClient, profile: LearnerProfile): Promise<void> {
  await db.legacy.put('learner-profile', profile, 'profile')
}

// Agent Memory
export async function saveAgentMemory(db: DataClient, memory: AgentMemory): Promise<void> {
  await db.legacy.put('agent-memory', memory)
}

export async function getAgentMemory(db: DataClient, id: string): Promise<AgentMemory | undefined> {
  return db.legacy.get('agent-memory', id)
}

export async function getAllAgentMemories(db: DataClient): Promise<AgentMemory[]> {
  return db.legacy.getAll('agent-memory')
}

export async function getAgentMemoriesByTag(db: DataClient, tag: string): Promise<AgentMemory[]> {
  return db.legacy.getAllFromIndex('agent-memory', 'tags', tag)
}

export async function deleteAgentMemory(db: DataClient, id: string): Promise<void> {
  await db.legacy.delete('agent-memory', id)
}

// Exercise Stats

export async function upsertExerciseStat(
  db: DataClient,
  key: string,
  correct: boolean,
): Promise<void> {
  const existing = await db.legacy.get('exercise-stats', key)
  const today = new Date().toISOString().split('T')[0]
  if (existing) {
    await db.legacy.put('exercise-stats', {
      correct: existing.correct + (correct ? 1 : 0),
      total: existing.total + 1,
      lastAttempt: today,
    }, key)
  }
  else {
    await db.legacy.put('exercise-stats', {
      correct: correct ? 1 : 0,
      total: 1,
      lastAttempt: today,
    }, key)
  }
}

export async function getExerciseAccuracy(
  db: DataClient,
): Promise<Record<string, { accuracy: number, attempts: number }>> {
  const all = await db.legacy.getAll('exercise-stats')
  const keys = await db.legacy.getAllKeys('exercise-stats')
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
  db: DataClient,
  log: Omit<AgentLog, 'id'>,
): Promise<void> {
  await db.legacy.add('agent-logs', log as AgentLog)
}

export async function saveBreakdown(
  db: DataClient,
  entry: import('@/shared/types').WordBreakdown,
): Promise<void> {
  await db.legacy.put('word-breakdowns', entry)
}

export async function getBreakdown(
  db: DataClient,
  word: string,
): Promise<import('@/shared/types').WordBreakdown | undefined> {
  return db.legacy.get('word-breakdowns', word)
}

export async function deleteBreakdown(db: DataClient, word: string): Promise<void> {
  await db.legacy.delete('word-breakdowns', word)
}

// Shadowing personal bests

export async function getSpeakingBest(db: DataClient, lessonId: string, segmentId: string): Promise<ShadowingBest | undefined> {
  return db.legacy.get('shadowing-bests', [lessonId, segmentId])
}

export async function saveSpeakingBest(db: DataClient, best: ShadowingBest): Promise<void> {
  await db.legacy.put('shadowing-bests', best)
}

export async function getAllSpeakingBestsByLesson(db: DataClient, lessonId: string): Promise<ShadowingBest[]> {
  return db.legacy.getAllFromIndex('shadowing-bests', 'by-lesson', lessonId)
}

export async function deleteSpeakingBestsByLesson(db: DataClient, lessonId: string): Promise<void> {
  const all = await getAllSpeakingBestsByLesson(db, lessonId)
  await Promise.all(all.map(b => db.legacy.delete('shadowing-bests', [b.lessonId, b.segmentId])))
}

export async function getSpeakingAudio(db: DataClient, lessonId: string, segmentId: string): Promise<Blob | undefined> {
  const record = await db.legacy.get('shadowing-audio', [lessonId, segmentId])
  return record?.blob
}

export async function saveSpeakingAudio(db: DataClient, lessonId: string, segmentId: string, blob: Blob): Promise<void> {
  await db.legacy.put('shadowing-audio', { lessonId, segmentId, blob })
}

export async function deleteSpeakingAudioByLesson(db: DataClient, lessonId: string): Promise<void> {
  const all = await db.legacy.getAllFromIndex('shadowing-audio', 'by-lesson', lessonId)
  await Promise.all(all.map(a => db.legacy.delete('shadowing-audio', [a.lessonId, a.segmentId])))
}

// Daily Tasks

export async function getDailyTasks(db: DataClient): Promise<DailyTask[]> {
  return db.legacy.getAll('daily-tasks')
}

export async function saveDailyTask(db: DataClient, task: DailyTask): Promise<void> {
  await db.legacy.put('daily-tasks', task)
}

export async function deleteDailyTask(db: DataClient, id: string): Promise<void> {
  await db.legacy.delete('daily-tasks', id)
}

// Tips LMS accessors

export async function putTipCourse(db: DataClient, course: TipCourse): Promise<void> {
  await db.legacy.put('tip-courses', course)
}

export async function getTipCourse(db: DataClient, courseId: string): Promise<TipCourse | undefined> {
  return db.legacy.get('tip-courses', courseId)
}

export async function putTipProgress(db: DataClient, progress: TipProgress): Promise<void> {
  await db.legacy.put('tip-progress', progress)
}

export async function getTipProgress(db: DataClient, key: string): Promise<TipProgress | undefined> {
  return db.legacy.get('tip-progress', key)
}

export async function listTipProgressForCourse(db: DataClient, courseId: string): Promise<TipProgress[]> {
  return db.legacy.getAllFromIndex('tip-progress', 'by-course', courseId)
}

export async function getAllTipProgress(db: DataClient): Promise<TipProgress[]> {
  return db.legacy.getAll('tip-progress')
}

export async function putTipTranscript(db: DataClient, record: TipTranscriptRecord): Promise<void> {
  await db.legacy.put('tip-transcripts', record)
}

export async function getTipTranscript(db: DataClient, videoId: string): Promise<TipTranscriptRecord | undefined> {
  return db.legacy.get('tip-transcripts', videoId)
}

export async function putTipChat(db: DataClient, chat: TipChatRecord): Promise<void> {
  await db.legacy.put('tip-chats', chat)
  await saveThreadMessages(db, chat.key, chat.messages, 'tip', chat.key, chat.courseId, chat.videoId)
}

export async function getTipChat(db: DataClient, key: string): Promise<TipChatRecord | undefined> {
  const thread = await getThread(db, key)
  if (thread && thread.surface === 'tip') {
    return {
      key: thread.id,
      courseId: thread.courseId ?? '',
      videoId: thread.videoId ?? '',
      messages: thread.messages,
      updatedAt: new Date(thread.updatedAt).toISOString(),
    }
  }
  return db.legacy.get('tip-chats', key)
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

export async function getTipStudio(db: DataClient, key: string): Promise<TipStudioRecord | undefined> {
  return db.legacy.get('tip-studio', key)
}

export async function putTipStudio(db: DataClient, record: TipStudioRecord): Promise<void> {
  await db.legacy.put('tip-studio', record)
}

export async function getTipCards(db: DataClient, key: string): Promise<TipCardsRecord | undefined> {
  return db.legacy.get('tip-cards', key)
}

export async function putTipCards(db: DataClient, record: TipCardsRecord): Promise<void> {
  await db.legacy.put('tip-cards', record)
}

export async function putTipNote(db: DataClient, note: TipNote): Promise<void> {
  await db.legacy.put('tip-notes', note)
}

export async function getTipNotesForVideo(db: DataClient, videoId: string): Promise<TipNote[]> {
  const rows = await db.legacy.getAllFromIndex('tip-notes', 'by-video', videoId)
  return rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export async function deleteTipNote(db: DataClient, videoId: string, id: string): Promise<void> {
  await db.legacy.delete('tip-notes', [videoId, id])
}

// User-registered materials
export async function listUserMaterials(db: DataClient): Promise<UserMaterial[]> {
  return db.legacy.getAll('user-materials')
}

export async function getUserMaterialByExternalId(
  db: DataClient,
  externalId: string,
): Promise<UserMaterial | undefined> {
  return db.legacy.getFromIndex('user-materials', 'by-external', externalId)
}

export async function putUserMaterial(db: DataClient, m: UserMaterial): Promise<void> {
  await db.legacy.put('user-materials', m)
}

export async function deleteUserMaterial(db: DataClient, id: string): Promise<void> {
  await db.legacy.delete('user-materials', id)
}
