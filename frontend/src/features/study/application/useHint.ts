import { useState } from 'react'

export interface UseHintReturn {
  level: number
  revealNext: () => void
  hintScore: number
  exhausted: boolean
  reset: () => void
}

// Using every hint must not zero a score — a revealed hint is a small penalty,
// not a failure. Floor the multiplier so a fully-hinted but otherwise-correct
// attempt (e.g. 100 × 0.75 = 75) still passes the SM-2 quality threshold instead
// of resetting the word's schedule.
const HINT_SCORE_FLOOR = 0.75

export function useHint(totalLevels: number): UseHintReturn {
  const [level, setLevel] = useState(0)
  const exhausted = level >= totalLevels
  return {
    level,
    revealNext: () => setLevel(l => Math.min(l + 1, totalLevels)),
    hintScore: totalLevels === 0 ? 1 : Math.max(HINT_SCORE_FLOOR, (totalLevels - level) / totalLevels),
    exhausted,
    reset: () => setLevel(0),
  }
}
