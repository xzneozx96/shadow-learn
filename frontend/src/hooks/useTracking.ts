import type { ExerciseMode } from '@/components/study/ModePicker'
import type { MistakeExample, SessionLog, ShadowLearnDB, SpacedRepetitionItem } from '@/db'
import type { VocabEntry } from '@/types'
import { useAuth } from '@/contexts/AuthContext'
import {
  getDueItems,
  getErrorPattern,
  getMasteryData,
  getProgressStats,
  saveErrorPattern,
  saveMasteryData,
  saveProgressStats,
  saveSessionLog,
  upsertExerciseStat,
} from '@/db'
import { todayISO } from '@/lib/date'
import { bufferSM2Score } from '@/lib/skillSessionProgress'

export type Skill = 'writing' | 'speaking' | 'vocabulary' | 'reading' | 'listening'
export type ExerciseType = Exclude<ExerciseMode, 'mixed'>

export const EXERCISE_TO_SKILL: Record<ExerciseType, Skill> = {
  'dictation': 'listening',
  'romanization-recall': 'vocabulary',
  'reconstruction': 'writing',
  'writing': 'writing',
  'pronunciation': 'speaking',
  'cloze': 'vocabulary',
  'translation': 'writing',
  'flashcard': 'vocabulary',
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
): Promise<void> {
  const today = todayISO()
  const isCorrect = score >= 60

  // 1. Buffer SM-2 score (worst-score-wins; flushed on app open or after session)
  bufferSM2Score(vocabEntry.id, score, today)

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
  }): Promise<void> {
    if (!db)
      return
    return logExerciseCompletion(db, args)
  }

  async function getDueItemsList(): Promise<SpacedRepetitionItem[]> {
    if (!db)
      return []
    const today = todayISO()
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

  async function logActivityDay(args: {
    skillPracticed: SessionLog['skillPracticed']
    exercisesCompleted: number
    exercisesCorrect: number
    durationMinutes?: number
  }): Promise<void> {
    if (!db)
      return
    const d = new Date()
    const localDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const log: SessionLog = {
      sessionId: crypto.randomUUID(),
      date: localDate,
      durationMinutes: args.durationMinutes ?? 0,
      skillPracticed: args.skillPracticed,
      exercisesCompleted: args.exercisesCompleted,
      exercisesCorrect: args.exercisesCorrect,
      accuracy: args.exercisesCompleted > 0
        ? Math.round((args.exercisesCorrect / args.exercisesCompleted) * 100)
        : 0,
      itemsMastered: [],
    }
    await saveSessionLog(db, log)
  }

  return { logExerciseResult, getDueItemCount, getDueItemsList, logSessionComplete, logActivityDay }
}
