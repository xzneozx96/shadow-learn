import { describe, expect, it } from 'vitest'
import { getCandidates } from '@/lib/pinyin-dict'

describe('getCandidates', () => {
  it('returns candidates for a known syllable', () => {
    const result = getCandidates('ni')
    expect(result.length).toBeGreaterThan(0)
    expect(result[0]).toBe('你')
  })

  it('is case-insensitive', () => {
    expect(getCandidates('NI')).toEqual(getCandidates('ni'))
  })

  it('returns empty array for unknown syllable', () => {
    expect(getCandidates('zzz')).toEqual([])
  })

  it('returns empty array for empty string', () => {
    expect(getCandidates('')).toEqual([])
  })
})
