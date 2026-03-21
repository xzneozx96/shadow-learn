import { describe, expect, it } from 'vitest'
import { getActiveChips, getSegmentTokens, scoreReconstruction } from '@/lib/study-utils'

describe('scoreReconstruction', () => {
  it('returns 100 for exact match', () => {
    expect(scoreReconstruction('没关系多练习就好了。', '没关系多练习就好了。')).toBe(100)
  })
  it('returns 100 when answer matches ignoring trailing punctuation', () => {
    expect(scoreReconstruction('没关系多练习就好了', '没关系多练习就好了。')).toBe(100)
  })
  it('returns partial score for partially correct answer', () => {
    // 8 of 9 chars correct (missing last char)
    expect(scoreReconstruction('没关系多练习就好', '没关系多练习就好了')).toBeCloseTo(89, 0)
  })
  it('returns 0 for completely wrong answer', () => {
    expect(scoreReconstruction('aaaaa', '没关系多练')).toBe(0)
  })
  it('handles leading/trailing whitespace', () => {
    expect(scoreReconstruction('  没关系多练习就好了  ', '没关系多练习就好了。')).toBe(100)
  })
})

describe('getActiveChips', () => {
  it('dims chips whose word appears in typed text', () => {
    const chips = ['今天', '非常', '好']
    const typed = '今天非常'
    const result = getActiveChips(chips, typed)
    expect(result).toEqual([false, false, true]) // false = dimmed
  })
  it('does not dim unmatched chips', () => {
    const result = getActiveChips(['今天'], '')
    expect(result).toEqual([true])
  })
})

describe('getSegmentTokens', () => {
  it('splits Chinese text into individual characters', () => {
    expect(getSegmentTokens('你好吗', 'zh-CN')).toEqual(['你', '好', '吗'])
  })
  it('splits Traditional Chinese text into individual characters', () => {
    expect(getSegmentTokens('你好嗎', 'zh-TW')).toEqual(['你', '好', '嗎'])
  })
  it('splits Japanese text into individual characters', () => {
    expect(getSegmentTokens('こんにちは', 'ja')).toEqual(['こ', 'ん', 'に', 'ち', 'は'])
  })
  it('splits English text by spaces', () => {
    expect(getSegmentTokens('Hello world', 'en')).toEqual(['Hello', 'world'])
  })
  it('filters out whitespace-only characters for character-based languages', () => {
    expect(getSegmentTokens('你 好', 'zh-CN')).toEqual(['你', '好'])
  })
  it('filters empty tokens for space-separated languages', () => {
    expect(getSegmentTokens('  Hello   world  ', 'en')).toEqual(['Hello', 'world'])
  })
})
