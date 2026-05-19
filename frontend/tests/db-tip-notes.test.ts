import type { TipNote } from '@/types/tips'

import { deleteDB } from 'idb'
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
