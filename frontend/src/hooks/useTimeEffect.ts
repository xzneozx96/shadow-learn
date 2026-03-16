import { useEffect, useRef } from 'react'
import { usePlayer } from '@/contexts/PlayerContext'

/**
 * Subscribe to the player's time stream without going through React state.
 * The callback fires on every RAF tick during playback.
 *
 * @param cb   Time callback — always-fresh via internal ref, safe to capture local state.
 * @param key  Re-subscribes when this value changes (pass segment.id or similar stable identity).
 */
export function useTimeEffect(cb: (t: number) => void, key: unknown): void {
  const { subscribeTime } = usePlayer()
  const cbRef = useRef(cb)
  // Keep cbRef current whenever cb changes — dep array [cb] satisfies exhaustive-deps
  useEffect(() => { cbRef.current = cb }, [cb])
  useEffect(() => {
    return subscribeTime(t => cbRef.current(t))
  // subscribeTime is stable (useCallback with []); key triggers re-subscribe on segment change.
  // cbRef is a stable ref — its .current is accessed at call time, not in the dep array.
  }, [subscribeTime, key])
}
