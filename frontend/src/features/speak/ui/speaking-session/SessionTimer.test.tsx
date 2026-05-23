import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SessionTimer } from '@/features/speak/ui/speaking-session/SessionTimer'

describe('sessionTimer', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('fires onExpire exactly once when timer reaches 0', () => {
    const onExpire = vi.fn()
    const connectedAt = Date.now()

    render(<SessionTimer connectedAt={connectedAt} maxDurationSeconds={2} onExpire={onExpire} />)

    act(() => { vi.advanceTimersByTime(3000) })
    expect(onExpire).toHaveBeenCalledTimes(1)

    // Critical: keep ticking — must NOT fire again
    act(() => { vi.advanceTimersByTime(5000) })
    expect(onExpire).toHaveBeenCalledTimes(1)
  })

  it('does not fire onExpire when connectedAt is null', () => {
    const onExpire = vi.fn()
    render(<SessionTimer connectedAt={null} maxDurationSeconds={2} onExpire={onExpire} />)
    act(() => { vi.advanceTimersByTime(5000) })
    expect(onExpire).not.toHaveBeenCalled()
  })

  it('fires only once even if onExpire identity changes after expiry (chatMessages churn regression)', () => {
    const calls: string[] = []
    const connectedAt = Date.now()

    const { rerender } = render(
      <SessionTimer connectedAt={connectedAt} maxDurationSeconds={2} onExpire={() => calls.push('a')} />,
    )
    act(() => { vi.advanceTimersByTime(2500) })

    // Parent passes new onExpire identity (simulating chatMessages churn in parent)
    rerender(
      <SessionTimer connectedAt={connectedAt} maxDurationSeconds={2} onExpire={() => calls.push('b')} />,
    )
    act(() => { vi.advanceTimersByTime(2000) })

    // Only one call, using the first onExpire identity at expiry time
    expect(calls).toHaveLength(1)
  })

  it('displays formatted remaining time correctly', () => {
    const { container } = render(
      <SessionTimer connectedAt={Date.now()} maxDurationSeconds={125} onExpire={vi.fn()} />,
    )
    expect(container.textContent).toBe('2:05')
  })
})
