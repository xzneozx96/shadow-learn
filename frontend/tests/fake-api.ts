import type { ApiClient, DataClient, LessonSummary, Versioned, VersionedPut } from '@/db'
import type { LessonMeta, Segment } from '@/shared/types'

export interface ApiCall {
  method: string
  path: string
  body?: unknown
}

type Row = Record<string, unknown>

interface StoreIndex {
  field: string
  array?: boolean
}

interface StoreSpec {
  keyPath?: string[]
  singleton?: string
  required?: string[]
  indexes?: Record<string, StoreIndex>
}

export const STORES: Record<string, StoreSpec> = {
  'settings': { singleton: 'settings' },
  'vocabulary': {
    keyPath: ['id'],
    required: ['sourceLessonId', 'createdAt'],
    indexes: { 'by-lesson': { field: 'sourceLessonId' }, 'by-date': { field: 'createdAt' } },
  },
  'learner-profile': { singleton: 'profile' },
  'progress-db': { singleton: 'global' },
  'mastery-db': { singleton: 'global' },
  'spaced-repetition': { keyPath: ['itemId'], required: ['dueDate'], indexes: { 'by-due': { field: 'dueDate' } } },
  'session-logs': { keyPath: ['sessionId'] },
  'mistakes-db': { keyPath: ['patternId'] },
  'agent-memory': {
    keyPath: ['id'],
    required: ['tags', 'importance'],
    indexes: { tags: { field: 'tags', array: true }, importance: { field: 'importance' } },
  },
  'exercise-stats': {
    keyPath: ['vocabId', 'exerciseType'],
    indexes: { 'by-vocab': { field: 'vocabId' }, 'by-exercise': { field: 'exerciseType' } },
  },
  'daily-tasks': { keyPath: ['id'] },
  'speak-sessions': { keyPath: ['sessionId'], required: ['startedAt'], indexes: { 'by-date': { field: 'startedAt' } } },
  'shadowing-bests': {
    keyPath: ['lessonId', 'segmentId'],
    indexes: { 'by-lesson': { field: 'lessonId' }, 'by-segment': { field: 'segmentId' } },
  },
  'tip-progress': {
    keyPath: ['key'],
    required: ['courseId', 'videoId'],
    indexes: { 'by-course': { field: 'courseId' }, 'by-video': { field: 'videoId' } },
  },
  'tip-notes': { keyPath: ['videoId', 'id'], indexes: { 'by-video': { field: 'videoId' } } },
  'tip-card-states': { keyPath: ['videoId', 'locale'] },
  'word-stories': { keyPath: ['word', 'lang'] },
  'user-materials': {
    keyPath: ['id'],
    required: ['externalId', 'skill'],
    indexes: { 'by-external': { field: 'externalId' }, 'by-skill': { field: 'skill' } },
  },
  'threads': {
    keyPath: ['id'],
    required: ['surface', 'updatedAt'],
    indexes: { 'by-surface': { field: 'surface' }, 'by-owner': { field: 'ownerId' }, 'by-updated': { field: 'updatedAt' } },
  },
  'thread-summaries': { keyPath: ['threadId'] },
}

const STORE_PATH = /^\/api\/store\/([^/]+)(?:\/(.+))?$/

export function lessonBody(meta: LessonMeta, segments: Segment[] = []): LessonSummary & { segments: Segment[] } {
  return {
    id: meta.id,
    title: meta.title,
    source: meta.source,
    source_url: meta.sourceUrl,
    duration: meta.duration ?? 0,
    source_language: meta.sourceLanguage ?? 'zh-CN',
    translation_languages: meta.translationLanguages,
    created_at: meta.createdAt,
    last_opened_at: meta.lastOpenedAt,
    segment_count: segments.length,
    meta: { progressSegmentId: meta.progressSegmentId, tags: meta.tags },
    version: meta.version ?? 1,
    segments,
  }
}

function json(status: number, body?: unknown, headers: Record<string, string> = {}): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

function recordId(spec: StoreSpec, row: Row): string {
  return spec.singleton ?? spec.keyPath!.map(field => String(row[field])).join(':')
}

function rejection(spec: StoreSpec, row: Row, id: string): string | null {
  const missing = [...spec.keyPath ?? [], ...spec.required ?? []].filter(field => row[field] == null)
  if (missing.length)
    return `missing ${missing.join(', ')}`
  if (recordId(spec, row) !== id)
    return 'record id does not match the path'
  return null
}

