import type { DataClient } from '@/db'
import type { LessonMeta, Segment } from '@/shared/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createApiClient,
  deleteChatMessages,
  deleteFullLesson,
  deleteLessonMeta,
  deleteThread,
  getAllLessonMetas,
  getLatestSummary,
  getLesson,
  getLessonMeta,
  getSegments,
  getSettings,
  getThread,
  listThreadsBySurface,
  putThreadSummary,
  refreshMediaTicket,
  renameLesson,
  saveLessonMeta,
  saveThreadMessages,
  updateSettings,
} from '@/db'
import { FakeApiClient, fakeDataClient, lessonBody } from './fake-api'

const meta: LessonMeta = {
  id: 'l1',
  title: 'Server Title',
  source: 'upload',
  sourceUrl: null,
  duration: 90,
  translationLanguages: ['en'],
  sourceLanguage: 'zh-CN',
  createdAt: '2026-09-01T00:00:00.000Z',
  lastOpenedAt: '2026-09-02T00:00:00.000Z',
  progressSegmentId: 's2',
  tags: ['hsk3'],
}

const segments: Segment[] = [
  { id: 's1', start: 0, end: 2, text: '你好', romanization: 'nǐ hǎo', translations: { en: 'hi' }, words: [] },
  { id: 's2', start: 2, end: 4, text: '再见', romanization: 'zài jiàn', translations: { en: 'bye' }, words: [] },
]

let api: FakeApiClient
let db: DataClient

beforeEach(() => {
  api = new FakeApiClient()
  db = fakeDataClient(api)
})

describe('lesson helpers', () => {
  it('getAllLessonMetas maps the snake_case summaries from GET /api/lessons', async () => {
    api.seedLesson(meta, segments)

    const lessons = await getAllLessonMetas(db)

    expect(api.calls).toEqual([{ method: 'GET', path: '/api/lessons' }])
    expect(lessons).toEqual([{ ...meta, segmentCount: 2, isDone: undefined }])
  })

  it('reads the title column over a stale meta.title and falls back to created_at for a never-opened lesson', async () => {
    api.seed('/api/lessons/l1', { ...lessonBody(meta), last_opened_at: null, meta: { title: 'Stale' } })

    const [lesson] = await getAllLessonMetas(db)

    expect(lesson.title).toBe('Server Title')
    expect(lesson.lastOpenedAt).toBe(meta.createdAt)
    expect(lesson.progressSegmentId).toBeNull()
    expect(lesson.tags).toEqual([])
  })

  it('getLesson, getLessonMeta, and getSegments read GET /api/lessons/{id}', async () => {
    api.seed('/api/lessons/l1', { ...lessonBody(meta, segments), video_url: '/api/media/m-9?token=abc' })

    const lesson = await getLesson(db, 'l1')
    expect(lesson?.segments).toEqual(segments)
    expect(lesson?.media).toEqual({ id: 'm-9', kind: 'video', url: '/api/media/m-9?token=abc' })
    expect((await getLessonMeta(db, 'l1'))?.title).toBe('Server Title')
    expect(await getSegments(db, 'l1')).toEqual(segments)
    expect(api.calls.every(c => c.method === 'GET' && c.path === '/api/lessons/l1')).toBe(true)
  })

  it('getAllLessonMetas carries the summary media ticket on each lesson', async () => {
    api.seed('/api/lessons/l1', { ...lessonBody(meta), video_url: '/api/media/m-9?token=abc' })

    const [lesson] = await getAllLessonMetas(db)

    expect(lesson.media).toEqual({ id: 'm-9', kind: 'video', url: '/api/media/m-9?token=abc' })
    expect(api.calls).toEqual([{ method: 'GET', path: '/api/lessons' }])
  })

  it('reads an audio-only lesson as audio media', async () => {
    api.seed('/api/lessons/l1', { ...lessonBody(meta), audio_url: '/api/media/a-1?token=x' })

    expect((await getLesson(db, 'l1'))?.media?.kind).toBe('audio')
  })

  it('returns undefined for a lesson the server does not have', async () => {
    expect(await getLesson(db, 'missing')).toBeUndefined()
  })

  it('saveLessonMeta PATCHes only the client-owned fields and last_opened_at', async () => {
    api.seedLesson(meta)

    await saveLessonMeta(db, { ...meta, title: 'Renamed', isDone: true, status: 'complete', jobId: 'j', currentStep: 'x' })

    expect(api.calls).toEqual([{
      method: 'PATCH',
      path: '/api/lessons/l1',
      body: {
        meta: { progressSegmentId: 's2', tags: ['hsk3'], isDone: true },
        last_opened_at: meta.lastOpenedAt,
      },
    }])
  })

  it('renameLesson PATCHes only the title', async () => {
    api.seedLesson(meta)

    await renameLesson(db, 'l1', 'Renamed')

    expect(api.calls).toEqual([{ method: 'PATCH', path: '/api/lessons/l1', body: { title: 'Renamed' } }])
  })

  it('saveLessonMeta throws when the server rejects the PATCH', async () => {
    await expect(saveLessonMeta(db, meta)).rejects.toThrow()
  })

  it('deleteLessonMeta and deleteFullLesson DELETE the lesson and its thread', async () => {
    api.seedLesson(meta)
    await deleteLessonMeta(db, 'l1')
    expect(api.calls).toEqual([{ method: 'DELETE', path: '/api/lessons/l1' }])

    api.calls = []
    await deleteFullLesson(db, 'l1')
    expect(api.calls).toEqual(expect.arrayContaining([
      { method: 'DELETE', path: '/api/lessons/l1' },
      { method: 'DELETE', path: '/api/store/threads/l1' },
      { method: 'DELETE', path: '/api/store/thread-summaries/l1' },
    ]))
  })

  it('refreshMediaTicket POSTs /api/media/{id}/ticket and returns its url', async () => {
    const send = vi.fn(async () => new Response(JSON.stringify({ token: 't', url: '/api/media/m1?token=t', expires_in: 600 })))
    const client: DataClient = { api: createApiClient(send) }

    expect(await refreshMediaTicket(client, 'm1')).toBe('/api/media/m1?token=t')
    expect(send).toHaveBeenCalledWith('/api/media/m1/ticket', { method: 'POST' })
  })
})

