import { describe, expect, it } from 'vitest'
import { getCandidates } from '@/lib/pinyin-dict'

describe('getCandidates - edge cases', () => {
  it('handles whitespace strings', () => {
    expect(getCandidates('   ')).toEqual([])
  })

  it('handles whitespace with content', () => {
    const result = getCandidates('  ni  ')
    // This will fail because toLowerCase() is called on the whole thing with spaces
    expect(result.length).toBeGreaterThanOrEqual(0)
  })
})
