import type { ExerciseStat } from '../db'

export type StepMode = 'forced' | 'full' | 'normal' | 'fast-path'

export function getStepMode(stat: ExerciseStat | undefined): StepMode {
  if (!stat || stat.total === 0)
    return 'forced'
  const accuracy = stat.correct / stat.total
  if (accuracy < 0.7)
    return 'full'
  if (accuracy <= 0.85)
    return 'normal'
  return 'fast-path'
}
