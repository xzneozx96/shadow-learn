import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { useHint } from '@/hooks/useHint'

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
    expect(result.current.hintScore).toBeCloseTo(2 / 3)
  })

  it('stops at totalLevels and sets exhausted', () => {
    const { result } = renderHook(() => useHint(1))
    act(() => result.current.revealNext())
    expect(result.current.level).toBe(1)
    expect(result.current.exhausted).toBe(true)
    act(() => result.current.revealNext()) // no-op
    expect(result.current.level).toBe(1)
  })

  it('hintScore reaches 0 when all levels used', () => {
    const { result } = renderHook(() => useHint(2))
    act(() => result.current.revealNext())
    act(() => result.current.revealNext())
    expect(result.current.hintScore).toBe(0)
  })

  it('handles totalLevels = 0 case', () => {
    const { result } = renderHook(() => useHint(0))
    expect(result.current.level).toBe(0)
    expect(result.current.hintScore).toBe(1)
    expect(result.current.exhausted).toBe(true)
    act(() => result.current.revealNext())
    expect(result.current.level).toBe(0)
  })
})
