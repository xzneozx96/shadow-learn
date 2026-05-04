import { describe, expect, it } from 'vitest'
import { buildCharData, getDecomposition, getSinoVietnamese } from '@/lib/hanzi/lookup'

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
})

describe('buildCharData', () => {
  it('combines Sino-Vietnamese + decomposition + meaning into CharData', async () => {
    const data = await buildCharData({
      char: '学',
      pinyin: 'xué',
      meaning: 'to learn',
    })
    expect(data.char).toBe('学')
    expect(data.pinyin).toBe('xué')
    expect(data.sinoVietnamese).toBe('học')
    expect(data.meaning).toBe('to learn')
    expect(Array.isArray(data.components)).toBe(true)
  })
})
