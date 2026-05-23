import { useEffect, useReducer, useRef } from 'react'

function formatDuration(seconds: number) {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

export interface SessionTimerProps {
  connectedAt: number | null
  maxDurationSeconds: number
  onExpire: () => void
}

export function SessionTimer({ connectedAt, maxDurationSeconds, onExpire }: SessionTimerProps) {
  // Tick counter via useReducer — dispatch triggers re-render on each interval
  // without storing derived time-state (React guide: subscribe to external store).
  const [, tick] = useReducer((n: number) => n + 1, 0)
  const firedRef = useRef(false)
  const onExpireRef = useRef(onExpire)
  useEffect(() => { onExpireRef.current = onExpire }, [onExpire])

  useEffect(() => {
    if (connectedAt == null)
      return
    firedRef.current = false
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [connectedAt])

  // Derive `remaining` during render from the clock — not stored in state.
  const remaining = connectedAt == null
    ? maxDurationSeconds
    : Math.max(0, maxDurationSeconds - Math.round((Date.now() - connectedAt) / 1000))

  // Fire expiry callback exactly once when the clock hits zero.
  useEffect(() => {
    if (connectedAt != null && remaining === 0 && !firedRef.current) {
      firedRef.current = true
      onExpireRef.current()
    }
  }, [connectedAt, remaining])

  return <span className="text-sm font-bold tabular-nums">{formatDuration(remaining)}</span>
}
