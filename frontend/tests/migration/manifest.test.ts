import type { Json } from '@/features/migration/canonical'
import type { ManifestStore } from '@/features/migration/exportStores'
import type { Ledger } from '@/features/migration/manifest'
import { describe, expect, it } from 'vitest'
import { storeDigest } from '@/features/migration/canonical'
import { emptyLedger, storeLedger, verify } from '@/features/migration/manifest'
import { uploadStore } from '@/features/migration/uploadRecords'
import { stubApi } from './stub-api'

type Stores = Partial<Record<ManifestStore, Record<string, Json>>>

const STORES: Stores = {
  'lessons': { l1: { id: 'l1', title: 'Greetings' } },
  'vocabulary': { w1: { id: 'w1', word: '你好', sourceLessonId: 'l1', createdAt: '2026-06-01' } },
  'learner-profile': { profile: { name: 'Ada', totalSessions: 3 } },
}

function ledgerWith(stores: Stores): Ledger {
  const ledger = emptyLedger('device-a', [])
  for (const [store, records] of Object.entries(stores)) {
    for (const [id, value] of Object.entries(records ?? {}))
      storeLedger(ledger, store as ManifestStore).expected.set(id, value)
  }
  return ledger
}

async function manifestFor(stores: Stores) {
  const digests = await Promise.all(Object.entries(stores).map(async ([store, records]) => [store, await storeDigest(Object.entries(records ?? {}))]))
  return { stores: Object.fromEntries(digests), quarantine: await storeDigest([]), media: [] }
}

describe('verify', () => {
  it('passes when the server holds exactly what the ledger expects', async () => {
    const manifest = await manifestFor(STORES)
    const { api, calls } = stubApi(() => ({ body: manifest }))
    const result = await verify(api, ledgerWith(STORES))
    expect(result.ok).toBe(true)
    expect(calls[0].body).toEqual({
      source: 'device-a',
      stores: { 'lessons': ['l1'], 'vocabulary': ['w1'], 'learner-profile': ['profile'] },
      present: {},
      dominance: {},
      quarantine: [],
      media: [],
    })
  })

  it('names the one store whose server hash differs', async () => {
    const manifest = await manifestFor({ ...STORES, vocabulary: { w1: { id: 'w1', word: 'changed' } } })
    const { api } = stubApi(() => ({ body: manifest }))
    const result = await verify(api, ledgerWith(STORES))
    expect(result.ok).toBe(false)
    expect(result.checks.filter(check => !check.ok)).toEqual([{ kind: 'store', store: 'vocabulary', count: 1, missing: 0, undominated: 0, absent: 0, ok: false }])
  })

  it('fails a blob whose server copy differs', async () => {
    const manifest = { ...(await manifestFor({})), media: [{ lessonId: 'l1', kind: 'video', size: 3, sha256: 'other' }] }
    const { api } = stubApi(() => ({ body: manifest }))
    const ledger = ledgerWith({})
    ledger.media.push({ key: { lessonId: 'l1', kind: 'video' }, size: 3, sha256: 'abc' })
    expect((await verify(api, ledger)).checks).toContainEqual({ kind: 'media', key: { lessonId: 'l1', kind: 'video' }, ok: false })
  })
})

describe('the quarantine', () => {
  it('blocks deletion when the kept raw record differs from what the device sent', async () => {
    const ledger = ledgerWith({})
    ledger.quarantine.set('spaced-repetition:w1', { store: 'spaced-repetition', recordId: 'w1', raw: { itemId: 'w1', itemType: 'sentence' }, error: [] })
    const kept = await storeDigest([['spaced-repetition:w1', { itemId: 'w1', itemType: 'changed' }]])
    const manifest = { ...(await manifestFor({})), quarantine: kept }
    const result = await verify(stubApi(() => ({ body: manifest })).api, ledger)
    expect(result.ok).toBe(false)
    expect(result.checks).toContainEqual({ kind: 'quarantine', count: 1, ok: false })
  })

  it('passes when the kept raw record is byte-identical', async () => {
    const ledger = ledgerWith({})
    const raw = { itemId: 'w1', itemType: 'sentence' }
    ledger.quarantine.set('spaced-repetition:w1', { store: 'spaced-repetition', recordId: 'w1', raw, error: [] })
    const manifest = { ...(await manifestFor({})), quarantine: await storeDigest([['spaced-repetition:w1', raw]]) }
    expect((await verify(stubApi(() => ({ body: manifest })).api, ledger)).ok).toBe(true)
  })
})

