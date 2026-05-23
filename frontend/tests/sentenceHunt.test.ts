import type { ShadowLearnDB } from '@/db'
import type { LessonMeta, Segment } from '@/shared/types'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { initDB, saveLessonMeta, saveSegments } from '@/db'
import { findSegmentsForWords } from '@/shared/lib/sentenceHunt'
import 'fake-indexeddb/auto'

function makeLesson(id: string, createdAt: string): LessonMeta {
  return {
    id,
    title: `Lesson ${id}`,
    source: 'youtube',
    sourceUrl: null,
    translationLanguages: ['en'],
    createdAt,
    lastOpenedAt: createdAt,
    progressSegmentId: null,
    tags: [],
    status: 'complete',
  }
}

function makeSegment(id: string, words: string[]): Segment {
  return {
    id,
    start: 0,
    end: 1,
    text: words.join(''),
    romanization: '',
    translations: { en: 'test' },
    words: words.map(w => ({ word: w, romanization: '', meaning: '', usage: '' })),
  }
}

let db: ShadowLearnDB

beforeEach(async () => {
  db = await initDB()
})

afterEach(() => {
  db.close()
  globalThis.indexedDB = new IDBFactory()
})

describe('findSegmentsForWords', () => {
  it('returns empty array when dueWords is empty', async () => {
    expect(await findSegmentsForWords(db, [])).toEqual([])
  })

  it('returns empty array when no matching segments', async () => {
    await saveLessonMeta(db, makeLesson('l1', '2026-05-13T00:00:00.000Z'))
    await saveSegments(db, 'l1', [makeSegment('s1', ['你', '好'])])
    expect(await findSegmentsForWords(db, ['喝'])).toEqual([])
  })

  it('returns matching segments', async () => {
    await saveLessonMeta(db, makeLesson('l1', '2026-05-13T00:00:00.000Z'))
    await saveSegments(db, 'l1', [
      makeSegment('s1', ['你', '好']),
      makeSegment('s2', ['喝', '茶']),
    ])
    const result = await findSegmentsForWords(db, ['喝'])
    expect(result).toHaveLength(1)
    expect(result[0].segment.id).toBe('s2')
  })

  it('ranks segments by word density descending', async () => {
    await saveLessonMeta(db, makeLesson('l1', '2026-05-13T00:00:00.000Z'))
    await saveSegments(db, 'l1', [
      makeSegment('s1', ['喝']),
      makeSegment('s2', ['喝', '茶']),
    ])
    const result = await findSegmentsForWords(db, ['喝', '茶'])
    expect(result[0].segment.id).toBe('s2')
    expect(result[0].matchCount).toBe(2)
  })

  it('caps results at maxSegments', async () => {
    await saveLessonMeta(db, makeLesson('l1', '2026-05-13T00:00:00.000Z'))
    const segs = Array.from({ length: 15 }, (_, i) => makeSegment(`s${i}`, ['喝']))
    await saveSegments(db, 'l1', segs)
    const result = await findSegmentsForWords(db, ['喝'], 20, 5)
    expect(result.length).toBeLessThanOrEqual(5)
  })

  it('caps lessons scanned at maxLessons', async () => {
    for (let i = 0; i < 25; i++) {
      const id = `l${i}`
      await saveLessonMeta(db, makeLesson(id, `2026-05-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`))
      await saveSegments(db, id, [makeSegment(`s${i}`, ['喝'])])
    }
    const result = await findSegmentsForWords(db, ['喝'], 3, 100)
    expect(result.length).toBeLessThanOrEqual(3)
  })

  it('excludes non-complete lessons', async () => {
    await saveLessonMeta(db, { ...makeLesson('l1', '2026-05-13T00:00:00.000Z'), status: 'processing' })
    await saveSegments(db, 'l1', [makeSegment('s0', ['喝'])])
    expect(await findSegmentsForWords(db, ['喝'])).toEqual([])
  })

  it('deduplicates segments across lessons with matching IDs', async () => {
    await saveLessonMeta(db, makeLesson('l1', '2026-05-12T00:00:00.000Z'))
    await saveLessonMeta(db, makeLesson('l2', '2026-05-13T00:00:00.000Z'))
    // Both lessons have a segment with the same id "s0" - must NOT be deduped
    await saveSegments(db, 'l1', [makeSegment('s0', ['喝'])])
    await saveSegments(db, 'l2', [makeSegment('s0', ['喝'])])
    const result = await findSegmentsForWords(db, ['喝'])
    expect(result).toHaveLength(2)
  })
})
