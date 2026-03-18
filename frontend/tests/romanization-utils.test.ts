import { describe, expect, it } from 'vitest'
import { compareRomanization } from '@/lib/romanization-utils'

describe('compareRomanization', () => {
  it('delegates to comparePinyin for pinyin system', () => {
    expect(compareRomanization('nǐ hǎo', 'nǐ hǎo', 'pinyin')).toBe(true)
    expect(compareRomanization('ni3 hao3', 'nǐ hǎo', 'pinyin')).toBe(true) // tone numbers
    expect(compareRomanization('wǒ', 'nǐ', 'pinyin')).toBe(false)
  })

  it('normalizes IPA by stripping stress marks and slashes', () => {
    expect(compareRomanization('/həˈloʊ/', 'həˈloʊ', 'ipa')).toBe(true)
    expect(compareRomanization('həˈloʊ', 'həˈloʊ', 'ipa')).toBe(true)
    expect(compareRomanization('hɛloʊ', 'həˈloʊ', 'ipa')).toBe(false)
  })

  it('normalizes romaji case-insensitively', () => {
    expect(compareRomanization('konnichiwa', 'Konnichiwa', 'romaji')).toBe(true)
    expect(compareRomanization('sayonara', 'konnichiwa', 'romaji')).toBe(false)
  })

  it('always returns false for none system', () => {
    expect(compareRomanization('anything', 'anything', 'none')).toBe(false)
  })
})
