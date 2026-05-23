import type { ExerciseStat } from '@/db'
import { describe, expect, it } from 'vitest'
import { getStepMode } from '@/shared/lib/skillDecision'

function stat(correct: number, total: number): ExerciseStat {
  return { correct, total, lastAttempt: '2026-05-13' }
}

describe('getStepMode', () => {
  it('returns forced when stat is undefined', () => {
    expect(getStepMode(undefined)).toBe('forced')
  })

  it('returns forced when total is 0', () => {
    expect(getStepMode(stat(0, 0))).toBe('forced')
  })

  it('returns full when accuracy < 70%', () => {
    expect(getStepMode(stat(6, 10))).toBe('full') // 60%
    expect(getStepMode(stat(0, 5))).toBe('full') // 0%
  })

  it('returns normal when accuracy is exactly 70%', () => {
    expect(getStepMode(stat(7, 10))).toBe('normal')
  })

  it('returns normal when accuracy is 85%', () => {
    expect(getStepMode(stat(17, 20))).toBe('normal')
  })

  it('returns fast-path when accuracy > 85%', () => {
    expect(getStepMode(stat(9, 10))).toBe('fast-path') // 90%
    expect(getStepMode(stat(10, 10))).toBe('fast-path') // 100%
  })

  it('returns full at 69.9%', () => {
    expect(getStepMode(stat(13, 19))).toBe('full') // 68.4%
  })
})
