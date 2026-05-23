import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useOnlineStatus } from '@/features/speak/application/useOnlineStatus'

describe('useOnlineStatus', () => {
  const setOnline = (v: boolean) =>
    Object.defineProperty(navigator, 'onLine', { writable: true, value: v })

  beforeEach(() => setOnline(true))

  it('returns true when navigator.onLine is true on mount', () => {
    const { result } = renderHook(() => useOnlineStatus())
    expect(result.current).toBe(true)
  })

  it('returns false when navigator.onLine is false on mount', () => {
    setOnline(false)
    const { result } = renderHook(() => useOnlineStatus())
    expect(result.current).toBe(false)
  })

  it('updates to false on offline event', () => {
    const { result } = renderHook(() => useOnlineStatus())
    act(() => { window.dispatchEvent(new Event('offline')) })
    expect(result.current).toBe(false)
  })

  it('updates to true on online event', () => {
    setOnline(false)
    const { result } = renderHook(() => useOnlineStatus())
    act(() => { window.dispatchEvent(new Event('online')) })
    expect(result.current).toBe(true)
  })

  it('removes event listeners on unmount', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const { unmount } = renderHook(() => useOnlineStatus())
    unmount()
    const removed = removeSpy.mock.calls.map(c => c[0])
    expect(removed).toContain('online')
    expect(removed).toContain('offline')
  })
})
