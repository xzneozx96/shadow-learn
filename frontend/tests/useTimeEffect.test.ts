import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useTimeEffect } from '../src/hooks/useTimeEffect'

// ── Mock PlayerContext ────────────────────────────────────────────────────────
let timeSubscribers: Set<(t: number) => void>

vi.mock('../src/contexts/PlayerContext', () => ({
  usePlayer: () => ({
    subscribeTime: (cb: (t: number) => void) => {
      timeSubscribers.add(cb)
      return () => { timeSubscribers.delete(cb) }
    },
  }),
}))

function tick(time: number) {
  timeSubscribers.forEach(cb => cb(time))
}

describe('useTimeEffect', () => {
  beforeEach(() => {
    timeSubscribers = new Set()
  })

  it('calls callback on each time tick', () => {
    const cb = vi.fn()
    renderHook(() => useTimeEffect(cb, 'key1'))
    tick(1.5)
    tick(2.0)
    expect(cb).toHaveBeenCalledTimes(2)
    expect(cb).toHaveBeenNthCalledWith(1, 1.5)
    expect(cb).toHaveBeenNthCalledWith(2, 2.0)
  })

  it('always calls the latest callback without re-subscribing', () => {
    const cb1 = vi.fn()
    const cb2 = vi.fn()
    const { rerender } = renderHook(
      ({ cb }: { cb: (t: number) => void }) => useTimeEffect(cb, 'key1'),
      { initialProps: { cb: cb1 } },
    )
    tick(1.0)
    rerender({ cb: cb2 })
    tick(2.0)
    // cb1 was active for tick 1; cb2 took over for tick 2
    expect(cb1).toHaveBeenCalledTimes(1)
    expect(cb2).toHaveBeenCalledTimes(1)
    expect(cb2).toHaveBeenCalledWith(2.0)
    // Only one subscriber (no duplicate)
    expect(timeSubscribers.size).toBe(1)
  })

  it('re-subscribes when key changes', () => {
    const cb = vi.fn()
    const { rerender } = renderHook(
      ({ key }: { key: string }) => useTimeEffect(cb, key),
      { initialProps: { key: 'seg_001' } },
    )
    tick(1.0)
    expect(cb).toHaveBeenCalledTimes(1)

    rerender({ key: 'seg_002' })
    // After key change, old subscriber is removed and new one added
    expect(timeSubscribers.size).toBe(1)
    tick(2.0)
    expect(cb).toHaveBeenCalledTimes(2)
  })

  it('cleans up subscription on unmount', () => {
    const cb = vi.fn()
    const { unmount } = renderHook(() => useTimeEffect(cb, 'key1'))
    expect(timeSubscribers.size).toBe(1)
    unmount()
    expect(timeSubscribers.size).toBe(0)
  })
})
