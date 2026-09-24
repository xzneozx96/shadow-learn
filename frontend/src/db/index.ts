import type { UIMessage } from '@ai-sdk/react'
import type { DataClient } from './client'
import type { AgentMemory, DailyTask, ErrorPattern, ExerciseStat, LearnerProfile, MasteryData, ProgressStats, SessionLog, SpacedRepetitionItem, ThreadRecord, ThreadSummaryRecord, ThreadSurface } from './legacy'
import type { UserMaterial } from '@/features/learning-materials/domain/collection'
import type { StudioLocale, TipCardStatesRecord, TipNote, TipProgress } from '@/features/learning-materials/domain/tips'
import type { AppSettings, LessonMedia, LessonMeta, Segment, ShadowingBest, VocabEntry } from '@/shared/types'
import { responseError } from '@/shared/lib/api'
import { API_BASE } from '@/shared/lib/config'

export type { ApiClient, DataClient } from './client'
export { createApiClient } from './client'
export type {
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
  SkillMastery,
  SkillStats,
  SpacedRepetitionItem,
  SpeakSession,
  SpeakTurn,
  ThreadRecord,
  ThreadSummaryRecord,
  ThreadSurface,
} from './legacy'

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
  video_url?: string
  audio_url?: string
}

interface LessonDetailResponse extends LessonSummary {
  segments: Segment[]
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
    media: summaryMedia(summary),
  }
}

