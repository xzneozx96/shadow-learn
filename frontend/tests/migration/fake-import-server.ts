import type { Call } from './stub-api'
import type { Json, JsonObject } from '@/features/migration/canonical'
import type { RecordStore } from '@/features/migration/exportStores'
import { blobDigest, storeDigest } from '@/features/migration/canonical'
import { recordId } from '@/features/migration/exportStores'

interface ManifestBody {
  stores: Record<string, string[]>
  present?: Record<string, string[]>
  quarantine?: { store: string, recordId: string }[]
  media?: { lessonId: string, kind: string, segmentId?: string }[]
  quarantinedMedia?: { lessonId: string, kind: string, segmentId?: string }[]
}

const BULK = /^\/api\/store\/([^/]+)\/bulk$/

const mediaKey = (key: { lessonId: string, kind: string, segmentId?: string | null }) => `${key.lessonId}:${key.kind}:${key.segmentId ?? ''}`

export function fakeImportServer() {
  const stores = new Map<string, Map<string, Json>>()
  const quarantine = new Map<string, Json>()
  const quarantineErrors = new Map<string, Json>()
  const media = new Map<string, { size: number, sha256: string }>()
  const quarantinedMedia = new Map<string, { size: number, sha256: string }>()
  const keys = new Map<string, unknown>()
  const state = { fault: null as string | null, down: false, rejectLesson: null as string | null, rejectRecord: null as string | null, dropField: null as string | null, onManifest: null as (() => Promise<void>) | null, conflicts: new Set<string>(), dropQuarantinedMedia: false }
  const writer = new Map<string, string>()
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
      const outcomes: Record<string, string> = {}
      for (const { segments, ...lesson } of sent) {
        const id = String(lesson.id)
        if (state.conflicts.has(`lessons:${id}`)) {
          store('lessons').set(id, { ...lesson, title: 'Edited in the account' })
          store('segments').set(id, segments)
          outcomes[id] = 'conflict'
          continue
        }
        if (!store('lessons').has(id)) {
          store('lessons').set(id, lesson)
          store('segments').set(id, segments)
        }
        outcomes[id] = JSON.stringify(store('lessons').get(id)) === JSON.stringify(lesson) ? 'stored' : 'kept_server'
      }
      return { body: { count: sent.length, outcomes, after: sent.map(({ id }) => ({ lesson: store('lessons').get(String(id)), segments: store('segments').get(String(id)) })) } }
    }
    const bulk = BULK.exec(path)
    if (bulk) {
      const target = store(bulk[1])
      const bad = (body as { records: JsonObject[] }).records.findIndex(record => recordId(bulk[1] as RecordStore, record) === state.rejectRecord)
      if (bad !== -1)
        return { status: 422, body: { detail: [{ loc: ['body', 'records', bad, 'itemType'], msg: 'Input should be \'vocabulary\'' }] } }
      const { records, source } = body as { records: JsonObject[], source: string }
      const outcomes: Record<string, string> = {}
      for (const record of records) {
        const id = recordId(bulk[1] as RecordStore, record)!
        const key = `${bulk[1]}:${id}`
        if (state.conflicts.has(key)) {
          target.set(id, { ...record, editedInAccount: true })
          outcomes[id] = 'conflict'
          continue
        }
        if (!target.has(id)) {
          const { [state.dropField ?? '']: _dropped, ...kept } = record
          target.set(id, state.dropField ? kept : record)
          writer.set(key, source)
        }
        outcomes[id] = writer.get(key) === source ? 'stored' : 'kept_server'
      }
      return { body: { count: records.length, outcomes, after: Object.keys(outcomes).map(id => target.get(id)) } }
    }
    if (path === '/api/import/quarantine') {
      for (const record of (body as { records: { store: string, recordId: string, raw: Json, error: Json }[] }).records) {
        quarantine.set(`${record.store}:${record.recordId}`, record.raw)
        quarantineErrors.set(`${record.store}:${record.recordId}`, record.error)
      }
      return { body: {} }
    }
    if (path === '/api/import/media') {
      const form = body as FormData
      const key = mediaKey({ lessonId: String(form.get('lesson_id')), kind: String(form.get('kind')), segmentId: form.get('segment_id')?.toString() })
      const digest = await blobDigest(form.get('file') as Blob)
      if (form.get('quarantine') !== 'true')
        media.set(key, digest)
      else if (!state.dropQuarantinedMedia)
        quarantinedMedia.set(key, digest)
      return { body: {} }
    }
    if (path === '/api/import/manifest') {
      const request = body as ManifestBody
      const hook = state.onManifest
      state.onManifest = null
      await hook?.()
      const present = Object.fromEntries(Object.entries(request.present ?? {}).map(([name, ids]) => [name, ids.filter(id => store(name).has(id)).length]))
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
          present,
          quarantine: await storeDigest(kept.map(key => [key, quarantine.get(key)!])),
          media: (request.media ?? []).map(key => media.has(mediaKey(key)) ? { ...key, ...media.get(mediaKey(key)) } : null),
          quarantinedMedia: (request.quarantinedMedia ?? []).map(key => quarantinedMedia.has(mediaKey(key)) ? { ...key, ...quarantinedMedia.get(mediaKey(key)) } : null),
        },
      }
    }
    return undefined
  }

  return { handle, stores, keys, media, quarantinedMedia, quarantine, quarantineErrors, state }
}
