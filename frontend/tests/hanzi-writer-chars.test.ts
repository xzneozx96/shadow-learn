import { describe, expect, it } from 'vitest'
import { isKana, isWritingSupported } from '@/lib/hanzi-writer-chars'

describe('isWritingSupported', () => {
  it('returns true for common characters', () => {
    expect(isWritingSupported('你')).toBe(true)
    expect(isWritingSupported('好')).toBe(true)
    expect(isWritingSupported('中国')).toBe(true)
  })

  it('returns false for non-CJK characters', () => {
    expect(isWritingSupported('hello')).toBe(false)
    expect(isWritingSupported('123')).toBe(false)
  })

  it('returns false for empty string', () => {
    expect(isWritingSupported('')).toBe(false)
  })

  it('returns false if any character is unsupported', () => {
    expect(isWritingSupported('你A')).toBe(false)
  })

  it('returns true for single hiragana character', () => {
    expect(isWritingSupported('あ')).toBe(true)
  })

  it('returns true for single katakana character', () => {
    expect(isWritingSupported('ア')).toBe(true)
  })

  it('returns true for hiragana word', () => {
    expect(isWritingSupported('かな')).toBe(true)
  })

  it('returns true for katakana word', () => {
    expect(isWritingSupported('カタカナ')).toBe(true)
  })

  it('returns false if kana is mixed with latin', () => {
    expect(isWritingSupported('あA')).toBe(false)
  })
})

describe('isKana', () => {
  it('returns true for hiragana', () => {
    expect(isKana('あ')).toBe(true)
    expect(isKana('ん')).toBe(true)
  })

  it('returns true for katakana', () => {
    expect(isKana('ア')).toBe(true)
    expect(isKana('ン')).toBe(true)
  })

  it('returns false for CJK kanji', () => {
    expect(isKana('漢')).toBe(false)
  })

  it('returns false for latin characters', () => {
    expect(isKana('a')).toBe(false)
  })

  it('returns false for empty string', () => {
    expect(isKana('')).toBe(false)
  })
})
