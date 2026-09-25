import type { Json, JsonObject } from './canonical'
import type { EncryptedData } from './legacyCrypto'
import type { ShadowLearnDB } from '@/db/legacy'
import type { LessonMeta } from '@/shared/types'
import { unwrap } from 'idb'
import { storableText, toJson } from './canonical'

export const RECORD_STORES = [
  'settings',
  'vocabulary',
  'learner-profile',
  'progress-db',
  'mastery-db',
  'spaced-repetition',
  'session-logs',
  'mistakes-db',
  'agent-memory',
  'exercise-stats',
  'daily-tasks',
  'speak-sessions',
  'shadowing-bests',
  'tip-progress',
  'tip-notes',
  'tip-card-states',
  'word-stories',
  'user-materials',
  'threads',
  'thread-summaries',
] as const

export type RecordStore = typeof RECORD_STORES[number]
export type ManifestStore = 'lessons' | 'segments' | RecordStore

type KeyPath = { keyPath: readonly string[] } | { singleton: string }

export const KEY_PATHS: Record<RecordStore, KeyPath> = {
  'settings': { singleton: 'settings' },
  'vocabulary': { keyPath: ['id'] },
  'learner-profile': { singleton: 'profile' },
  'progress-db': { singleton: 'global' },
  'mastery-db': { singleton: 'global' },
  'spaced-repetition': { keyPath: ['itemId'] },
  'session-logs': { keyPath: ['sessionId'] },
  'mistakes-db': { keyPath: ['patternId'] },
  'agent-memory': { keyPath: ['id'] },
  'exercise-stats': { keyPath: ['vocabId', 'exerciseType'] },
  'daily-tasks': { keyPath: ['id'] },
  'speak-sessions': { keyPath: ['sessionId'] },
  'shadowing-bests': { keyPath: ['lessonId', 'segmentId'] },
  'tip-progress': { keyPath: ['key'] },
  'tip-notes': { keyPath: ['videoId', 'id'] },
  'tip-card-states': { keyPath: ['videoId', 'locale'] },
  'word-stories': { keyPath: ['word', 'lang'] },
  'user-materials': { keyPath: ['id'] },
  'threads': { keyPath: ['id'] },
  'thread-summaries': { keyPath: ['threadId'] },
}

export function recordId(store: RecordStore, data: JsonObject): string | null {
  const spec = KEY_PATHS[store]
  if ('singleton' in spec)
    return spec.singleton
  const parts = spec.keyPath.map(field => data[field])
  if (parts.some(part => part === undefined || part === null || typeof part === 'object'))
    return null
  return parts.map(String).join(':')
}

export interface OutgoingRecord {
  id: string
  data: JsonObject
}

export interface OutgoingLesson {
  id: string
  lesson: JsonObject
  segments: Json[]
}

export type MediaKind = 'video' | 'audio' | 'shadowing'

export interface MediaKey {
  lessonId: string
  kind: MediaKind
  segmentId?: string
}

export interface OutgoingMedia {
  key: MediaKey
  blob: Blob
}

export interface Skipped {
  unfinishedLessons: number
  orphanMedia: number
  storylessBreakdowns: number
}

export interface LegacySnapshot {
  lessons: OutgoingLesson[]
  stores: { store: RecordStore, records: OutgoingRecord[] }[]
  media: OutgoingMedia[]
  keys: EncryptedData | null
  skipped: Skipped
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const LEGACY_LESSON_NAMESPACE = '73d99d39-b3bb-4c98-9d0c-a5e586ef3a4f'
const HEX_PAIR = /../g

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}

