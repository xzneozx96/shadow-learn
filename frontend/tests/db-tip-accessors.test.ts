import { afterEach, describe, expect, it } from 'vitest'
import { getTipCourse, getTipProgress, initDB, listTipProgressForCourse, putTipCourse, putTipProgress } from '../src/db'
import 'fake-indexeddb/auto'

afterEach(async () => {
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase('shadowlearn')
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
    req.onblocked = () => resolve()
  })
})

describe('tip DB accessors', () => {
  it('persists and reads a TipCourse', async () => {
    const db = await initDB()
    await putTipCourse(db, {
      id: 'PL123',
      source: 'playlist',
      name: 'Pronunciation',
      thumbnailUrl: null,
      channel: 'ChinesePod',
      topic: 'Pronunciation',
      videoIds: ['v1', 'v2'],
      fetchedAt: '2026-05-17T00:00:00Z',
    })
    expect(await getTipCourse(db, 'PL123')).toMatchObject({ id: 'PL123', videoIds: ['v1', 'v2'] })
    db.close()
  })

  it('lists progress entries for a course via by-course index', async () => {
    const db = await initDB()
    await putTipProgress(db, {
      key: 'PL123:v1',
      courseId: 'PL123',
      videoId: 'v1',
      watchedSec: 60,
      totalSec: 240,
      completed: false,
      completedAt: null,
      lastSeenAt: '2026-05-17T00:00:00Z',
    })
    await putTipProgress(db, {
      key: 'PL123:v2',
      courseId: 'PL123',
      videoId: 'v2',
      watchedSec: 240,
      totalSec: 240,
      completed: true,
      completedAt: '2026-05-17T00:01:00Z',
      lastSeenAt: '2026-05-17T00:01:00Z',
    })
    await putTipProgress(db, {
      key: 'OTHER:v1',
      courseId: 'OTHER',
      videoId: 'v1',
      watchedSec: 0,
      totalSec: 100,
      completed: false,
      completedAt: null,
      lastSeenAt: '2026-05-17T00:00:00Z',
    })
    const rows = await listTipProgressForCourse(db, 'PL123')
    expect(rows).toHaveLength(2)
    expect(rows.map(r => r.videoId).sort()).toEqual(['v1', 'v2'])
    db.close()
  })

  it('returns undefined for missing progress', async () => {
    const db = await initDB()
    expect(await getTipProgress(db, 'NOPE:NOPE')).toBeUndefined()
    db.close()
  })
})
