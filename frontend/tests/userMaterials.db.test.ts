import { deleteDB } from 'idb'
import { afterEach, describe, expect, it } from 'vitest'
import {
  deleteUserMaterial,
  getUserMaterialByExternalId,
  initDB,
  listUserMaterials,
  putUserMaterial,
} from '@/db'
import 'fake-indexeddb/auto'

const DB_NAME = 'shadowlearn'

afterEach(async () => {
  await deleteDB(DB_NAME).catch(() => undefined)
})

function fixture(overrides: Partial<Parameters<typeof putUserMaterial>[1]> = {}) {
  return {
    id: 'uuid-1',
    source: 'playlist' as const,
    externalId: 'PLabc123',
    name: 'My Test Playlist',
    skill: 'Grammar' as const,
    instructionLanguage: 'English' as const,
    contentType: 'tip' as const,
    cachedMeta: { thumbnailUrl: null, channel: null, videoCount: null },
    createdAt: '2026-05-20T00:00:00.000Z',
    ...overrides,
  }
}

describe('user-materials store', () => {
  it('round-trips a record', async () => {
    const db = await initDB()
    await putUserMaterial(db, fixture())
    const all = await listUserMaterials(db)
    expect(all).toHaveLength(1)
    expect(all[0].externalId).toBe('PLabc123')
    db.close()
  })

  it('lookup by externalId returns the record', async () => {
    const db = await initDB()
    await putUserMaterial(db, fixture())
    const hit = await getUserMaterialByExternalId(db, 'PLabc123')
    expect(hit?.id).toBe('uuid-1')
    const miss = await getUserMaterialByExternalId(db, 'PLmissing')
    expect(miss).toBeUndefined()
    db.close()
  })

  it('delete removes the record', async () => {
    const db = await initDB()
    await putUserMaterial(db, fixture())
    await deleteUserMaterial(db, 'uuid-1')
    const all = await listUserMaterials(db)
    expect(all).toHaveLength(0)
    db.close()
  })
})
