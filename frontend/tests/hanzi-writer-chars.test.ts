import { describe, expect, it } from 'vitest'
import { isWritingSupported } from '@/lib/hanzi-writer-chars'

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
})