function matches(spec: StoreSpec, row: Row, query: URLSearchParams): boolean {
  const name = query.get('index')
  if (!name)
    return true
  const index = spec.indexes?.[name]
  if (!index)
    throw new Error(`unknown index ${name}`)
  const value = query.get('value') ?? ''
  const actual = row[index.field]
  if (index.array)
    return Array.isArray(actual) && actual.includes(value)
  if (query.get('op') === 'lte')
    return String(actual) <= value
  return String(actual) === value
}

export class FakeApiClient implements ApiClient {
  records = new Map<string, unknown>()
  calls: ApiCall[] = []
  private versions = new Map<string, number>()
  private failures = new Map<string, number>()
  private beforePut: (() => Promise<void>) | null = null
  private beforePatch: (() => Promise<void>) | null = null

  seed(path: string, body: unknown): this {
    this.records.set(path, structuredClone(body))
    this.versions.set(path, (this.versions.get(path) ?? 0) + 1)
    return this
  }

  // Runs once, between the next conditional PUT's read and its write, as another device would.
  interleaveBeforeNextPut(write: () => Promise<void>): void {
    this.beforePut = write
  }

  // Runs once, before the next lesson PATCH reaches the server, as another device would.
  interleaveBeforeNextPatch(write: () => Promise<void>): void {
    this.beforePatch = write
  }

  private etag(path: string): Record<string, string> {
    const version = this.versions.get(path)
    return version === undefined ? {} : { ETag: `"${version}"` }
  }

  seedLesson(meta: LessonMeta, segments: Segment[] = []): this {
    return this.seed(`/api/lessons/${meta.id}`, lessonBody(meta, segments))
  }

  seedStore(store: string, rows: object[]): this {
    const spec = STORES[store]
    for (const row of rows)
      this.seed(`/api/store/${store}/${encodeURIComponent(recordId(spec, row as Row))}`, row)
    return this
  }

  storeRows<T = Row>(store: string): T[] {
    return this.collection(`/api/store/${store}`) as T[]
  }

  failWith(path: string, status: number): void {
    this.failures.set(path, status)
  }

  heal(path: string): void {
    this.failures.delete(path)
  }

  private collection(path: string): unknown[] {
    return [...this.records]
      .filter(([key]) => key.startsWith(`${path}/`) && !key.slice(path.length + 1).includes('/'))
      .map(([, value]) => structuredClone(value))
  }

  private respond(method: string, path: string, body?: unknown, precondition?: { version: string | null }): Response {
    const [bare, search] = path.split('?')
    const query = new URLSearchParams(search)
    const verb = method === 'LIST' ? 'GET' : method
    this.calls.push(body === undefined ? { method: verb, path } : { method: verb, path, body })
    const failure = this.failures.get(bare)
    if (failure)
      return json(failure, { detail: `fake ${failure}` })
    const storeMatch = STORE_PATH.exec(bare)
    const spec = storeMatch ? STORES[storeMatch[1]] : undefined
    if (storeMatch && !spec)
      return json(404, { detail: 'unknown store' })
    const storeId = storeMatch?.[2] === undefined ? undefined : decodeURIComponent(storeMatch[2])
    switch (method) {
      case 'GET':
        if (this.records.has(bare))
          return json(200, structuredClone(this.records.get(bare)), this.etag(bare))
        return json(404, { detail: 'not found' })
      case 'LIST': {
        const rows = this.collection(bare) as Row[]
        return json(200, spec ? rows.filter(row => matches(spec, row, query)) : rows)
      }
      case 'PUT': {
        if (body instanceof Blob) {
          this.records.set(bare, body)
          return json(200, { size: body.size })
        }
        if (spec && storeId !== undefined) {
          const problem = rejection(spec, body as Row, storeId)
          if (problem)
            return json(422, { detail: problem })
        }
        if (precondition) {
          const current = this.etag(bare).ETag ?? null
          if (current !== precondition.version)
            return json(409, { detail: 'version conflict', record: this.records.get(bare) ?? null }, this.etag(bare))
        }
        this.records.set(bare, structuredClone(body))
        this.versions.set(bare, (this.versions.get(bare) ?? 0) + 1)
        return json(200, body, this.etag(bare))
      }
      case 'PATCH': {
        const existing = this.records.get(bare) as Row | undefined
        if (!existing)
          return json(404, { detail: 'not found' })
        const version = Number(existing.version ?? 1)
        if (precondition?.version && precondition.version !== `"${version}"`)
          return json(409, { detail: 'version conflict', record: existing }, { ETag: `"${version}"` })
        const merged = { ...existing, ...body as object, version: version + 1 }
        this.records.set(bare, merged)
        return json(200, merged, { ETag: `"${version + 1}"` })
      }
      case 'DELETE': {
        if (spec && storeId === undefined) {
          const doomed = [...this.records].filter(([key, row]) =>
            key.startsWith(`${bare}/`) && matches(spec, row as Row, query))
          doomed.forEach(([key]) => { this.records.delete(key); this.versions.delete(key) })
          return json(200, { deleted: doomed.length })
        }
        this.records.delete(bare)
        this.versions.delete(bare)
        return json(204)
      }
      case 'POST':
        if (storeMatch && storeId === 'bulk') {
          const { records } = body as { records: Row[] }
          this.seedStore(storeMatch[1], records)
          return json(200, { count: records.length, after: null })
        }
        return json(405)
      default:
        return json(405)
    }
  }

