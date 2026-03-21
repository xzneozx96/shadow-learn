import type { Segment } from '../src/types'
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useActiveSegment } from '../src/hooks/useActiveSegment'

// ── Mock PlayerContext ────────────────────────────────────────────────────────
let timeSubscribers: Set<(t: number) => void>

vi.mock('../src/contexts/PlayerContext', () => ({
  usePlayer: () => ({
    subscribeTime: (cb: (t: number) => void) => {
      timeSubscribers.add(cb)
      return () => {
        timeSubscribers.delete(cb)
      }
    },
    getTime: () => 0,
  }),
}))

function tick(time: number) {
  act(() => {
    timeSubscribers.forEach(cb => cb(time))
  })
}

// ── Fixtures ──────────────────────────────────────────────────────────────────
const segments: Segment[] = [
  { id: 'seg_000', start: 0, end: 2, text: 'A', romanization: 'a', translations: {}, words: [] },
  { id: 'seg_001', start: 3, end: 5, text: 'B', romanization: 'b', translations: {}, words: [] },
  { id: 'seg_002', start: 6, end: 8, text: 'C', romanization: 'c', translations: {}, words: [] },
]

describe('useActiveSegment', () => {
  beforeEach(() => {
    timeSubscribers = new Set()
  })

  it('returns segment when time is within range', () => {
    const { result } = renderHook(() => useActiveSegment(segments))
    tick(3.5)
    expect(result.current?.id).toBe('seg_001')
  })

  it('returns last past segment when time is in a gap', () => {
    const { result } = renderHook(() => useActiveSegment(segments))
    tick(2.5)
    expect(result.current?.id).toBe('seg_000')
  })

  it('returns null when no segments exist', () => {
    const { result } = renderHook(() => useActiveSegment([]))
    tick(1.0)
    expect(result.current).toBeNull()
  })

  it('returns null when time is before the first segment', () => {
    const segs: Segment[] = [
      { id: 'seg_000', start: 5, end: 10, text: 'A', romanization: 'a', translations: {}, words: [] },
    ]
    const { result } = renderHook(() => useActiveSegment(segs))
    tick(2.0)
    expect(result.current).toBeNull()
  })

  it('does not re-render when active segment identity does not change', () => {
    let renderCount = 0
    const { result } = renderHook(() => {
      renderCount++
      return useActiveSegment(segments)
    })
    const initialRenders = renderCount
    tick(3.0) // → seg_001
    tick(3.5) // → seg_001 (same)
    tick(4.0) // → seg_001 (same)
    expect(result.current?.id).toBe('seg_001')
    // Only one additional render after the first tick that changed the segment
    expect(renderCount).toBe(initialRenders + 1)
  })

  it('re-renders when the active segment changes', () => {
    const { result } = renderHook(() => useActiveSegment(segments))
    tick(1.0) // → seg_000
    expect(result.current?.id).toBe('seg_000')
    tick(4.0) // → seg_001
    expect(result.current?.id).toBe('seg_001')
  })
})
