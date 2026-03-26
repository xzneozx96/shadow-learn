import type { ExerciseMode } from '@/components/study/ModePicker'
import type { MistakeExample, ShadowLearnDB, SpacedRepetitionItem } from '@/db'
import type { VocabEntry } from '@/types'
import { useAuth } from '@/contexts/AuthContext'
import {
  getDueItems,
  getErrorPattern,
  getMasteryData,
  getProgressStats,
  getSpacedRepetitionItem,
  saveErrorPattern,
  saveMasteryData,
  saveProgressStats,
  saveSpacedRepetitionItem,
  upsertExerciseStat,
} from '@/db'
import { createSpacedRepetitionItem, updateSpacedRepetition } from '@/lib/spacedRepetition'

export type Skill = 'writing' | 'speaking' | 'vocabulary' | 'reading' | 'listening'
export type ExerciseType = Exclude<ExerciseMode, 'mixed'>

const EXERCISE_TO_SKILL: Record<ExerciseType, Skill> = {
  'dictation': 'listening',
  'romanization-recall': 'speaking',
  'reconstruction': 'reading',
  'writing': 'writing',
  'pronunciation': 'speaking',
  'cloze': 'vocabulary',
  'translation': 'writing',
}

function defaultProgressStats() {
  const defaultSkill = { sessions: 0, accuracy: 0, lastPracticed: null }
  return {
    totalSessions: 0,
    totalExercises: 0,
    totalCorrect: 0,
    totalIncorrect: 0,
    accuracyRate: 0,
    totalStudyMinutes: 0,
    accuracyTrend: [],
    skillProgress: {
      writing: { ...defaultSkill },
      speaking: { ...defaultSkill },
      vocabulary: { ...defaultSkill },
      reading: { ...defaultSkill },
      listening: { ...defaultSkill },
    },
  }
}

function defaultMasteryData() {
  const s = { masteryLevel: 0, confidenceScore: 0, totalPracticeTime: 0, lastPracticed: null }
  return { writing: { ...s }, speaking: { ...s }, vocabulary: { ...s }, reading: { ...s }, listening: { ...s } }
}

// -------------------------------------------------------------------------- //
// Standalone tracking function — usable from hooks and non-hook contexts
// -------------------------------------------------------------------------- //

export async function logExerciseCompletion(
  db: ShadowLearnDB,
  {
    vocabEntry,
    exerciseType,
    score,
    mistakes,
  }: {
    vocabEntry: VocabEntry
    exerciseType: ExerciseType
    score: number
    mistakes?: MistakeExample[]
  },
): Promise<SpacedRepetitionItem> {
  const today = new Date().toISOString().split('T')[0]
  const isCorrect = score >= 60

  // 1. Upsert SM-2 item
  const existing = await getSpacedRepetitionItem(db, vocabEntry.id)
  const item = existing ?? createSpacedRepetitionItem(vocabEntry.id)
  const updated = updateSpacedRepetition(item, score)
  await saveSpacedRepetitionItem(db, updated)

  // Update exercise-stats (difficulty tracking per vocabId:exerciseType)
  const statKey = `${vocabEntry.id}:${exerciseType}`
  await upsertExerciseStat(db, statKey, isCorrect)

  // 2. Update progress-db
  const skill = EXERCISE_TO_SKILL[exerciseType]
  const progress = (await getProgressStats(db)) ?? defaultProgressStats()
  progress.totalExercises += 1
  if (isCorrect)
    progress.totalCorrect += 1
  else progress.totalIncorrect += 1
  progress.accuracyRate = progress.totalCorrect / progress.totalExercises

  // Update accuracy trend (one entry per day, cap at 90)
  const last = progress.accuracyTrend.at(-1)
  if (last?.date === today) {
    const total = last.exercises + 1
    const prevCorrect = Math.round(last.accuracy * last.exercises)
    last.accuracy = (prevCorrect + (isCorrect ? 1 : 0)) / total
    last.exercises = total
  }
  else {
    progress.accuracyTrend.push({ date: today, accuracy: isCorrect ? 1 : 0, exercises: 1 })
    if (progress.accuracyTrend.length > 90)
      progress.accuracyTrend.shift()
  }

  // Update skill progress
  const sk = progress.skillProgress[skill]
  const prevAcc = sk.accuracy * sk.sessions
  sk.sessions += 1
  sk.accuracy = (prevAcc + (isCorrect ? 1 : 0)) / sk.sessions
  sk.lastPracticed = today
  await saveProgressStats(db, progress)

  // 3. Update mastery-db
  const mastery = (await getMasteryData(db)) ?? defaultMasteryData()
  mastery[skill].masteryLevel = updated.masteryLevel
  mastery[skill].lastPracticed = today
  await saveMasteryData(db, mastery)

  // 4. Log mistakes
  if (mistakes && mistakes.length > 0) {
    const pattern = (await getErrorPattern(db, vocabEntry.id)) ?? {
      patternId: vocabEntry.id,
      frequency: 0,
      lastOccurred: today,
      examples: [],
    }
    pattern.frequency += mistakes.length
    pattern.lastOccurred = today
    pattern.examples = [...pattern.examples, ...mistakes].slice(-10)
    await saveErrorPattern(db, pattern)
  }

  return updated
}

// -------------------------------------------------------------------------- //
// Hook — thin wrapper providing db from context
// -------------------------------------------------------------------------- //

export function useTracking() {
  const { db } = useAuth()

  async function logExerciseResult(args: {
    vocabEntry: VocabEntry
    exerciseType: ExerciseType
    score: number
    mistakes?: MistakeExample[]
  }): Promise<SpacedRepetitionItem | null> {
    if (!db)
      return null
    return logExerciseCompletion(db, args)
  }

  async function getDueItemsList(): Promise<SpacedRepetitionItem[]> {
    if (!db)
      return []
    const today = new Date().toISOString().split('T')[0]
    return getDueItems(db, today)
  }

  async function getDueItemCount(): Promise<number> {
    const items = await getDueItemsList()
    return items.length
  }

  async function logSessionComplete() {
    if (!db)
      return
    const progress = (await getProgressStats(db)) ?? defaultProgressStats()
    progress.totalSessions += 1
    await saveProgressStats(db, progress)
  }

  return { logExerciseResult, getDueItemCount, getDueItemsList, logSessionComplete }
}