export async function uuidV5(name: string, namespace = LEGACY_LESSON_NAMESPACE): Promise<string> {
  const ns = Uint8Array.from(namespace.replaceAll('-', '').match(HEX_PAIR) ?? [], pair => Number.parseInt(pair, 16))
  const input = new Uint8Array([...ns, ...new TextEncoder().encode(name)])
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-1', input)).slice(0, 16)
  bytes[6] = (bytes[6] & 0x0F) | 0x50
  bytes[8] = (bytes[8] & 0x3F) | 0x80
  const h = hex(bytes)
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

type LessonIds = (id: string) => string

async function lessonIdMap(metas: LessonMeta[], account: string): Promise<LessonIds> {
  const remapped = new Map<string, string>()
  for (const { id } of metas)
    remapped.set(id, UUID.test(id) ? id.toLowerCase() : await uuidV5(`${account}:${id}`))
  return id => remapped.get(id) ?? id
}

function isUnfinished(meta: LessonMeta): boolean {
  return meta.status === 'processing' || meta.status === 'error'
}

const EPOCH = '1970-01-01T00:00:00.000Z'
const SOURCES = new Set<unknown>(['youtube', 'upload', 'blog'])

function iso(value: unknown): string | null {
  const date = new Date(typeof value === 'string' ? value : Number.NaN)
  const year = date.getUTCFullYear()
  return year >= 1 && year <= 9999 ? date.toISOString() : null
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter(item => typeof item === 'string') : []
}

function lastEnd(segments: Json[]): number {
  return segments.reduce<number>((end, segment) => {
    const value = segment && typeof segment === 'object' && !Array.isArray(segment) ? segment.end : null
    return typeof value === 'number' ? Math.max(end, value) : end
  }, 0)
}

function lessonRecord(meta: LessonMeta, id: string, segments: Json[]): JsonObject {
  return asObject({
    id,
    title: typeof meta.title === 'string' ? meta.title : '',
    source: SOURCES.has(meta.source) ? meta.source : 'upload',
    sourceUrl: typeof meta.sourceUrl === 'string' ? meta.sourceUrl : null,
    duration: finite(meta.duration) ?? lastEnd(segments),
    sourceLanguage: typeof meta.sourceLanguage === 'string' ? meta.sourceLanguage : 'zh-CN',
    translationLanguages: strings(meta.translationLanguages),
    createdAt: iso(meta.createdAt) ?? EPOCH,
    lastOpenedAt: iso(meta.lastOpenedAt),
    meta: {
      progressSegmentId: typeof meta.progressSegmentId === 'string' ? meta.progressSegmentId : null,
      tags: strings(meta.tags),
      isDone: typeof meta.isDone === 'boolean' ? meta.isDone : undefined,
    },
  })
}

function isObject(value: Json): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function asObject(value: unknown): JsonObject {
  const json = toJson(value)
  return isObject(json) ? json : {}
}

type Transform = (value: JsonObject) => JsonObject

function withLessonIds(lessonIds: LessonIds, ...fields: string[]): Transform {
  return (value) => {
    const out = { ...value }
    for (const field of fields) {
      const id = out[field]
      if (typeof id === 'string')
        out[field] = lessonIds(id)
    }
    return out
  }
}

// A record missing a key field gets a synthetic `legacy:<IndexedDB key>` id. The server
// rejects it for that same missing field, so it lands in the quarantine under this id.
function outgoing(store: RecordStore, values: JsonObject[], fallbackIds: string[]): OutgoingRecord[] {
  return values.map((data, i) => ({ id: recordId(store, data) ?? `legacy:${storableText(fallbackIds[i])}`, data }))
}

function settled<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function readAll(db: ShadowLearnDB, store: string): Promise<{ keys: string[], values: JsonObject[] }> {
  const raw = unwrap(db)
  if (!raw.objectStoreNames.contains(store))
    return { keys: [], values: [] }
  const objects = raw.transaction(store).objectStore(store)
  const [keys, values] = await Promise.all([settled(objects.getAllKeys()), settled(objects.getAll())])
  return {
    keys: keys.map(key => Array.isArray(key) ? key.join(':') : String(key)),
    values: values.map(asObject),
  }
}

async function readSingleton(db: ShadowLearnDB, store: string, key: string): Promise<JsonObject[]> {
  const { keys, values } = await readAll(db, store)
  const index = keys.indexOf(key)
  return index === -1 ? [] : [values[index]]
}

function exerciseStat(key: string, value: JsonObject): JsonObject {
  const colon = key.lastIndexOf(':')
  const [vocabId, exerciseType] = colon === -1 ? [key, ''] : [key.slice(0, colon), key.slice(colon + 1)]
  return { ...value, vocabId, exerciseType }
}

function tipCardStates(value: JsonObject): JsonObject {
  const cards = Array.isArray(value.cards) ? value.cards : []
  const states: JsonObject = {}
  for (const card of cards) {
    if (card && typeof card === 'object' && !Array.isArray(card) && typeof card.front === 'string')
      states[card.front] = toJson({ state: card.state, updatedAt: card.updatedAt })
  }
  return { videoId: value.videoId, locale: value.locale, states }
}

const STORY_LANGUAGES = new Set(['en', 'vi'])

function wordStory(value: JsonObject, uiLanguage: Json | undefined): JsonObject {
  const lang = [value.storyLanguage, uiLanguage].find(l => typeof l === 'string' && STORY_LANGUAGES.has(l)) ?? 'vi'
  return asObject({ word: value.word, lang, story: value.story, updatedAt: value.generatedAt ?? undefined })
}

function hasStory(value: JsonObject): boolean {
  return typeof value.story === 'string' && value.story.trim() !== ''
}

async function readRecordStore(
  db: ShadowLearnDB,
  store: RecordStore,
  lessonIds: LessonIds,
  settings: JsonObject[],
): Promise<{ records: OutgoingRecord[], storyless: number }> {
  const plain = async (source: string, transform: Transform = value => value) => {
    const { keys, values } = await readAll(db, source)
    return outgoing(store, values.map(transform), keys)
  }
  switch (store) {
    case 'settings':
      return { records: outgoing(store, settings, ['settings']), storyless: 0 }
    case 'learner-profile':
      return { records: outgoing(store, await readSingleton(db, store, 'profile'), ['profile']), storyless: 0 }
    case 'progress-db':
    case 'mastery-db':
      return { records: outgoing(store, await readSingleton(db, store, 'global'), ['global']), storyless: 0 }
    case 'exercise-stats': {
      const { keys, values } = await readAll(db, store)
      return { records: outgoing(store, values.map((value, i) => exerciseStat(keys[i], value)), keys), storyless: 0 }
    }
    case 'tip-card-states':
      return { records: await plain('tip-cards', tipCardStates), storyless: 0 }
    case 'word-stories': {
      const { keys, values } = await readAll(db, 'word-breakdowns')
      const withStory = values.map((value, i) => ({ value, key: keys[i] })).filter(({ value }) => hasStory(value))
      const records = outgoing(store, withStory.map(({ value }) => wordStory(value, settings[0]?.uiLanguage)), withStory.map(({ key }) => key))
      return { records, storyless: values.length - withStory.length }
    }
    case 'vocabulary':
      return { records: await plain(store, withLessonIds(lessonIds, 'sourceLessonId')), storyless: 0 }
    case 'agent-memory':
    case 'speak-sessions':
    case 'shadowing-bests':
      return { records: await plain(store, withLessonIds(lessonIds, 'lessonId')), storyless: 0 }
    case 'threads':
      return { records: await plain(store, withLessonIds(lessonIds, 'id', 'ownerId')), storyless: 0 }
    case 'thread-summaries':
      return { records: await plain(store, withLessonIds(lessonIds, 'threadId')), storyless: 0 }
    case 'spaced-repetition':
    case 'session-logs':
    case 'mistakes-db':
    case 'daily-tasks':
    case 'tip-progress':
    case 'tip-notes':
    case 'user-materials':
      return { records: await plain(store), storyless: 0 }
    default: {
      const _exhaustive: never = store
      return _exhaustive
    }
  }
}

function mediaKind(blob: Blob): MediaKind {
  return blob.type.startsWith('audio/') ? 'audio' : 'video'
}

export async function readSnapshot(db: ShadowLearnDB, account: string): Promise<LegacySnapshot> {
  const metas = await db.getAll('lessons')
  const lessonIds = await lessonIdMap(metas, account)
  const videoKeys = await db.getAllKeys('videos')
  const withFile = new Set(videoKeys)
  const kept = metas.filter(meta => !isUnfinished(meta) || withFile.has(meta.id))
  const lessons: OutgoingLesson[] = []
  for (const meta of kept) {
    const segments = toJson((await db.get('segments', meta.id)) ?? [])
    const list = Array.isArray(segments) ? segments.filter(isObject) : []
    const id = lessonIds(meta.id)
    lessons.push({ id, lesson: lessonRecord(meta, id, list), segments: list })
  }

  const settings = await readSingleton(db, 'settings', 'settings')
  let storylessBreakdowns = 0
  const stores: LegacySnapshot['stores'] = []
  for (const store of RECORD_STORES) {
    const { records, storyless } = await readRecordStore(db, store, lessonIds, settings)
    storylessBreakdowns += storyless
    stores.push({ store, records })
  }

  const imported = new Set(lessons.map(lesson => lesson.id))
  const candidates: OutgoingMedia[] = []
  for (const key of videoKeys) {
    const blob = await db.get('videos', key)
    if (blob)
      candidates.push({ key: { lessonId: lessonIds(key), kind: mediaKind(blob) }, blob })
  }
  for (const take of await db.getAll('shadowing-audio'))
    candidates.push({ key: { lessonId: lessonIds(take.lessonId), kind: 'shadowing', segmentId: take.segmentId }, blob: take.blob })
  const media = candidates.filter(item => imported.has(item.key.lessonId))

  return {
    lessons,
    stores,
    media,
    keys: (await db.get('crypto', 'keys')) ?? null,
    skipped: {
      unfinishedLessons: metas.length - kept.length,
      orphanMedia: candidates.length - media.length,
      storylessBreakdowns,
    },
  }
}

export interface ImportClaim {
  source: string
  account: string
}

async function claim(store: IDBObjectStore, key: string, value: string): Promise<string> {
  const existing: unknown = await settled(store.get(key))
  if (typeof existing === 'string')
    return existing
  await settled(store.add(value, key))
  return value
}

export async function claimImport(db: ShadowLearnDB, account: string): Promise<ImportClaim> {
  const store = unwrap(db).transaction('crypto', 'readwrite').objectStore('crypto')
  return {
    source: await claim(store, 'import-source', crypto.randomUUID()),
    account: await claim(store, 'import-account', account),
  }
}
