import type { LegacySnapshot, RecordStore } from '@/features/migration/exportStores'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { canonical, toJson } from '@/features/migration/canonical'
import { openLegacy } from '@/features/migration/detectLegacyData'
import { deviceSource, KEY_PATHS, readSnapshot, uuidV5 } from '@/features/migration/exportStores'
import specsSource from '../../../backend/app/userdata/specs.py?raw'
import { LEGACY_LESSON, legacyFixture, LESSON_A, seedLegacyDatabase } from '../e2e/support/legacy-seed'
import 'fake-indexeddb/auto'
import './nested-blobs'

function records(snapshot: LegacySnapshot, store: RecordStore) {
  return snapshot.stores.find(entry => entry.store === store)!.records
}

async function snapshotOf(options: Parameters<typeof legacyFixture>[0] = {}) {
  await seedLegacyDatabase(legacyFixture(options))
  const db = await openLegacy()
  const snapshot = await readSnapshot(db)
  return { db, snapshot }
}

describe('readSnapshot', () => {
  beforeEach(() => { globalThis.indexedDB = new IDBFactory() })
  afterEach(() => { globalThis.indexedDB = new IDBFactory() })

  it('remaps lesson_<ms> ids to a UUIDv5 in every field that names a lesson', async () => {
    const { snapshot } = await snapshotOf()
    const remapped = await uuidV5(LEGACY_LESSON)
    expect(snapshot.lessons.map(lesson => lesson.id).sort()).toEqual([LESSON_A, remapped].sort())
    expect(records(snapshot, 'vocabulary').find(r => r.data.word === '词99')!.data.sourceLessonId).toBe(remapped)
    expect(records(snapshot, 'agent-memory').find(r => r.data.lessonId !== undefined)!.data.lessonId).toBe(remapped)
    expect(records(snapshot, 'shadowing-bests')[0]).toEqual(expect.objectContaining({ id: `${remapped}:s1` }))
    const thread = records(snapshot, 'threads').find(r => r.data.surface === 'lesson')!
    expect([thread.id, thread.data.ownerId]).toEqual([remapped, remapped])
    expect(records(snapshot, 'thread-summaries')[0].data.threadId).toBe(remapped)
    expect(snapshot.media.map(item => item.key)).toContainEqual({ lessonId: remapped, kind: 'audio' })
  })

  it('keeps the title in the lesson record and only client fields in meta', async () => {
    const { snapshot } = await snapshotOf()
    const lesson = snapshot.lessons.find(l => l.id === LESSON_A)!
    expect(lesson.lesson.title).toBe('Greetings, renamed')
    expect(lesson.lesson.meta).toEqual({ progressSegmentId: 's2', tags: ['greetings'] })
    expect(lesson.segments).toHaveLength(2)
  })

  it('skips unfinished lessons and blobs that belong to no imported lesson', async () => {
    const { snapshot } = await snapshotOf()
    expect(snapshot.skipped).toEqual({ unfinishedLessons: 1, orphanMedia: 1, storylessBreakdowns: 1 })
    expect(snapshot.media.map(item => item.key.kind).sort()).toEqual(['audio', 'shadowing', 'video'])
  })

  it('splits legacy exercise-stats keys at the last colon', async () => {
    const { snapshot } = await snapshotOf()
    const ids = records(snapshot, 'exercise-stats').map(r => [r.data.vocabId, r.data.exerciseType])
    expect(ids).toContainEqual(['vocab:with:colons', 'dictation'])
    expect(ids).toContainEqual([`vocab-${LESSON_A.slice(0, 6)}-0`, 'cloze'])
  })

  it('turns tip-cards into per-card states and stories into (word, lang) rows', async () => {
    const { snapshot } = await snapshotOf()
    expect(records(snapshot, 'tip-card-states')).toEqual([{
      id: 'video-1:en',
      data: {
        videoId: 'video-1',
        locale: 'en',
        states: {
          'What is tone 3?': { state: 'known', updatedAt: '2026-06-01T10:00:00.000Z' },
          'What is tone 4?': { state: 'learning', updatedAt: '2026-06-01T11:00:00.000Z' },
        },
      },
    }])
    expect(records(snapshot, 'word-stories')).toEqual([{
      id: '你好:vi',
      data: { word: '你好', lang: 'vi', story: 'A person greets a friend at the door.', updatedAt: '2026-06-01T10:00:00.000Z' },
    }])
  })

  it('reads the same snapshot twice, so a retry resends identical payloads', async () => {
    const { db, snapshot } = await snapshotOf()
    const again = await readSnapshot(db)
    const shape = (s: LegacySnapshot) => canonical(toJson({ lessons: s.lessons, stores: s.stores, media: s.media.map(m => m.key) }))
    expect(shape(again)).toBe(shape(snapshot))
  })

  it('upgrades a version 10 database and imports its chats as threads', async () => {
    const { snapshot } = await snapshotOf({ version: 10 })
    expect(records(snapshot, 'threads').map(r => r.id).sort()).toEqual(['__global', LESSON_A].sort())
    expect(records(snapshot, 'speak-sessions')).toHaveLength(1)
  })

  it('keeps one device id for the life of the database', async () => {
    const { db } = await snapshotOf()
    const first = await deviceSource(db)
    expect(await deviceSource(db)).toBe(first)
  })

  it('matches the export shape the backend checks in test_importer_legacy_shapes.py', async () => {
    const { snapshot } = await snapshotOf()
    const exported = {
      lessons: snapshot.lessons,
      stores: Object.fromEntries(snapshot.stores.map(({ store, records }) => [store, records])),
    }
    await expect(`${JSON.stringify(exported, null, 2)}\n`).toMatchFileSnapshot('../../../backend/tests/fixtures/legacy-export.json')
  })
})

describe('uuidV5', () => {
  it('matches the RFC 9562 example', async () => {
    expect(await uuidV5('www.example.com', '6ba7b810-9dad-11d1-80b4-00c04fd430c8')).toBe('2ed6657d-e927-568b-95e1-2665a8aea6a2')
  })
})

function serverKeyPaths(): Record<string, { keyPath: string[] } | { singleton: string }> {
  const body = specsSource.slice(specsSource.indexOf('_SPECS = ('))
  const specs: Record<string, { keyPath: string[] } | { singleton: string }> = {}
  for (const chunk of body.split('StoreSpec(').slice(1)) {
    if (chunk.includes('client_writable=False'))
      continue
    const name = /"([^"]+)"/.exec(chunk)![1]
    const singleton = /singleton_id="([^"]+)"/.exec(chunk)?.[1]
    const keyPath = /key_path=\(([^)]*)\)/.exec(chunk)?.[1] ?? ''
    specs[name] = singleton ? { singleton } : { keyPath: Array.from(keyPath.matchAll(/"([^"]+)"/g), m => m[1]) }
  }
  return specs
}

describe('kEY_PATHS', () => {
  it('match the client-writable stores in backend/app/userdata/specs.py', () => {
    expect(KEY_PATHS).toEqual(serverKeyPaths())
  })
})