function summaryMedia(summary: LessonSummary): LessonMedia | undefined {
  if (summary.video_url)
    return toLessonMedia('video', summary.video_url)
  if (summary.audio_url)
    return toLessonMedia('audio', summary.audio_url)
  return undefined
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
  const meta = toLessonMeta(body)
  return { meta, segments: body.segments, media: meta.media ?? null }
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

export async function deleteFullLesson(db: DataClient, lessonId: string): Promise<void> {
  await Promise.all([
    deleteLessonMeta(db, lessonId),
    deleteSegments(db, lessonId),
    deleteVideo(db, lessonId),
    deleteChatMessages(db, lessonId),
    deleteSpeakingBestsByLesson(db, lessonId),
  ])
}

function storeList<T>(db: DataClient, store: string, index?: string, value?: string, op?: 'lte'): Promise<T[]> {
  if (!index || value === undefined)
    return db.api.list<T>(`/api/store/${store}`)
  return db.api.list<T>(`/api/store/${store}`, op ? { index, value, op } : { index, value })
}

function deleteByIndex(db: DataClient, store: string, index: string, value: string): Promise<void> {
  return db.api.del(`/api/store/${store}?${new URLSearchParams({ index, value })}`)
}

// Vocabulary store
export async function saveVocabEntry(db: DataClient, entry: VocabEntry): Promise<void> {
  await db.api.put(storePath('vocabulary', entry.id), entry)
}

export async function getAllVocabEntries(db: DataClient): Promise<VocabEntry[]> {
  return storeList<VocabEntry>(db, 'vocabulary')
}

export async function getVocabEntriesByLesson(db: DataClient, lessonId: string): Promise<VocabEntry[]> {
  return storeList<VocabEntry>(db, 'vocabulary', 'by-lesson', lessonId)
}

export async function deleteVocabEntry(db: DataClient, id: string): Promise<void> {
  await db.api.del(storePath('vocabulary', id))
}

// Vocabulary by ID (needed for SM-2 review sessions)
export async function getVocabEntryById(db: DataClient, id: string): Promise<VocabEntry | undefined> {
  return db.api.get<VocabEntry>(storePath('vocabulary', id))
}

// Spaced Repetition
export async function getSpacedRepetitionItem(db: DataClient, itemId: string): Promise<SpacedRepetitionItem | undefined> {
  return db.api.get<SpacedRepetitionItem>(storePath('spaced-repetition', itemId))
}
export async function saveSpacedRepetitionItem(db: DataClient, item: SpacedRepetitionItem) {
  await db.api.put(storePath('spaced-repetition', item.itemId), item)
}
export async function deleteSpacedRepetitionItem(db: DataClient, itemId: string) {
  await db.api.del(storePath('spaced-repetition', itemId))
}
export async function getDueItems(db: DataClient, today: string): Promise<SpacedRepetitionItem[]> {
  return storeList<SpacedRepetitionItem>(db, 'spaced-repetition', 'by-due', today, 'lte')
}

// Progress Stats
export async function getProgressStats(db: DataClient): Promise<ProgressStats | undefined> {
  return db.api.get<ProgressStats>(storePath('progress-db', 'global'))
}
export async function saveProgressStats(db: DataClient, stats: ProgressStats) {
  await db.api.put(storePath('progress-db', 'global'), stats)
}

// Mastery
export async function getMasteryData(db: DataClient): Promise<MasteryData | undefined> {
  return db.api.get<MasteryData>(storePath('mastery-db', 'global'))
}
export async function saveMasteryData(db: DataClient, data: MasteryData) {
  await db.api.put(storePath('mastery-db', 'global'), data)
}

// Mistakes
export async function getErrorPattern(db: DataClient, patternId: string): Promise<ErrorPattern | undefined> {
  return db.api.get<ErrorPattern>(storePath('mistakes-db', patternId))
}
export async function deleteErrorPattern(db: DataClient, patternId: string) {
  await db.api.del(storePath('mistakes-db', patternId))
}
export async function saveErrorPattern(db: DataClient, pattern: ErrorPattern) {
  await db.api.put(storePath('mistakes-db', pattern.patternId), pattern)
}
export async function getRecentMistakes(db: DataClient, limit = 20): Promise<ErrorPattern[]> {
  const all = await storeList<ErrorPattern>(db, 'mistakes-db')
  return all.sort((a, b) => b.lastOccurred.localeCompare(a.lastOccurred)).slice(0, limit)
}

// Session Logs
export async function saveSessionLog(db: DataClient, log: SessionLog) {
  await db.api.put(storePath('session-logs', log.sessionId), log)
}

export async function getAllSessionLogs(db: DataClient): Promise<SessionLog[]> {
  return storeList<SessionLog>(db, 'session-logs')
}

// Learner Profile
export async function getLearnerProfile(db: DataClient): Promise<LearnerProfile | undefined> {
  return db.api.get<LearnerProfile>(storePath('learner-profile', 'profile'))
}

export async function saveLearnerProfile(db: DataClient, profile: LearnerProfile): Promise<void> {
  await db.api.put(storePath('learner-profile', 'profile'), profile)
}

// Agent Memory
export async function saveAgentMemory(db: DataClient, memory: AgentMemory): Promise<void> {
  await db.api.put(storePath('agent-memory', memory.id), memory)
}

export async function getAgentMemory(db: DataClient, id: string): Promise<AgentMemory | undefined> {
  return db.api.get<AgentMemory>(storePath('agent-memory', id))
}

export async function getAllAgentMemories(db: DataClient): Promise<AgentMemory[]> {
  return storeList<AgentMemory>(db, 'agent-memory')
}

export async function getAgentMemoriesByTag(db: DataClient, tag: string): Promise<AgentMemory[]> {
  return storeList<AgentMemory>(db, 'agent-memory', 'tags', tag)
}

export async function deleteAgentMemory(db: DataClient, id: string): Promise<void> {
  await db.api.del(storePath('agent-memory', id))
}

export interface ExerciseStatRecord extends ExerciseStat {
  vocabId: string
  exerciseType: string
}

export async function getAllExerciseStats(db: DataClient): Promise<ExerciseStatRecord[]> {
  return storeList<ExerciseStatRecord>(db, 'exercise-stats')
}

export async function upsertExerciseStat(
  db: DataClient,
  key: string,
  correct: boolean,
): Promise<void> {
  const colonIdx = key.lastIndexOf(':')
  const existing = await db.api.get<ExerciseStatRecord>(storePath('exercise-stats', key))
  const stat: ExerciseStatRecord = {
    vocabId: key.slice(0, colonIdx),
    exerciseType: key.slice(colonIdx + 1),
    correct: (existing?.correct ?? 0) + (correct ? 1 : 0),
    total: (existing?.total ?? 0) + 1,
    lastAttempt: new Date().toISOString().split('T')[0],
  }
  await db.api.put(storePath('exercise-stats', key), stat)
}

export async function getExerciseAccuracy(
  db: DataClient,
): Promise<Record<string, { accuracy: number, attempts: number }>> {
  const byType: Record<string, { correct: number, total: number }> = {}
  for (const stat of await getAllExerciseStats(db)) {
    byType[stat.exerciseType] ??= { correct: 0, total: 0 }
    byType[stat.exerciseType].correct += stat.correct
    byType[stat.exerciseType].total += stat.total
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

export interface WordStory {
  word: string
  story: string
  updatedAt: string
}

export async function getWordStory(db: DataClient, word: string): Promise<WordStory | undefined> {
  return db.api.get<WordStory>(storePath('word-stories', word))
}

export async function saveWordStory(db: DataClient, word: string, story: string): Promise<void> {
  const record: WordStory = { word, story, updatedAt: new Date().toISOString() }
  await db.api.put(storePath('word-stories', word), record)
}

export async function deleteWordStory(db: DataClient, word: string): Promise<void> {
  await db.api.del(storePath('word-stories', word))
}

// Shadowing personal bests

function segmentKey(lessonId: string, segmentId: string): string {
  return `${lessonId}:${segmentId}`
}

function shadowingAudioPath(lessonId: string, segmentId: string): string {
  return `${lessonPath(lessonId)}/segments/${encodeURIComponent(segmentId)}/shadowing-audio`
}

export async function getSpeakingBest(db: DataClient, lessonId: string, segmentId: string): Promise<ShadowingBest | undefined> {
  return db.api.get<ShadowingBest>(storePath('shadowing-bests', segmentKey(lessonId, segmentId)))
}

export async function saveSpeakingBest(db: DataClient, best: ShadowingBest): Promise<void> {
  await db.api.put(storePath('shadowing-bests', segmentKey(best.lessonId, best.segmentId)), best)
}

export async function getAllSpeakingBestsByLesson(db: DataClient, lessonId: string): Promise<ShadowingBest[]> {
  return storeList<ShadowingBest>(db, 'shadowing-bests', 'by-lesson', lessonId)
}

export async function deleteSpeakingBestsByLesson(db: DataClient, lessonId: string): Promise<void> {
  await deleteByIndex(db, 'shadowing-bests', 'by-lesson', lessonId)
}

export async function getSpeakingAudio(db: DataClient, lessonId: string, segmentId: string): Promise<Blob | undefined> {
  const res = await db.api.fetch(shadowingAudioPath(lessonId, segmentId))
  if (res.status === 404)
    return undefined
  if (!res.ok)
    throw await responseError(res, `Loading recording failed: ${res.status}`)
  return res.blob()
}

export async function saveSpeakingAudio(db: DataClient, lessonId: string, segmentId: string, blob: Blob): Promise<void> {
  const res = await db.api.fetch(shadowingAudioPath(lessonId, segmentId), {
    method: 'PUT',
    headers: { 'Content-Type': blob.type || 'audio/webm' },
    body: blob,
  })
  if (!res.ok)
    throw await responseError(res, `Saving recording failed: ${res.status}`)
}

// Daily Tasks

export async function getDailyTasks(db: DataClient): Promise<DailyTask[]> {
  return storeList<DailyTask>(db, 'daily-tasks')
}

export async function saveDailyTask(db: DataClient, task: DailyTask): Promise<void> {
  await db.api.put(storePath('daily-tasks', task.id), task)
}

export async function deleteDailyTask(db: DataClient, id: string): Promise<void> {
  await db.api.del(storePath('daily-tasks', id))
}

// Tips LMS accessors

export async function putTipProgress(db: DataClient, progress: TipProgress): Promise<void> {
  await db.api.put(storePath('tip-progress', progress.key), progress)
}

export async function getTipProgress(db: DataClient, key: string): Promise<TipProgress | undefined> {
  return db.api.get<TipProgress>(storePath('tip-progress', key))
}

export async function listTipProgressForCourse(db: DataClient, courseId: string): Promise<TipProgress[]> {
  return storeList<TipProgress>(db, 'tip-progress', 'by-course', courseId)
}

export async function getAllTipProgress(db: DataClient): Promise<TipProgress[]> {
  return storeList<TipProgress>(db, 'tip-progress')
}

export function cardsKey(videoId: string, locale: StudioLocale): string {
  return `${videoId}:${locale}`
}

export async function getTipCardStates(db: DataClient, videoId: string, locale: StudioLocale): Promise<TipCardStatesRecord | undefined> {
  return db.api.get<TipCardStatesRecord>(storePath('tip-card-states', cardsKey(videoId, locale)))
}

export async function putTipCardStates(db: DataClient, record: TipCardStatesRecord): Promise<void> {
  await db.api.put(storePath('tip-card-states', cardsKey(record.videoId, record.locale)), record)
}

export function chatKey(courseId: string, videoId: string): string {
  return `${courseId}:${videoId}`
}

export async function putTipNote(db: DataClient, note: TipNote): Promise<void> {
  await db.api.put(storePath('tip-notes', `${note.videoId}:${note.id}`), note)
}

export async function getTipNotesForVideo(db: DataClient, videoId: string): Promise<TipNote[]> {
  const rows = await storeList<TipNote>(db, 'tip-notes', 'by-video', videoId)
  return rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export async function deleteTipNote(db: DataClient, videoId: string, id: string): Promise<void> {
  await db.api.del(storePath('tip-notes', `${videoId}:${id}`))
}

// User-registered materials
export async function listUserMaterials(db: DataClient): Promise<UserMaterial[]> {
  return storeList<UserMaterial>(db, 'user-materials')
}

export async function getUserMaterialByExternalId(
  db: DataClient,
  externalId: string,
): Promise<UserMaterial | undefined> {
  return (await storeList<UserMaterial>(db, 'user-materials', 'by-external', externalId))[0]
}

export async function putUserMaterial(db: DataClient, m: UserMaterial): Promise<void> {
  await db.api.put(storePath('user-materials', m.id), m)
}

export async function deleteUserMaterial(db: DataClient, id: string): Promise<void> {
  await db.api.del(storePath('user-materials', id))
}
