import type { Segment } from '@/types'
import { describe, expect, it } from 'vitest'
import {
  computeSessionSummary,
  isAutoSkipSegment,
} from '@/lib/shadowing-utils'

function seg(start: number, end: number): Segment {
  return { id: 's', start, end, text: '', romanization: '', translations: {}, words: [] }
}

describe('isAutoSkipSegment', () => {
  it('returns true for duration < 0.5 s', () => {
    expect(isAutoSkipSegment(seg(0, 0.3))).toBe(true)
    expect(isAutoSkipSegment(seg(5, 5.49))).toBe(true)
  })

  it('returns false for duration >= 0.5 s', () => {
    expect(isAutoSkipSegment(seg(0, 0.5))).toBe(false)
    expect(isAutoSkipSegment(seg(0, 2))).toBe(false)
  })
})

describe('computeSessionSummary', () => {
  it('counts attempted and skipped correctly', () => {
    const results = [
      { segmentIndex: 0, attempted: true, skipped: false, autoSkipped: false, score: 80 },
      { segmentIndex: 1, attempted: false, skipped: true, autoSkipped: false, score: null },
      { segmentIndex: 2, attempted: false, skipped: false, autoSkipped: true, score: null },
    ]
    const s = computeSessionSummary(results, 3)
    expect(s.attempted).toBe(1)
    expect(s.skipped).toBe(1)
    expect(s.total).toBe(3)
  })

  it('computes average from non-null attempted scores only', () => {
    const results = [
      { segmentIndex: 0, attempted: true, skipped: false, autoSkipped: false, score: 80 },
      { segmentIndex: 1, attempted: true, skipped: false, autoSkipped: false, score: 60 },
      { segmentIndex: 2, attempted: true, skipped: false, autoSkipped: false, score: null },
    ]
    const s = computeSessionSummary(results, 3)
    expect(s.averageScore).toBe(70)
  })

  it('returns null average when no valid scores', () => {
    const results = [
      { segmentIndex: 0, attempted: false, skipped: true, autoSkipped: false, score: null },
    ]
    expect(computeSessionSummary(results, 1).averageScore).toBeNull()
  })

  it('returns up to 3 weakest segments, tiebroken by lower index first', () => {
    const results = [
      { segmentIndex: 3, attempted: true, skipped: false, autoSkipped: false, score: 40 },
      { segmentIndex: 0, attempted: true, skipped: false, autoSkipped: false, score: 50 },
      { segmentIndex: 1, attempted: true, skipped: false, autoSkipped: false, score: 40 },
      { segmentIndex: 2, attempted: true, skipped: false, autoSkipped: false, score: 90 },
    ]
    const s = computeSessionSummary(results, 4)
    expect(s.weakestSegments).toHaveLength(3)
    expect(s.weakestSegments[0]).toEqual({ segmentIndex: 1, score: 40 })
    expect(s.weakestSegments[1]).toEqual({ segmentIndex: 3, score: 40 })
    expect(s.weakestSegments[2]).toEqual({ segmentIndex: 0, score: 50 })
  })

  it('de-duplicates retried segments — last result wins', () => {
    const results = [
      { segmentIndex: 0, attempted: true, skipped: false, autoSkipped: false, score: 30 },
      { segmentIndex: 0, attempted: true, skipped: false, autoSkipped: false, score: 75 },
    ]
    const s = computeSessionSummary(results, 1)
    expect(s.attempted).toBe(1)
    expect(s.averageScore).toBe(75)
  })

  it('omits weakestSegments section when no valid scores', () => {
    const results = [
      { segmentIndex: 0, attempted: true, skipped: false, autoSkipped: false, score: null },
    ]
    expect(computeSessionSummary(results, 1).weakestSegments).toHaveLength(0)
  })
})
