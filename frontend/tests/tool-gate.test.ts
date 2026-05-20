import { describe, expect, it } from 'vitest'
import { getToolPoolForSurface } from '@/lib/tools'

describe('getToolPoolForSurface', () => {
  it('lesson returns non-empty active pool', () => {
    const tools = getToolPoolForSurface('lesson', 'fake-key', { uiLanguage: 'en' })
    expect(tools.length).toBeGreaterThan(0)
  })
  it('global returns the global subset (includes save_memory)', () => {
    const tools = getToolPoolForSurface('global', '')
    const names = tools.map(t => t.name)
    expect(names).toContain('save_memory')
    expect(names).not.toContain('start_shadowing')
  })
  it('tip returns empty in Phase 1 (intentionally off)', () => {
    const tools = getToolPoolForSurface('tip', '')
    expect(tools).toEqual([])
  })
})
