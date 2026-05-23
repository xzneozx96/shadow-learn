import { describe, expect, it } from 'vitest'
import { buildCharData, getDecomposition, getSinoVietnamese } from '@/shared/lib/hanzi/lookup'

describe('getSinoVietnamese', () => {
  it('returns the Hán Việt reading for a known character', async () => {
    const r = await getSinoVietnamese('学')
    expect(r).toBe('học')
  })

  it('returns null for an unknown character', async () => {
    const r = await getSinoVietnamese('🙂')
    expect(r).toBeNull()
  })
})

describe('getDecomposition', () => {
  it('returns a list of component descriptors for a compound char', async () => {
    const components = await getDecomposition('好')
    expect(components.length).toBeGreaterThan(0)
    expect(components[0]).toHaveProperty('char')
    expect(components[0]).toHaveProperty('name')
  })

  it('returns an empty list for atomic characters', async () => {
    const components = await getDecomposition('一')
    expect(components).toEqual([])
  })

  it('uses components1 for 将, including out-of-BMP chars (rendered as empty in UI)', async () => {
    // 将 components1 = [丬, 𪨃]; 𪨃 is CJK Ext-B — included in data, hidden in node renderer
    const components = await getDecomposition('将')
    const chars = components.map(c => c.char)
    expect(chars).toContain('丬')
    expect(components.length).toBeLessThanOrEqual(3)
  })

  it('uses components1 for 学, dropping placeholder-only parts', async () => {
    // 学 components1 = ["No glyph available", "子"]; placeholder filtered → [子]
    // Falls back to components2 only if ALL of c1 is placeholders (none pass filter)
    const components = await getDecomposition('学')
    const chars = components.map(c => c.char)
    expect(chars).toContain('子')
  })
})

describe('buildCharData', () => {
  it('combines pinyin (pinyin-pro) + Sino-Vietnamese + decomposition into CharData', async () => {
    const data = await buildCharData({ char: '学' })
    expect(data.char).toBe('学')
    expect(data.sinoVietnamese).toBe('học')
    expect(Array.isArray(data.components)).toBe(true)
    // Per-char pinyin from pinyin-pro — should contain "xue" with a tone mark
    expect(data.pinyin.toLowerCase()).toContain('xu')
  })
})
