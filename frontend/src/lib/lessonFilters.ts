import type { LessonMeta } from '@/types'

export type LessonStatusFilter = 'all' | 'inProgress' | 'done'
type SortMode = 'recent' | 'alpha' | 'progress'

export function filterLessons(
  lessons: LessonMeta[],
  filter: LessonStatusFilter,
  search: string,
  sort: SortMode,
): LessonMeta[] {
  let result = lessons
  if (filter === 'inProgress')
    result = result.filter(l => !l.isDone)
  else if (filter === 'done')
    result = result.filter(l => l.isDone === true)
  if (search.trim()) {
    const q = search.toLowerCase()
    result = result.filter(l => l.title.toLowerCase().includes(q))
  }
  return result.toSorted((a, b) => {
    const aP = a.status === 'processing'
    const bP = b.status === 'processing'
    if (aP && !bP)
      return -1
    if (!aP && bP)
      return 1
    if (sort === 'recent')
      return new Date(b.lastOpenedAt).getTime() - new Date(a.lastOpenedAt).getTime()
    if (sort === 'alpha')
      return a.title.localeCompare(b.title)
    const pA = a.progressSegmentId && a.segmentCount ? Number.parseInt(a.progressSegmentId, 10) / a.segmentCount : 0
    const pB = b.progressSegmentId && b.segmentCount ? Number.parseInt(b.progressSegmentId, 10) / b.segmentCount : 0
    return pB - pA
  })
}