describe('settings helpers', () => {
  it('round-trips through /api/store/settings/settings', async () => {
    expect(await getSettings(db)).toBeUndefined()

    await updateSettings(db, () => ({ translationLanguage: 'vi', uiLanguage: 'en' }))

    expect(await getSettings(db)).toEqual({ translationLanguage: 'vi', uiLanguage: 'en' })
    expect(api.calls.map(c => `${c.method} ${c.path}`)).toEqual([
      'GET /api/store/settings/settings',
      'GET /api/store/settings/settings',
      'PUT /api/store/settings/settings',
      'GET /api/store/settings/settings',
    ])
  })
})

describe('thread helpers', () => {
  it('saveThreadMessages PUTs the thread and keeps createdAt and tip ids from the stored one', async () => {
    const msgs = [{ id: 'a', role: 'user', parts: [{ type: 'text', text: 'hello' }] }] as any
    await saveThreadMessages(db, 'c:v', { messages: [], seen: new Set(), surface: 'tip', ownerId: 'c:v', courseId: 'c', videoId: 'v' })
    const createdAt = (await getThread(db, 'c:v'))!.createdAt

    await saveThreadMessages(db, 'c:v', { messages: msgs, seen: new Set(), surface: 'tip', ownerId: 'c:v' })

    const thread = await getThread(db, 'c:v')
    expect(thread).toMatchObject({ id: 'c:v', surface: 'tip', ownerId: 'c:v', courseId: 'c', videoId: 'v', messages: msgs, createdAt })
    expect(api.calls.filter(c => c.method === 'PUT').map(c => c.path)).toEqual([
      '/api/store/threads/c%3Av',
      '/api/store/threads/c%3Av',
    ])
  })

  it('listThreadsBySurface queries the by-surface index', async () => {
    await saveThreadMessages(db, 'l1', { messages: [], seen: new Set(), surface: 'lesson', ownerId: 'l1' })
    await saveThreadMessages(db, '__global', { messages: [], seen: new Set(), surface: 'global', ownerId: null })
    api.calls = []

    const threads = await listThreadsBySurface(db, 'lesson')

    expect(threads.map(t => t.id)).toEqual(['l1'])
    expect(api.calls).toEqual([{ method: 'GET', path: '/api/store/threads?index=by-surface&value=lesson' }])
  })

  it('putThreadSummary and getLatestSummary use /api/store/thread-summaries/{threadId}', async () => {
    const summary = { threadId: 't1', summary: 's', coversThroughMessageId: 'm', tokenBudget: 10, createdAt: 1 }

    await putThreadSummary(db, summary)

    expect(await getLatestSummary(db, 't1')).toEqual(summary)
    expect(api.calls[0]).toEqual({ method: 'PUT', path: '/api/store/thread-summaries/t1', body: summary })
  })

  it('deleteThread DELETEs the thread and its summary', async () => {
    await deleteThread(db, 't1')

    expect(api.calls).toEqual([
      { method: 'DELETE', path: '/api/store/threads/t1' },
      { method: 'DELETE', path: '/api/store/thread-summaries/t1' },
    ])
  })

  it('deleteChatMessages deletes the lesson thread', async () => {
    await saveThreadMessages(db, 'l1', { messages: [], seen: new Set(), surface: 'lesson', ownerId: 'l1' })

    await deleteChatMessages(db, 'l1')

    expect(await getThread(db, 'l1')).toBeUndefined()
  })
})

describe('createApiClient', () => {
  function respond(status: number, body?: unknown) {
    return vi.fn(async () => new Response(body === undefined ? null : JSON.stringify(body), { status }))
  }

  it('get turns 404 into undefined and other failures into the server detail', async () => {
    expect(await createApiClient(respond(404, { detail: 'nope' })).get('/x')).toBeUndefined()
    await expect(createApiClient(respond(500, { detail: 'boom' })).get('/x')).rejects.toThrow('boom')
  })

  it('list, put, del, and bulk send the expected requests', async () => {
    const send = respond(200, [])
    const client = createApiClient(send)

    await client.list('/api/store/threads', { index: 'by-surface', value: 'tip' })
    await client.put('/api/store/settings/settings', { uiLanguage: 'en' })
    await client.del('/api/lessons/l1')
    await client.bulk('vocabulary', [{ id: 'v1' }])

    expect(send.mock.calls).toEqual([
      ['/api/store/threads?index=by-surface&value=tip', undefined],
      ['/api/store/settings/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{"uiLanguage":"en"}' }],
      ['/api/lessons/l1', { method: 'DELETE' }],
      ['/api/store/vocabulary/bulk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"mode":"replace","records":[{"id":"v1"}]}' }],
    ])
  })
})
