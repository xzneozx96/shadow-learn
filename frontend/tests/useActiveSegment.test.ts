import type { Segment } from '../src/types'
import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useActiveSegment } from '../src/hooks/useActiveSegment'

const segments: Segment[] = [
  { id: 'seg_000', start: 0, end: 2, chinese: 'A', pinyin: 'a', translations: {}, words: [] },
  { id: 'seg_001', start: 3, end: 5, chinese: 'B', pinyin: 'b', translations: {}, words: [] },
  { id: 'seg_002', start: 6, end: 8, chinese: 'C', pinyin: 'c', translations: {}, words: [] },
]

describe('useActiveSegment', () => {
  it('returns segment when time is within range', () => {
    const { result } = renderHook(() => useActiveSegment(segments, 3.5))
    expect(result.current?.id).toBe('seg_001')
  })

  it('returns last past segment when in a gap', () => {
    const { result } = renderHook(() => useActiveSegment(segments, 2.5))
    expect(result.current?.id).toBe('seg_000')
  })

  it('returns null when before all segments', () => {
    const { result } = renderHook(() => useActiveSegment([], 0))
    expect(result.current).toBeNull()
  })
})
