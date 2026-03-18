import type { Segment } from '@/types'
import { describe, expect, it } from 'vitest'
import {
  computeAccuracyScore,
  computeCharDiff,
  computePinyinDiff,
  computeSessionSummary,
  isAutoSkipSegment,
  stripPinyinTones,
} from '@/lib/shadowing-utils'

function seg(start: number, end: number): Segment {
  return { id: 's', start, end, chinese: '', pinyin: '', translations: {}, words: [] }
}

describe('computeCharDiff', () => {
  it('marks matching grapheme clusters as correct', () => {
    const tokens = computeCharDiff('你好', '你好')
    expect(tokens.every(t => t.correct)).toBe(true)
  })

  it('marks mismatched clusters as incorrect', () => {
    const tokens = computeCharDiff('你坏', '你好')
    expect(tokens[0].correct).toBe(true)
    expect(tokens[1].correct).toBe(false)
  })

  it('pads shorter user input with incorrect slots', () => {
    const tokens = computeCharDiff('你', '你好')
    expect(tokens).toHaveLength(2)
    expect(tokens[0].correct).toBe(true)
    expect(tokens[1].correct).toBe(false)
  })

  it('pads shorter correct text (extra user chars are wrong)', () => {
    const tokens = computeCharDiff('你好啊', '你好')
    expect(tokens).toHaveLength(3)
    expect(tokens[2].correct).toBe(false)
  })

  it('handles multi-character clusters correctly', () => {
    const tokens = computeCharDiff('什么', '什么')
    expect(tokens).toHaveLength(2)
    expect(tokens.every(t => t.correct)).toBe(true)
  })

  it('returns empty for two empty strings', () => {
    expect(computeCharDiff('', '')).toHaveLength(0)
  })
})

describe('stripPinyinTones', () => {
  it('removes tone diacritics', () => {
    expect(stripPinyinTones('nǐ hǎo')).toBe('ni hao')
    expect(stripPinyinTones('shénme')).toBe('shenme')
    expect(stripPinyinTones('zài')).toBe('zai')
  })

  it('leaves untoned pinyin unchanged', () => {
    expect(stripPinyinTones('ni hao')).toBe('ni hao')
  })
})

describe('computePinyinDiff', () => {
  it('matches syllables when tone diacritics match', () => {
    const tokens = computePinyinDiff('nǐ zài xué shénme', 'nǐ zài xué shénme')
    expect(tokens.every(t => t.correct)).toBe(true)
  })

  it('marks syllables without tone as incorrect when correct has a tone', () => {
    const tokens = computePinyinDiff('ni zai', 'nǐ zài')
    expect(tokens.every(t => !t.correct)).toBe(true)
  })

  it('marks wrong base syllable as incorrect', () => {
    const tokens = computePinyinDiff('ni3 hao3', 'nǐ zài')
    expect(tokens[0].correct).toBe(true)
    expect(tokens[1].correct).toBe(false)
  })

  it('pads shorter user input', () => {
    const tokens = computePinyinDiff('ni3', 'nǐ zài')
    expect(tokens).toHaveLength(2)
    expect(tokens[0].correct).toBe(true)
    expect(tokens[1].correct).toBe(false)
  })

  it('is case-insensitive', () => {
    const tokens = computePinyinDiff('NI3', 'nǐ')
    expect(tokens[0].correct).toBe(true)
  })

  it('matches syllables typed with tone numbers against tone-marked correct pinyin', () => {
    const tokens = computePinyinDiff('ni3 zai4 xue2 shen2me', 'nǐ zài xué shénme')
    expect(tokens.every(t => t.correct)).toBe(true)
  })
})

describe('computeAccuracyScore', () => {
  it('returns 100 for all correct', () => {
    expect(computeAccuracyScore([{ text: 'a', correct: true }, { text: 'b', correct: true }])).toBe(100)
  })

  it('returns 50 for half correct', () => {
    expect(computeAccuracyScore([{ text: 'a', correct: true }, { text: 'b', correct: false }])).toBe(50)
  })

  it('returns 0 for all wrong', () => {
    expect(computeAccuracyScore([{ text: 'a', correct: false }])).toBe(0)
  })

  it('returns 0 for empty tokens', () => {
    expect(computeAccuracyScore([])).toBe(0)
  })
})

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
