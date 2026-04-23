import { describe, expect, it } from 'vitest'
import { PERSONAS } from '../src/lib/constants'

describe('pERSONAS', () => {
  it('all personas have voice_ids map and supported_languages', () => {
    for (const p of PERSONAS) {
      expect((p as any).voice_ids).toBeDefined()
      expect((p as any).supported_languages).toBeDefined()
      expect(Array.isArray((p as any).supported_languages)).toBe(true)
      expect((p as any).supported_languages.length).toBeGreaterThan(0)
    }
  })

  it('personas no longer expose level or system_prompt', () => {
    for (const p of PERSONAS) {
      expect((p as any).level).toBeUndefined()
      expect((p as any).system_prompt).toBeUndefined()
    }
  })

  it('taxi_driver is zh-CN only', () => {
    const taxi = PERSONAS.find((p: any) => p.id === 'taxi_driver')
    expect((taxi as any)?.supported_languages).toEqual(['zh-CN'])
  })
})
