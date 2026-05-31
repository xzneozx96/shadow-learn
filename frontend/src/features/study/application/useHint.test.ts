import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { useHint } from '@/features/study/application/useHint'

describe('useHint', () => {
  it('starts at level 0 with hintScore 1.0', () => {
    const { result } = renderHook(() => useHint(3))
    expect(result.current.level).toBe(0)
    expect(result.current.hintScore).toBe(1)
    expect(result.current.exhausted).toBe(false)
  })

  it('increments level on revealNext', () => {
    const { result } = renderHook(() => useHint(3))
    act(() => result.current.revealNext())
    expect(result.current.level).toBe(1)
    // (3-1)/3 ≈ 0.667 is below the 0.75 floor, so the floor applies.
    expect(result.current.hintScore).toBe(0.75)
  })

  it('stops at totalLevels and sets exhausted', () => {
    const { result } = renderHook(() => useHint(1))
    act(() => result.current.revealNext())
    expect(result.current.level).toBe(1)
    expect(result.current.exhausted).toBe(true)
    act(() => result.current.revealNext()) // no-op
    expect(result.current.level).toBe(1)
  })

  it('floors hintScore at 0.75 — never zero — when all levels are used', () => {
    // Regression: a fully-hinted attempt used to yield hintScore 0, so
    // accuracy × 0 = 0 reset the word's SM-2 schedule (production word 捆 was
    // knocked from a 45-day gap to 1 day by a single hint). A fully-hinted but
    // correct attempt must still clear the 60 pass threshold.
    const { result } = renderHook(() => useHint(2))
    act(() => result.current.revealNext())
    act(() => result.current.revealNext())
    expect(result.current.hintScore).toBe(0.75)
    expect(Math.round(100 * result.current.hintScore)).toBeGreaterThanOrEqual(60)
  })

  it('floors a single-level (pronunciation) hint at 0.75 instead of zeroing', () => {
    const { result } = renderHook(() => useHint(1))
    act(() => result.current.revealNext())
    expect(result.current.exhausted).toBe(true)
    expect(result.current.hintScore).toBe(0.75)
  })

  it('handles totalLevels = 0 case', () => {
    const { result } = renderHook(() => useHint(0))
    expect(result.current.level).toBe(0)
    expect(result.current.hintScore).toBe(1)
    expect(result.current.exhausted).toBe(true)
    act(() => result.current.revealNext())
    expect(result.current.level).toBe(0)
  })

  it('reset() returns level to 0 and hintScore to 1.0', () => {
    const { result } = renderHook(() => useHint(3))
    act(() => result.current.revealNext())
    act(() => result.current.revealNext())
    expect(result.current.level).toBe(2)
    // (3-2)/3 ≈ 0.333 is below the 0.75 floor.
    expect(result.current.hintScore).toBe(0.75)
    act(() => result.current.reset())
    expect(result.current.level).toBe(0)
    expect(result.current.hintScore).toBe(1)
    expect(result.current.exhausted).toBe(false)
  })
})