  async get<T>(path: string): Promise<T | undefined> {
    const res = this.respond('GET', path)
    if (res.status === 404)
      return undefined
    if (!res.ok)
      throw new Error(`GET ${path} failed: ${res.status}`)
    return res.json()
  }

  async list<T>(path: string, query?: Record<string, string>): Promise<T[]> {
    const search = query ? `?${new URLSearchParams(query)}` : ''
    const res = this.respond('LIST', `${path}${search}`)
    if (!res.ok)
      throw new Error(`GET ${path} failed: ${res.status}`)
    return res.json()
  }

  async getVersioned<T>(path: string): Promise<Versioned<T>> {
    const res = this.respond('GET', path)
    if (res.status === 404)
      return { value: undefined, version: null }
    return { value: await res.json(), version: res.headers.get('ETag') }
  }

  async putVersioned<T>(path: string, body: T, version: string | null): Promise<VersionedPut<T>> {
    const interleaved = this.beforePut
    this.beforePut = null
    await interleaved?.()
    const res = this.respond('PUT', path, body, { version })
    if (res.status === 409) {
      const conflict = await res.json()
      return { ok: false, current: { value: conflict.record ?? undefined, version: res.headers.get('ETag') } }
    }
    if (!res.ok)
      throw new Error(`PUT ${path} failed: ${res.status} ${(await res.json()).detail}`)
    return { ok: true }
  }

  async put(path: string, body: unknown): Promise<void> {
    const res = this.respond('PUT', path, body)
    if (!res.ok)
      throw new Error(`PUT ${path} failed: ${res.status} ${(await res.json()).detail}`)
  }

  async del(path: string): Promise<void> {
    const res = this.respond('DELETE', path)
    if (!res.ok)
      throw new Error(`DELETE ${path} failed: ${res.status}`)
  }

  async bulk(store: string, records: unknown[], mode: 'import' | 'replace' = 'replace'): Promise<void> {
    const res = this.respond('POST', `/api/store/${store}/bulk`, { mode, records })
    if (!res.ok)
      throw new Error(`bulk ${store} failed: ${res.status}`)
  }

  async fetch(path: string, init?: RequestInit): Promise<Response> {
    const raw = init?.body
    const body = typeof raw === 'string' ? JSON.parse(raw) : raw ?? undefined
    const method = init?.method ?? 'GET'
    if (method === 'PATCH') {
      const interleaved = this.beforePatch
      this.beforePatch = null
      await interleaved?.()
      return this.respond(method, path, body, { version: new Headers(init?.headers).get('If-Match') })
    }
    const stored = this.records.get(path.split('?')[0])
    if (method === 'GET' && stored instanceof Blob) {
      this.calls.push({ method, path })
      return new Response(await stored.arrayBuffer(), { status: 200, headers: { 'Content-Type': stored.type } })
    }
    return this.respond(method, path, body)
  }
}

export function fakeDataClient(api: ApiClient = new FakeApiClient()): DataClient {
  return { api }
}
