import type { NewTipNote } from '@/features/learning-materials/domain/tips'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { _resetTipNoteBusForTest, registerSaveTipNote, saveTipNote } from '@/features/learning-materials/lib/tipNoteBus'

const input: NewTipNote = {
  videoId: 'vid-1',
  title: 't',
  html: '<p>x</p>',
  source: 'freeform',
}

beforeEach(() => {
  _resetTipNoteBusForTest()
})

describe('tipNoteBus', () => {
  it('throws when no handler registered', async () => {
    await expect(saveTipNote(input)).rejects.toThrow(/no handler/)
  })

  it('forwards to the registered handler', async () => {
    const fn = vi.fn(async () => {})
    const cleanup = registerSaveTipNote(fn)
    await saveTipNote(input)
    expect(fn).toHaveBeenCalledWith(input)
    cleanup()
  })

  it('second register replaces the first; first cleanup is a no-op', async () => {
    const a = vi.fn(async () => {})
    const b = vi.fn(async () => {})
    const cleanupA = registerSaveTipNote(a)
    const cleanupB = registerSaveTipNote(b)
    cleanupA()
    await saveTipNote(input)
    expect(a).not.toHaveBeenCalled()
    expect(b).toHaveBeenCalledTimes(1)
    cleanupB()
  })
})
