import type { LessonMeta } from '@/types'
import { describe, expect, it } from 'vitest'
import { filterLessons } from '@/lib/lessonFilters'

function makeMeta(overrides: Partial<LessonMeta> = {}): LessonMeta {
  return {
    id: 'lesson_1',
    title: 'Test Lesson',
    source: 'youtube',
    sourceUrl: null,
    translationLanguages: ['en'],
    createdAt: '2024-01-01T00:00:00.000Z',
    lastOpenedAt: '2024-01-01T00:00:00.000Z',
    progressSegmentId: null,
    tags: [],
    status: 'complete',
    ...overrides,
  }
}

const lessons: LessonMeta[] = [
  makeMeta({ id: '1', title: 'Alpha', lastOpenedAt: '2024-01-03T00:00:00.000Z', isDone: false }),
  makeMeta({ id: '2', title: 'Beta', lastOpenedAt: '2024-01-02T00:00:00.000Z', isDone: true }),
  makeMeta({ id: '3', title: 'Gamma', lastOpenedAt: '2024-01-01T00:00:00.000Z' }),
]

describe('filterLessons', () => {
  describe('chip filter', () => {
    it('all returns every lesson', () => {
      const result = filterLessons(lessons, 'all', '', 'recent')
      expect(result).toHaveLength(3)
    })

    it('inProgress excludes isDone===true lessons', () => {
      const result = filterLessons(lessons, 'inProgress', '', 'recent')
      expect(result.map(l => l.id)).not.toContain('2')
      expect(result).toHaveLength(2)
    })

    it('done returns only isDone===true lessons', () => {
      const result = filterLessons(lessons, 'done', '', 'recent')
      expect(result.map(l => l.id)).toEqual(['2'])
    })

    it('lesson with no isDone field appears in inProgress', () => {
      const result = filterLessons(lessons, 'inProgress', '', 'recent')
      expect(result.map(l => l.id)).toContain('3')
    })
  })

  describe('search', () => {
    it('filters by title case-insensitively', () => {
      const result = filterLessons(lessons, 'all', 'alpha', 'recent')
      expect(result.map(l => l.id)).toEqual(['1'])
    })

    it('search applies within active chip', () => {
      // chip=inProgress has lessons 1 and 3; search 'gamma' should return only 3
      const result = filterLessons(lessons, 'inProgress', 'gamma', 'recent')
      expect(result.map(l => l.id)).toEqual(['3'])
    })

    it('empty search returns all chip-filtered lessons', () => {
      const result = filterLessons(lessons, 'all', '  ', 'recent')
      expect(result).toHaveLength(3)
    })
  })

  describe('sort', () => {
    it('recent orders by lastOpenedAt descending', () => {
      const result = filterLessons(lessons, 'all', '', 'recent')
      expect(result.map(l => l.id)).toEqual(['1', '2', '3'])
    })

    it('alpha orders by title ascending', () => {
      const result = filterLessons(lessons, 'all', '', 'alpha')
      expect(result.map(l => l.id)).toEqual(['1', '2', '3'])
    })

    it('processing lessons sort first regardless of chip', () => {
      const withProcessing = [
        ...lessons,
        makeMeta({ id: '4', title: 'Processing', lastOpenedAt: '2020-01-01T00:00:00.000Z', status: 'processing' }),
      ]
      const result = filterLessons(withProcessing, 'all', '', 'recent')
      expect(result[0].id).toBe('4')
    })
  })
})
