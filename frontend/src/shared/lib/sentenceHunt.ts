import type { ShadowLearnDB } from '@/db'
import type { Segment } from '@/shared/types'
import { getAllLessonMetas, getSegments } from '@/db'

export interface SegmentMatch {
  lessonId: string
  segment: Segment
  matchCount: number
}

export async function findSegmentsForWords(
  db: ShadowLearnDB,
  dueWords: string[],
  maxLessons = 20,
  maxSegments = 10,
): Promise<SegmentMatch[]> {
  if (dueWords.length === 0)
    return []

  const lessons = await getAllLessonMetas(db)
  const sorted = lessons
    .filter(l => !l.status || l.status === 'complete')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, maxLessons)

  const candidates: SegmentMatch[] = []

  for (const lesson of sorted) {
    const segments = await getSegments(db, lesson.id)
    if (!segments)
      continue
    const wordSet = new Set(dueWords)
    for (const segment of segments) {
      const matchCount = segment.words.filter(w => wordSet.has(w.word)).length
      if (matchCount > 0)
        candidates.push({ lessonId: lesson.id, segment, matchCount })
    }
  }

  candidates.sort((a, b) => b.matchCount - a.matchCount)

  const seen = new Set<string>()
  const result: SegmentMatch[] = []
  for (const m of candidates) {
    if (result.length >= maxSegments)
      break
    const key = `${m.lessonId}:${m.segment.id}`
    if (seen.has(key))
      continue
    seen.add(key)
    result.push(m)
  }

  return result
}
