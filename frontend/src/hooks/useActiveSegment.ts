import type { Segment } from '../types'
import { useEffect, useRef, useState } from 'react'
import { usePlayer } from '@/contexts/PlayerContext'

/**
 * Find the active segment for a given time using binary search.
 * Segments must be sorted ascending by `start`.
 *
 * Returns:
 * - The segment where start <= time < end (currently playing)
 * - The last segment where end <= time (most recently passed, if in a gap)
 * - null if time is before the first segment or segments is empty
 */
function findActiveSegment(segments: Segment[], time: number): Segment | null {
  if (segments.length === 0) return null

  // Find rightmost segment with start <= time
  let lo = 0
  let hi = segments.length - 1
  let candidate = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (segments[mid].start <= time) {
      candidate = mid
      lo = mid + 1
    }
    else {
      hi = mid - 1
    }
  }

  if (candidate === -1) return null // time before all segments
  // Both the "active" and "last-before" cases correctly return segments[candidate]:
  // - If end > time:  candidate is the currently-active segment
  // - If end <= time: candidate is the most-recently-passed segment (the original "lastBefore")
  // The binary search gives the right answer in both cases without a separate backwards scan.
  return segments[candidate]
}

export function useActiveSegment(segments: Segment[]): Segment | null {
  const { subscribeTime, getTime } = usePlayer()

  // Keep segmentsRef current synchronously during render (not in a useEffect) so that
  // the subscription callback never reads a stale list if segments and a time tick land
  // in the same render batch.
  const segmentsRef = useRef(segments)
  segmentsRef.current = segments

  // Seed initial state from getTime() so the active segment is correct immediately,
  // even when the player is already mid-video (e.g., after a seek before any tick fires).
  // Lazy initializer — runs only on mount, not on every re-render.
  const [activeSegment, setActiveSegment] = useState<Segment | null>(
    () => findActiveSegment(segments, getTime()),
  )
  const activeSegmentRef = useRef<Segment | null>(activeSegment)

  useEffect(() => {
    return subscribeTime((time) => {
      const found = findActiveSegment(segmentsRef.current, time)
      if (found?.id !== activeSegmentRef.current?.id) {
        activeSegmentRef.current = found
        setActiveSegment(found)
      }
    })
  }, [subscribeTime])

  return activeSegment
}
