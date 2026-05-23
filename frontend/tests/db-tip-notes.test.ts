import type { TipNote } from '@/features/learning-materials/domain/tips'

import { deleteDB, openDB } from 'idb'
import { afterEach, describe, expect, it } from 'vitest'
import { deleteTipNote, getTipNotesForVideo, initDB, putTipNote } from '@/db'
import 'fake-indexeddb/auto'

const DB_NAME = 'shadowlearn'

afterEach(async () => {
  await deleteDB(DB_NAME).catch(() => undefined)
})

function makeNote(overrides: Partial<TipNote> = {}): TipNote {
  return {
    id: crypto.randomUUID(),
    videoId: 'vid-1',
    title: 'My note',
    html: '<p>body</p>',
    createdAt: '2026-05-19T10:00:00.000Z',
    updatedAt: '2026-05-19T10:00:00.000Z',
    source: 'freeform',
    ...overrides,
  }
}

describe('tip-notes IDB store', () => {
  it('put + get round-trips a note keyed by [videoId, id]', async () => {
    const db = await initDB()
    const note = makeNote({ id: 'n1' })
    await putTipNote(db, note)
    const out = await getTipNotesForVideo(db, 'vid-1')
    expect(out).toHaveLength(1)
    expect(out[0]).toEqual(note)
    db.close()
  })

  it('lists only notes for the requested videoId', async () => {
    const db = await initDB()
    await putTipNote(db, makeNote({ id: 'a', videoId: 'vid-1' }))
    await putTipNote(db, makeNote({ id: 'b', videoId: 'vid-2' }))
    await putTipNote(db, makeNote({ id: 'c', videoId: 'vid-1' }))
    const out = await getTipNotesForVideo(db, 'vid-1')
    expect(out.map(n => n.id).sort()).toEqual(['a', 'c'])
    db.close()
  })

  it('returns notes sorted by updatedAt desc', async () => {
    const db = await initDB()
    await putTipNote(db, makeNote({ id: 'old', updatedAt: '2026-05-01T00:00:00.000Z' }))
    await putTipNote(db, makeNote({ id: 'new', updatedAt: '2026-05-19T00:00:00.000Z' }))
    await putTipNote(db, makeNote({ id: 'mid', updatedAt: '2026-05-10T00:00:00.000Z' }))
    const out = await getTipNotesForVideo(db, 'vid-1')
    expect(out.map(n => n.id)).toEqual(['new', 'mid', 'old'])
    db.close()
  })

  it('deleteTipNote removes the row', async () => {
    const db = await initDB()
    await putTipNote(db, makeNote({ id: 'gone' }))
    await deleteTipNote(db, 'vid-1', 'gone')
    const out = await getTipNotesForVideo(db, 'vid-1')
    expect(out).toEqual([])
    db.close()
  })
})

describe('tip-notes migration from v16', () => {
  it('upgrades a B3-shaped v16 db cleanly; B3 stores preserved, tip-notes added', async () => {
    // Simulate a real B3 deployment: stores present after the v16 migration.
    const earlier = await openDB(DB_NAME, 16, {
      upgrade(db) {
        db.createObjectStore('settings')
        db.createObjectStore('tip-courses', { keyPath: 'id' })
        db.createObjectStore('tip-studio', { keyPath: 'key' })
        db.createObjectStore('tip-cards', { keyPath: 'key' })
      },
    })
    await earlier.put('tip-courses', { id: 'c1', name: 'demo' } as any)
    await earlier.put('tip-cards', { key: 'k1', cards: [] } as any)
    earlier.close()

    // Now open at the latest version — initDB runs the v17 branch.
    const db = await initDB()
    expect(db.objectStoreNames.contains('tip-notes')).toBe(true)
    expect(await db.get('tip-courses', 'c1')).toMatchObject({ id: 'c1' })
    expect(await db.get('tip-cards', 'k1')).toMatchObject({ key: 'k1' })
    await putTipNote(db, makeNote({ id: 'migrated' }))
    const out = await getTipNotesForVideo(db, 'vid-1')
    expect(out.map(n => n.id)).toEqual(['migrated'])
    db.close()
  })
})
