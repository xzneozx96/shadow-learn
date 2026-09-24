import type { Call } from './stub-api'
import type { Json, JsonObject } from '@/features/migration/canonical'
import type { RecordStore } from '@/features/migration/exportStores'
import { blobDigest, storeDigest } from '@/features/migration/canonical'
import { recordId } from '@/features/migration/exportStores'

interface ManifestBody {
  stores: Record<string, string[]>
  quarantine?: { store: string, recordId: string }[]
  media?: { lessonId: string, kind: string, segmentId?: string }[]
}

const BULK = /^\/api\/store\/([^/]+)\/bulk$/

const mediaKey = (key: { lessonId: string, kind: string, segmentId?: string | null }) => `${key.lessonId}:${key.kind}:${key.segmentId ?? ''}`

export function fakeImportServer() {
  const stores = new Map<string, Map<string, Json>>()
  const quarantine = new Map<string, Json>()
  const media = new Map<string, { size: number, sha256: string }>()
  const keys = new Map<string, unknown>()
  const state = { fault: null as string | null, down: false, rejectLesson: null as string | null, rejectRecord: null as string | null, onManifest: null as (() => Promise<void>) | null }
  const store = (name: string) => stores.get(name) ?? stores.set(name, new Map()).get(name)!

  async function handle({ method, path, body }: Call) {
    if (state.down)
      return { status: 503, body: { detail: 'Service Unavailable' } }
    if (method === 'PUT' && path.startsWith('/api/keys/')) {
      keys.set(path.slice('/api/keys/'.length), body)
      return { body: {} }
    }
    if (method === 'GET' && path === '/api/keys')
      return { body: ['openrouter', 'azure_speech', 'google'].map(provider => ({ provider, source: keys.has(provider) ? 'user' : 'none' })) }
    if (method === 'GET' && path === '/api/store/user-materials')
      return { body: [...store('user-materials').values()] }
    if (path === '/api/import/lessons') {
      const sent = (body as { lessons: (JsonObject & { segments: Json })[] }).lessons
      const rejected = sent.findIndex(lesson => lesson.id === state.rejectLesson)
      if (rejected !== -1)
        return { status: 422, body: { detail: [{ loc: ['body', 'lessons', rejected, 'source'], msg: 'Input should be youtube, upload or blog' }] } }
      for (const { segments, ...lesson } of sent) {
        if (!store('lessons').has(String(lesson.id))) {
          store('lessons').set(String(lesson.id), lesson)
          store('segments').set(String(lesson.id), segments)
        }
      }
      return { body: { count: sent.length, after: sent.map(({ id }) => ({ lesson: store('lessons').get(String(id)), segments: store('segments').get(String(id)) })) } }
    }
    const bulk = BULK.exec(path)
    if (bulk) {
      const target = store(bulk[1])
      const bad = (body as { records: JsonObject[] }).records.findIndex(record => recordId(bulk[1] as RecordStore, record) === state.rejectRecord)
      if (bad !== -1)
        return { status: 422, body: { detail: [{ loc: ['body', 'records', bad, 'itemType'], msg: 'Input should be \'vocabulary\'' }] } }
      const ids = (body as { records: JsonObject[] }).records.map((record) => {
        const id = recordId(bulk[1] as RecordStore, record)!
        if (!target.has(id))
          target.set(id, record)
        return id
      })
      return { body: { count: ids.length, after: ids.map(id => target.get(id)) } }
    }
    if (path === '/api/import/quarantine') {
      for (const record of (body as { records: { store: string, recordId: string, raw: Json }[] }).records)
        quarantine.set(`${record.store}:${record.recordId}`, record.raw)
      return { body: {} }
    }
    if (path === '/api/import/media') {
      const form = body as FormData
      media.set(mediaKey({ lessonId: String(form.get('lesson_id')), kind: String(form.get('kind')), segmentId: form.get('segment_id')?.toString() }), await blobDigest(form.get('file') as Blob))
      return { body: {} }
    }
    if (path === '/api/import/manifest') {
      const request = body as ManifestBody
      const hook = state.onManifest
      state.onManifest = null
      await hook?.()
      const digests: Record<string, unknown> = {}
      for (const [name, ids] of Object.entries(request.stores)) {
        const held = ids.filter(id => store(name).has(id)).map(id => [id, store(name).get(id)!] as [string, Json])
        const hashed = state.fault === name ? held.slice(1) : held
        digests[name] = { count: held.length, sha256: (await storeDigest(hashed)).sha256 }
      }
      const kept = (request.quarantine ?? []).map(key => `${key.store}:${key.recordId}`).filter(key => quarantine.has(key))
      return {
        body: {
          stores: digests,
          quarantine: await storeDigest(kept.map(key => [key, quarantine.get(key)!])),
          media: (request.media ?? []).map(key => media.has(mediaKey(key)) ? { ...key, ...media.get(mediaKey(key)) } : null),
        },
      }
    }
    return undefined
  }

  return { handle, stores, keys, media, state }
}
