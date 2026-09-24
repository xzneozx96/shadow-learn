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
      quarantine: [],
      media: [],
    })
  })

  it('names the one store whose server hash differs', async () => {
    const manifest = await manifestFor({ ...STORES, vocabulary: { w1: { id: 'w1', word: 'changed' } } })
    const { api } = stubApi(() => ({ body: manifest }))
    const result = await verify(api, ledgerWith(STORES))
    expect(result.ok).toBe(false)
    expect(result.checks.filter(check => !check.ok)).toEqual([{ kind: 'store', store: 'vocabulary', count: 1, missing: 0, ok: false }])
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

describe('the after path', () => {
  it('expects the merged singleton the bulk import returned, not the local copy', async () => {
    const merged = { name: 'Ada', totalSessions: 7 }
    const { api } = stubApi(({ path }) => path === '/api/store/learner-profile/bulk' ? { body: { count: 1, after: [merged] } } : undefined)
    const ledger = emptyLedger('device-a', [])
    await uploadStore(api, ledger, 'learner-profile', [{ id: 'profile', data: { name: 'Ada', totalSessions: 4 } }], () => {})
    expect(storeLedger(ledger, 'learner-profile').expected.get('profile')).toEqual(merged)

    const manifest = await manifestFor({ 'learner-profile': { profile: merged } })
    expect((await verify(stubApi(() => ({ body: manifest })).api, ledger)).ok).toBe(true)
  })

  it('fails a store when a sent id is missing from after', async () => {
    const { api } = stubApi(({ path }) => path === '/api/store/vocabulary/bulk' ? { body: { count: 1, after: [] } } : undefined)
    const ledger = emptyLedger('device-a', [])
    await uploadStore(api, ledger, 'vocabulary', [{ id: 'w1', data: { id: 'w1' } }], () => {})
    const manifest = await manifestFor({ vocabulary: {} })
    const result = await verify(stubApi(() => ({ body: manifest })).api, ledger)
    expect(result.checks).toContainEqual({ kind: 'store', store: 'vocabulary', count: 1, missing: 1, ok: false })
  })
})
