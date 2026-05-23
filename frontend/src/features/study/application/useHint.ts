import { useState } from 'react'

export interface UseHintReturn {
  level: number
  revealNext: () => void
  hintScore: number
  exhausted: boolean
  reset: () => void
}

export function useHint(totalLevels: number): UseHintReturn {
  const [level, setLevel] = useState(0)
  const exhausted = level >= totalLevels
  return {
    level,
    revealNext: () => setLevel(l => Math.min(l + 1, totalLevels)),
    hintScore: totalLevels === 0 ? 1 : (totalLevels - level) / totalLevels,
    exhausted,
    reset: () => setLevel(0),
  }
}
