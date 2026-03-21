import { describe, expect, it } from 'vitest'
import { getTranslation, TRANSLATIONS } from '@/lib/i18n'
import type { TranslationKey } from '@/lib/i18n'

describe('getTranslation', () => {
  it('returns English string for en locale', () => {
    const t = getTranslation('en')
    expect(t('common.save')).toBe('Save')
    expect(t('nav.library')).toBe('Library')
  })

  it('returns Vietnamese string for vi locale', () => {
    const t = getTranslation('vi')
    expect(t('common.save')).toBe('Lưu')
    expect(t('nav.library')).toBe('Thư viện')
  })

  it('falls back to English when key is missing from vi', () => {
    const en = TRANSLATIONS['en'] as Record<string, string>
    const vi = TRANSLATIONS['vi'] as Record<string, string>
    const testKey = '__test_fallback__' as TranslationKey
    en[testKey] = 'Fallback Value'
    delete vi[testKey]

    const t = getTranslation('vi')
    expect(t(testKey)).toBe('Fallback Value')

    delete en[testKey]
  })

  it('returns the key itself when missing from all locales', () => {
    const t = getTranslation('vi')
    expect(t('__nonexistent_key__' as TranslationKey)).toBe('__nonexistent_key__')
  })

  it('en dictionary has all required namespaces', () => {
    const keys = Object.keys(TRANSLATIONS['en'])
    expect(keys.some(k => k.startsWith('nav.'))).toBe(true)
    expect(keys.some(k => k.startsWith('auth.'))).toBe(true)
    expect(keys.some(k => k.startsWith('create.'))).toBe(true)
    expect(keys.some(k => k.startsWith('study.'))).toBe(true)
    expect(keys.some(k => k.startsWith('shadowing.'))).toBe(true)
    expect(keys.some(k => k.startsWith('settings.'))).toBe(true)
    expect(keys.some(k => k.startsWith('common.'))).toBe(true)
  })
})
