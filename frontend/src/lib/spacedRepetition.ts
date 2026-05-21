import type { SpacedRepetitionItem } from '@/db'
import { todayISO } from '@/lib/date'

export function scoreToQuality(score: number): number {
  return Math.min(5, Math.floor(Math.min(score, 100) / 20))
}

function localDateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function createSpacedRepetitionItem(itemId: string): SpacedRepetitionItem {
  const today = todayISO()
  return {
    itemId,
    itemType: 'vocabulary',
    easinessFactor: 2.5,
    intervalDays: 1,
    repetitions: 0,
    consecutiveCorrect: 0,
    consecutiveIncorrect: 0,
    masteryLevel: 0,
    dueDate: today,
    lastReviewed: null,
    reviewHistory: [],
  }
}

export function updateSpacedRepetition(
  item: SpacedRepetitionItem,
  performanceScore: number,
  reviewDate?: string,
): SpacedRepetitionItem {
  const quality = scoreToQuality(performanceScore)
  const studyDate = reviewDate ?? todayISO()

  let { repetitions, intervalDays, easinessFactor, consecutiveCorrect, consecutiveIncorrect, masteryLevel } = item

  if (quality >= 3) {
    repetitions += 1
    consecutiveCorrect += 1
    consecutiveIncorrect = 0
    if (repetitions === 1)
      intervalDays = 1
    else intervalDays = Math.round(intervalDays * easinessFactor)
  }
  else {
    repetitions = 0
    consecutiveIncorrect += 1
    consecutiveCorrect = 0
    intervalDays = 1
  }

  easinessFactor = Math.max(
    1.3,
    easinessFactor + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02),
  )

  if (consecutiveCorrect >= 5) {
    masteryLevel = Math.min(5, masteryLevel + 1)
    consecutiveCorrect = 0
  }
  else if (consecutiveIncorrect >= 3) {
    masteryLevel = Math.max(0, masteryLevel - 1)
    consecutiveIncorrect = 0
  }

  const [sy, sm, sd] = studyDate.split('-').map(Number)
  const dueDate = new Date(sy, sm - 1, sd + intervalDays)

  return {
    ...item,
    repetitions,
    intervalDays,
    easinessFactor,
    consecutiveCorrect,
    consecutiveIncorrect,
    masteryLevel,
    dueDate: localDateString(dueDate),
    lastReviewed: studyDate,
    reviewHistory: [
      ...item.reviewHistory,
      { date: studyDate, quality, intervalDays },
    ],
  }
}

export function isItemDueToday(item: SpacedRepetitionItem): boolean {
  return item.dueDate <= todayISO()
}
