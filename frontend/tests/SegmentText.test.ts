import { describe, expect, it } from 'vitest'

import { buildPositionMap, buildWordSpans } from '@/lib/segment-text'
import type { Word, WordTiming } from '@/types'

const makeWord = (word: string): Word => ({
  word,
  romanization: 'pīnyīn',
  meaning: 'test meaning',
  usage: 'test usage',
})

describe('buildWordSpans', () => {
  it('returns single plain span when no vocab words', () => {
    const spans = buildWordSpans('你好', [])
    expect(spans).toEqual([{ text: '你好', word: null }])
  })

  it('matches vocab word greedily', () => {
    const spans = buildWordSpans('桌子', [makeWord('桌子'), makeWord('桌')])
    expect(spans).toHaveLength(1)
    expect(spans[0].text).toBe('桌子')
    expect(spans[0].word?.word).toBe('桌子')
  })

  it('splits into vocab and plain spans', () => {
    const spans = buildWordSpans('我桌子', [makeWord('桌子')])
    expect(spans).toHaveLength(2)
    expect(spans[0]).toEqual({ text: '我', word: null })
    expect(spans[1].text).toBe('桌子')
  })

  it('merges adjacent unmatched chars into one plain span', () => {
    const spans = buildWordSpans('abc', [])
    expect(spans).toHaveLength(1)
    expect(spans[0].text).toBe('abc')
  })
})

describe('buildPositionMap', () => {
  const timings: WordTiming[] = [
    { text: '我', start: 0.0, end: 0.5 },
    { text: '的', start: 0.6, end: 0.9 },
    { text: '桌子', start: 1.0, end: 1.5 },
  ]

  it('maps single-char entries to their text positions', () => {
    const map = buildPositionMap('我的桌子', timings)
    expect(map.get(0)).toEqual({ text: '我', start: 0.0, end: 0.5 })
    expect(map.get(1)).toEqual({ text: '的', start: 0.6, end: 0.9 })
  })

  it('maps multi-char entry to all its positions', () => {
    const map = buildPositionMap('我的桌子', timings)
    // '桌子' is at positions 2 and 3
    expect(map.get(2)).toEqual({ text: '桌子', start: 1.0, end: 1.5 })
    expect(map.get(3)).toEqual({ text: '桌子', start: 1.0, end: 1.5 })
  })

  it('returns empty map for empty timings', () => {
    const map = buildPositionMap('你好', [])
    expect(map.size).toBe(0)
  })

  it('skips timing entries not found in text', () => {
    const map = buildPositionMap('你好', [
      { text: '再见', start: 0.0, end: 0.5 }, // not in text
      { text: '你', start: 1.0, end: 1.3 },
    ])
    expect(map.get(0)).toEqual({ text: '你', start: 1.0, end: 1.3 })
    expect(map.size).toBe(1)
  })

  it('punctuation in punctuated_word suffix is claimed and not re-matched', () => {
    // "好。" timing entry claims both '好' (pos 1) and '。' (pos 2)
    const map = buildPositionMap('你好。', [
      { text: '你', start: 0.0, end: 0.4 },
      { text: '好。', start: 0.5, end: 1.0 },
    ])
    expect(map.get(1)).toEqual({ text: '好。', start: 0.5, end: 1.0 })
    expect(map.get(2)).toEqual({ text: '好。', start: 0.5, end: 1.0 })
  })
})
