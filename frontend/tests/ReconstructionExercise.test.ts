import { describe, it, expect } from 'vitest'
import { getActiveChips } from '@/components/study/exercises/ReconstructionExercise'

describe('getActiveChips', () => {
  it('dims chips whose word appears in typed text', () => {
    const chips = ['今天', '非常', '好']
    const typed = '今天非常'
    const result = getActiveChips(chips, typed)
    expect(result).toEqual([false, false, true])  // false = dimmed
  })
  it('does not dim unmatched chips', () => {
    const result = getActiveChips(['今天'], '')
    expect(result).toEqual([true])
  })
})
