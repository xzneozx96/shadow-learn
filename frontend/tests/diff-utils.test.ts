import { describe, expect, it } from 'vitest'
import {
  computeAccuracyScore,
  computeCharDiff,
  computePinyinDiff,
  stripPinyinTones,
} from '@/lib/diff-utils'

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
