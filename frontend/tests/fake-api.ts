import type { ApiClient, DataClient, LessonSummary, ShadowLearnDB } from '@/db'
import type { LessonMeta, Segment } from '@/shared/types'

export interface ApiCall {
  method: string
  path: string
  body?: unknown
}

const INDEX_FIELDS: Record<string, string> = {
  'by-surface': 'surface',
  'by-owner': 'ownerId',
  'by-lesson': 'lessonId',
}

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
    segments,
  }
}

function json(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export class FakeApiClient implements ApiClient {
  records = new Map<string, unknown>()
  calls: ApiCall[] = []
  private failures = new Map<string, number>()

  seed(path: string, body: unknown): this {
    this.records.set(path, structuredClone(body))
    return this
  }

  seedLesson(meta: LessonMeta, segments: Segment[] = []): this {
    return this.seed(`/api/lessons/${meta.id}`, lessonBody(meta, segments))
  }

  failWith(path: string, status: number): void {
    this.failures.set(path, status)
  }

  heal(path: string): void {
    this.failures.delete(path)
  }

  private collection(path: string, query?: Record<string, string>): unknown[] {
    const field = query?.index ? INDEX_FIELDS[query.index] : undefined
    return [...this.records]
      .filter(([key]) => key.startsWith(`${path}/`) && !key.slice(path.length + 1).includes('/'))
      .map(([, value]) => structuredClone(value))
      .filter(value => !field || (value as Record<string, unknown>)[field] === query?.value)
  }

  private respond(method: string, path: string, body?: unknown): Response {
    const [bare, search] = path.split('?')
    const verb = method === 'LIST' ? 'GET' : method
    this.calls.push(body === undefined ? { method: verb, path } : { method: verb, path, body })
    const failure = this.failures.get(bare)
    if (failure)
      return json(failure, { detail: `fake ${failure}` })
    switch (method) {
      case 'GET':
        if (this.records.has(bare))
          return json(200, structuredClone(this.records.get(bare)))
        return json(404, { detail: 'not found' })
      case 'LIST':
        return json(200, this.collection(bare, search ? Object.fromEntries(new URLSearchParams(search)) : undefined))
      case 'PUT':
        this.records.set(bare, structuredClone(body))
        return json(200, body)
      case 'PATCH': {
        const existing = this.records.get(bare)
        if (!existing)
          return json(404, { detail: 'not found' })
        const merged = { ...existing as object, ...body as object }
        this.records.set(bare, merged)
        return json(200, merged)
      }
      case 'DELETE':
        this.records.delete(bare)
        return json(204)
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

  async put(path: string, body: unknown): Promise<void> {
    const res = this.respond('PUT', path, body)
    if (!res.ok)
      throw new Error(`PUT ${path} failed: ${res.status}`)
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
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined
    return this.respond(init?.method ?? 'GET', path, body)
  }
}

export function fakeDataClient(legacy: ShadowLearnDB, api: ApiClient = new FakeApiClient()): DataClient {
  return { api, legacy }
}
