import { describe, expect, it } from 'vitest'
import { comparePinyin, normalizePinyin } from '@/lib/pinyin-utils'

describe('normalizePinyin', () => {
  it('strips tone marks to base pinyin', () => {
    expect(normalizePinyin('jīntiān')).toBe('jintian')
    expect(normalizePinyin('fēicháng')).toBe('feichang')
    expect(normalizePinyin('nǐ hǎo')).toBe('nihao')
  })

  it('converts tone numbers to base pinyin', () => {
    expect(normalizePinyin('jin1tian1')).toBe('jintian')
    expect(normalizePinyin('fei1chang2')).toBe('feichang')
  })

  it('lowercases and trims', () => {
    expect(normalizePinyin(' JīnTiān ')).toBe('jintian')
  })
})

describe('comparePinyin', () => {
  it('matches tone marks to tone numbers', () => {
    expect(comparePinyin('jīntiān', 'jin1tian1')).toBe(true)
  })
  it('returns false for wrong pinyin', () => {
    expect(comparePinyin('jīntiān', 'jin2tian1')).toBe(false)
  })
  it('is whitespace-insensitive', () => {
    expect(comparePinyin('jīn tiān', 'jin1 tian1')).toBe(true)
  })
})