describe('anchoring to the local read', () => {
  it('fails a stored record the server wrote without one of its fields, and passes the echo-only check it replaced', async () => {
    const local = { id: 'w1', word: '你好', meaning: 'hello', sourceLessonId: 'l1', createdAt: '2026-06-01' }
    const { meaning: _dropped, ...lossy } = local
    const { api } = stubApi(() => ({ body: { count: 1, after: [lossy], outcomes: { w1: 'stored' } } }))
    const ledger = emptyLedger('device-a', [])
    await uploadStore(api, ledger, 'vocabulary', [{ id: 'w1', data: local }], () => {})
    const server = await manifestFor({ vocabulary: { w1: lossy } })
    const result = await verify(stubApi(() => ({ body: server })).api, ledger)
    expect(result.ok).toBe(false)
    expect(storeLedger(ledger, 'vocabulary').expected.get('w1')).toEqual(local)
  })

  it('accepts the account copy a union rule kept, by presence', async () => {
    const mine = { id: '__global', surface: 'global', ownerId: null, messages: [{ id: 'b' }], updatedAt: 2 }
    const account = { ...mine, messages: [{ id: 'a' }], updatedAt: 1 }
    const { api } = stubApi(() => ({ body: { count: 1, after: [account], outcomes: { __global: 'kept_server' } } }))
    const ledger = emptyLedger('device-b', [])
    await uploadStore(api, ledger, 'threads', [{ id: '__global', data: mine }], () => {})
    expect([...storeLedger(ledger, 'threads').present]).toEqual(['__global'])
    const server = { ...(await manifestFor({ threads: {} })), present: { threads: 1 } }
    expect((await verify(stubApi(() => ({ body: server })).api, ledger)).ok).toBe(true)
    const gone = { ...(await manifestFor({ threads: {} })), present: { threads: 0 } }
    expect((await verify(stubApi(() => ({ body: gone })).api, ledger)).ok).toBe(false)
  })

  it('fails a merged record the server says it does not dominate, and sends the local copy to judge', async () => {
    const local = { name: 'Ada', totalSessions: 4 }
    const merged = { name: 'Ada', totalSessions: 3 }
    const { api } = stubApi(() => ({ body: { count: 1, after: [merged], outcomes: { profile: 'merged' } } }))
    const ledger = emptyLedger('device-b', [])
    await uploadStore(api, ledger, 'learner-profile', [{ id: 'profile', data: local }], () => {})
    const server = { ...(await manifestFor({ 'learner-profile': { profile: merged } })), undominated: { 'learner-profile': ['profile'] } }
    const { api: manifestApi, calls } = stubApi(() => ({ body: server }))
    const result = await verify(manifestApi, ledger)
    expect(calls[0].body).toEqual(expect.objectContaining({ dominance: { 'learner-profile': [local] } }))
    expect(result.checks).toContainEqual(expect.objectContaining({ store: 'learner-profile', undominated: 1, ok: false }))
  })

  it('fails a record that changed both here and in the account', async () => {
    const { api } = stubApi(() => ({ body: { count: 1, after: [{ id: '__global' }], outcomes: { __global: 'conflict' } } }))
    const ledger = emptyLedger('device-a', [])
    await uploadStore(api, ledger, 'threads', [{ id: '__global', data: { id: '__global', messages: [] } }], () => {})
    const result = await verify(stubApi(async () => ({ body: await manifestFor({ threads: {} }) })).api, ledger)
    expect(result.checks).toContainEqual({ kind: 'conflict', store: 'threads', recordId: '__global', ok: false })
    expect(result.ok).toBe(false)
  })
})

describe('the after path', () => {
  it('expects the merged singleton the bulk import returned, not the local copy', async () => {
    const merged = { name: 'Ada', totalSessions: 7 }
    const { api } = stubApi(({ path }) => path === '/api/store/learner-profile/bulk' ? { body: { count: 1, after: [merged], outcomes: { profile: 'merged' } } } : undefined)
    const ledger = emptyLedger('device-a', [])
    await uploadStore(api, ledger, 'learner-profile', [{ id: 'profile', data: { name: 'Ada', totalSessions: 4 } }], () => {})
    expect(storeLedger(ledger, 'learner-profile').expected.get('profile')).toEqual(merged)

    const manifest = { ...(await manifestFor({ 'learner-profile': { profile: merged } })), undominated: { 'learner-profile': [] } }
    expect((await verify(stubApi(() => ({ body: manifest })).api, ledger)).ok).toBe(true)
  })

  it('fails a store when a sent id is missing from after', async () => {
    const { api } = stubApi(({ path }) => path === '/api/store/vocabulary/bulk' ? { body: { count: 1, after: [], outcomes: {} } } : undefined)
    const ledger = emptyLedger('device-a', [])
    await uploadStore(api, ledger, 'vocabulary', [{ id: 'w1', data: { id: 'w1' } }], () => {})
    const manifest = await manifestFor({ vocabulary: {} })
    const result = await verify(stubApi(() => ({ body: manifest })).api, ledger)
    expect(result.checks).toContainEqual({ kind: 'store', store: 'vocabulary', count: 1, missing: 1, undominated: 0, absent: 0, ok: false })
  })
})
