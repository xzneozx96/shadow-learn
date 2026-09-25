import { openDB } from 'idb'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { detectLegacyData } from '@/features/migration/detectLegacyData'
import { legacyFixture, seedLegacyDatabase } from '../e2e/support/legacy-seed'
import 'fake-indexeddb/auto'
import './nested-blobs'

async function databaseNames(): Promise<(string | undefined)[]> {
  return (await indexedDB.databases()).map(info => info.name)
}

async function seedOnly(store: string, value: unknown, key: IDBValidKey) {
  await seedLegacyDatabase({ version: 21, stores: {} })
  const db = await openDB('shadowlearn', 21)
  await db.put(store as never, value as never, key as never)
  db.close()
}

describe('detectLegacyData', () => {
  beforeEach(() => { globalThis.indexedDB = new IDBFactory() })
  afterEach(() => { globalThis.indexedDB = new IDBFactory() })

  it('reports nothing and creates no database on a fresh profile', async () => {
    expect(await detectLegacyData()).toEqual({ present: false, counts: {} })
    expect(await databaseNames()).toEqual([])
  })

  it('reports in-scope data with per-store counts', async () => {
    await seedLegacyDatabase(legacyFixture())
    const result = await detectLegacyData()
    expect(result.present).toBe(true)
    expect(result.counts).toEqual(expect.objectContaining({ 'lessons': 3, 'vocabulary': 4, 'shadowing-audio': 2, 'tip-cards': 1, 'word-breakdowns': 2 }))
    expect(await databaseNames()).toEqual(['shadowlearn'])
  })

  it('deletes a database that holds only dropped stores', async () => {
    await seedOnly('tts-cache', new Blob(['x']), 'tts-1')
    expect((await detectLegacyData()).present).toBe(false)
    expect(await databaseNames()).toEqual([])
  })

  it('keeps a database that holds only encrypted keys, so the Keys step can offer them', async () => {
    await seedLegacyDatabase({ ...legacyFixture(), stores: {}, keys: { pin: '1234', plaintext: { openrouterApiKey: 'sk-or-dummy-1234' } } })
    const result = await detectLegacyData()
    expect(result).toEqual({ present: true, counts: expect.objectContaining({ keys: 1 }) })
  })
})
