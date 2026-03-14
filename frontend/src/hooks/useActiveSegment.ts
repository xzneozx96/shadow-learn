import type { Segment } from '../types'
import { useMemo } from 'react'

export function useActiveSegment(
  segments: Segment[],
  currentTime: number,
): Segment | null {
  return useMemo(() => {
    for (const seg of segments) {
      if (currentTime >= seg.start && currentTime < seg.end) {
        return seg
      }
    }
    let lastBefore: Segment | null = null
    for (const seg of segments) {
      if (seg.end <= currentTime) {
        lastBefore = seg
      }
    }
    return lastBefore
  }, [segments, currentTime])
}
