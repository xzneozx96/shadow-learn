import type { ExerciseMode } from '@/components/study/ModePicker'
import { renderHook } from '@testing-library/react'
import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/contexts/AuthContext'
import { initDB } from '@/db'
import { useTracking } from '@/hooks/useTracking'
import 'fake-indexeddb/auto'

// Mock useAuth to return our test db
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}))

const mockVocabEntry = {
  id: 'entry-1',
  word: '你好',
  romanization: 'nǐ hǎo',
  meaning: 'hello',
  usage: '',
  sourceLessonId: 'lesson-1',
  sourceLessonTitle: 'Test',
  sourceSegmentId: 'seg-1',
  sourceSegmentText: '你好世界',
  sourceSegmentTranslation: 'hello world',
  sourceLanguage: 'zh-CN',
  createdAt: '2026-01-01',
}

describe('useTracking', () => {
  let db: Awaited<ReturnType<typeof initDB>>

  beforeEach(async () => {
    globalThis.indexedDB = new IDBFactory()
    db = await initDB()
    vi.mocked(useAuth).mockReturnValue({ db, keys: null, isUnlocked: true, isFirstSetup: false } as ReturnType<typeof useAuth>)
  })

  it('creates a new SM-2 item on first logExerciseResult call', async () => {
    const { result } = renderHook(() => useTracking())
    const updated = await result.current.logExerciseResult({
      vocabEntry: mockVocabEntry,
      exerciseType: 'dictation',
      score: 100,
    })
    expect(updated).not.toBeNull()
    expect(updated?.itemId).toBe('entry-1')
    expect(updated?.repetitions).toBe(1)
    expect(updated?.intervalDays).toBe(1)
  })

  it('updates an existing SM-2 item on subsequent calls', async () => {
    const { result } = renderHook(() => useTracking())
    await result.current.logExerciseResult({ vocabEntry: mockVocabEntry, exerciseType: 'dictation', score: 100 })
    const second = await result.current.logExerciseResult({ vocabEntry: mockVocabEntry, exerciseType: 'dictation', score: 100 })
    expect(second?.repetitions).toBe(2)
    expect(second?.intervalDays).toBe(6)
  })

  it('creates progress-db entry with correct stats', async () => {
    const { result } = renderHook(() => useTracking())
    await result.current.logExerciseResult({ vocabEntry: mockVocabEntry, exerciseType: 'dictation', score: 100 })
    const stats = await db.get('progress-db', 'global')
    expect(stats?.totalExercises).toBe(1)
    expect(stats?.totalCorrect).toBe(1)
    expect(stats?.totalIncorrect).toBe(0)
  })

  it('logs mistakes when provided', async () => {
    const { result } = renderHook(() => useTracking())
    await result.current.logExerciseResult({
      vocabEntry: mockVocabEntry,
      exerciseType: 'dictation',
      score: 0,
      mistakes: [{ userAnswer: '你', correctAnswer: '你好', date: '2026-03-19' }],
    })
    const pattern = await db.get('mistakes-db', 'entry-1')
    expect(pattern?.frequency).toBe(1)
    expect(pattern?.examples).toHaveLength(1)
  })

  it('does nothing when db is null', async () => {
    vi.mocked(useAuth).mockReturnValue({ db: null, keys: null, isUnlocked: true, isFirstSetup: false } as ReturnType<typeof useAuth>)
    const { result } = renderHook(() => useTracking())
    // Should not throw
    await expect(result.current.logExerciseResult({
      vocabEntry: mockVocabEntry,
      exerciseType: 'dictation',
      score: 100,
    })).resolves.toBeNull()
  })

  it('writes exercise-stats entry after logExerciseResult', async () => {
    const { result } = renderHook(() => useTracking())
    await result.current.logExerciseResult({
      vocabEntry: mockVocabEntry,
      exerciseType: 'dictation',
      score: 100,
    })
    // Read back from exercise-stats store
    const stat = await db.get('exercise-stats', 'entry-1:dictation')
    expect(stat).toBeDefined()
    expect(stat!.correct).toBe(1)
    expect(stat!.total).toBe(1)
  })

  it('increments exercise-stats on incorrect answer', async () => {
    const { result } = renderHook(() => useTracking())
    await result.current.logExerciseResult({
      vocabEntry: mockVocabEntry,
      exerciseType: 'dictation',
      score: 40, // below 60 threshold = incorrect
    })
    const stat = await db.get('exercise-stats', 'entry-1:dictation')
    expect(stat!.correct).toBe(0)
    expect(stat!.total).toBe(1)
  })

  describe('logSessionComplete', () => {
    let db: Awaited<ReturnType<typeof initDB>>

    beforeEach(async () => {
      globalThis.indexedDB = new IDBFactory()
      db = await initDB()
      vi.mocked(useAuth).mockReturnValue({ db, keys: null, isUnlocked: true, isFirstSetup: false } as ReturnType<typeof useAuth>)
    })

    it('increments totalSessions from 0 to 1', async () => {
      const { result } = renderHook(() => useTracking())
      await result.current.logSessionComplete()
      const stats = await db.get('progress-db', 'global')
      expect(stats?.totalSessions).toBe(1)
    })

    it('increments on successive calls', async () => {
      const { result } = renderHook(() => useTracking())
      await result.current.logSessionComplete()
      await result.current.logSessionComplete()
      const stats = await db.get('progress-db', 'global')
      expect(stats?.totalSessions).toBe(2)
    })

    it('does not clobber other progress fields', async () => {
      const { result } = renderHook(() => useTracking())
      await result.current.logExerciseResult({ vocabEntry: mockVocabEntry, exerciseType: 'dictation', score: 100 })
      await result.current.logSessionComplete()
      const stats = await db.get('progress-db', 'global')
      expect(stats?.totalSessions).toBe(1)
      expect(stats?.totalExercises).toBe(1)
    })

    it('does nothing when db is null', async () => {
      vi.mocked(useAuth).mockReturnValue({ db: null, keys: null, isUnlocked: true, isFirstSetup: false } as ReturnType<typeof useAuth>)
      const { result } = renderHook(() => useTracking())
      // Should not throw
      await expect(result.current.logSessionComplete()).resolves.toBeUndefined()
    })
  })
})

// ── Per-exercise-type routing ─────────────────────────────────────────────────
// Each exercise type must route to the correct skill bucket in progress-db and
// mastery-db. These tests simulate one completed exercise per type and assert:
//   1. SM-2 item is persisted in spaced-repetition
//   2. The correct skill counter is incremented in progress-db.skillProgress
//   3. mastery-db.{skill}.lastPracticed is set
//   4. Mistakes are recorded in mistakes-db when the answer is wrong

interface ExerciseCase {
  exerciseType: Exclude<ExerciseMode, 'mixed'>
  skill: 'writing' | 'speaking' | 'vocabulary' | 'reading' | 'listening'
}

const EXERCISE_CASES: ExerciseCase[] = [
  { exerciseType: 'dictation', skill: 'listening' },
  { exerciseType: 'romanization-recall', skill: 'speaking' },
  { exerciseType: 'reconstruction', skill: 'reading' },
  { exerciseType: 'writing', skill: 'writing' },
  { exerciseType: 'pronunciation', skill: 'speaking' },
  { exerciseType: 'cloze', skill: 'vocabulary' },
  { exerciseType: 'translation', skill: 'writing' },
]

describe('exercise-type → skill routing', () => {
  let db: Awaited<ReturnType<typeof initDB>>

  beforeEach(async () => {
    globalThis.indexedDB = new IDBFactory()
    db = await initDB()
    vi.mocked(useAuth).mockReturnValue({ db, keys: null, isUnlocked: true, isFirstSetup: false } as ReturnType<typeof useAuth>)
  })

  for (const { exerciseType, skill } of EXERCISE_CASES) {
    it(`${exerciseType} (score=100) → increments ${skill} skill bucket`, async () => {
      const { result } = renderHook(() => useTracking())

      await result.current.logExerciseResult({
        vocabEntry: mockVocabEntry,
        exerciseType,
        score: 100,
      })

      // SM-2 persisted
      const item = await db.get('spaced-repetition', 'entry-1')
      expect(item?.itemId).toBe('entry-1')
      expect(item?.repetitions).toBe(1)

      // Correct skill bucket incremented; all others remain 0
      const stats = await db.get('progress-db', 'global')
      expect(stats?.skillProgress[skill].sessions).toBe(1)
      expect(stats?.totalCorrect).toBe(1)
      expect(stats?.totalIncorrect).toBe(0)
      const OTHER_SKILLS = (['writing', 'speaking', 'vocabulary', 'reading', 'listening'] as const)
        .filter(s => s !== skill)
      for (const other of OTHER_SKILLS)
        expect(stats?.skillProgress[other].sessions).toBe(0)

      // mastery-db updated for the correct skill
      const mastery = await db.get('mastery-db', 'global')
      expect(mastery?.[skill].lastPracticed).not.toBeNull()
    })

    it(`${exerciseType} (score=0) → counts as incorrect, logs mistake, SM-2 penalised`, async () => {
      const { result } = renderHook(() => useTracking())
      const mistake = { userAnswer: 'x', correctAnswer: mockVocabEntry.word, date: '2026-03-19' }

      await result.current.logExerciseResult({
        vocabEntry: mockVocabEntry,
        exerciseType,
        score: 0,
        mistakes: [mistake],
      })

      // SM-2: score 0 → quality 0, should not increment repetitions beyond initial
      const item = await db.get('spaced-repetition', 'entry-1')
      expect(item).not.toBeNull()
      expect(item?.consecutiveIncorrect).toBeGreaterThanOrEqual(1)

      // progress-db: counted as incorrect
      const stats = await db.get('progress-db', 'global')
      expect(stats?.totalCorrect).toBe(0)
      expect(stats?.totalIncorrect).toBe(1)
      expect(stats?.skillProgress[skill].sessions).toBe(1)
      expect(stats?.skillProgress[skill].accuracy).toBe(0)

      // mistakes-db: entry recorded
      const pattern = await db.get('mistakes-db', 'entry-1')
      expect(pattern?.frequency).toBe(1)
      expect(pattern?.examples[0].userAnswer).toBe('x')
    })
  }
})

describe('score thresholds', () => {
  let db: Awaited<ReturnType<typeof initDB>>

  beforeEach(async () => {
    globalThis.indexedDB = new IDBFactory()
    db = await initDB()
    vi.mocked(useAuth).mockReturnValue({ db, keys: null, isUnlocked: true, isFirstSetup: false } as ReturnType<typeof useAuth>)
  })

  it('score >= 60 counts as correct', async () => {
    const { result } = renderHook(() => useTracking())
    await result.current.logExerciseResult({ vocabEntry: mockVocabEntry, exerciseType: 'cloze', score: 60 })
    const stats = await db.get('progress-db', 'global')
    expect(stats?.totalCorrect).toBe(1)
    expect(stats?.totalIncorrect).toBe(0)
  })

  it('score 59 counts as incorrect', async () => {
    const { result } = renderHook(() => useTracking())
    await result.current.logExerciseResult({ vocabEntry: mockVocabEntry, exerciseType: 'cloze', score: 59 })
    const stats = await db.get('progress-db', 'global')
    expect(stats?.totalCorrect).toBe(0)
    expect(stats?.totalIncorrect).toBe(1)
  })

  it('score 0 counts as incorrect and skill accuracy = 0', async () => {
    const { result } = renderHook(() => useTracking())
    await result.current.logExerciseResult({ vocabEntry: mockVocabEntry, exerciseType: 'dictation', score: 0 })
    const stats = await db.get('progress-db', 'global')
    expect(stats?.skillProgress.listening.accuracy).toBe(0)
  })

  it('mixed correct/incorrect updates accuracyRate correctly', async () => {
    const { result } = renderHook(() => useTracking())
    await result.current.logExerciseResult({ vocabEntry: mockVocabEntry, exerciseType: 'dictation', score: 100 })
    await result.current.logExerciseResult({ vocabEntry: mockVocabEntry, exerciseType: 'dictation', score: 0 })
    const stats = await db.get('progress-db', 'global')
    expect(stats?.totalExercises).toBe(2)
    expect(stats?.accuracyRate).toBeCloseTo(0.5)
  })
})

describe('mistakes-db per exercise type', () => {
  let db: Awaited<ReturnType<typeof initDB>>

  beforeEach(async () => {
    globalThis.indexedDB = new IDBFactory()
    db = await initDB()
    vi.mocked(useAuth).mockReturnValue({ db, keys: null, isUnlocked: true, isFirstSetup: false } as ReturnType<typeof useAuth>)
  })

  it('accumulates frequency across repeated wrong answers', async () => {
    const { result } = renderHook(() => useTracking())
    const mistake = { userAnswer: 'x', correctAnswer: '你好', date: '2026-03-19' }
    await result.current.logExerciseResult({ vocabEntry: mockVocabEntry, exerciseType: 'dictation', score: 0, mistakes: [mistake] })
    await result.current.logExerciseResult({ vocabEntry: mockVocabEntry, exerciseType: 'dictation', score: 0, mistakes: [mistake, mistake] })
    const pattern = await db.get('mistakes-db', 'entry-1')
    expect(pattern?.frequency).toBe(3)
  })

  it('keeps only the last 10 examples', async () => {
    const { result } = renderHook(() => useTracking())
    const mistake = { userAnswer: 'x', correctAnswer: '你好', date: '2026-03-19' }
    for (let i = 0; i < 12; i++) {
      await result.current.logExerciseResult({
        vocabEntry: mockVocabEntry,
        exerciseType: 'dictation',
        score: 0,
        mistakes: [mistake],
      })
    }
    const pattern = await db.get('mistakes-db', 'entry-1')
    expect(pattern?.examples).toHaveLength(10)
  })

  it('does not create mistakes-db entry when no mistakes passed', async () => {
    const { result } = renderHook(() => useTracking())
    await result.current.logExerciseResult({ vocabEntry: mockVocabEntry, exerciseType: 'dictation', score: 0 })
    const pattern = await db.get('mistakes-db', 'entry-1')
    expect(pattern).toBeUndefined()
  })

  it('each exercise type can log mistakes independently', async () => {
    const { result } = renderHook(() => useTracking())
    const entryA = { ...mockVocabEntry, id: 'entry-a' }
    const entryB = { ...mockVocabEntry, id: 'entry-b' }
    const mistake = { userAnswer: 'x', correctAnswer: '?', date: '2026-03-19' }
    await result.current.logExerciseResult({ vocabEntry: entryA, exerciseType: 'romanization-recall', score: 0, mistakes: [mistake] })
    await result.current.logExerciseResult({ vocabEntry: entryB, exerciseType: 'reconstruction', score: 0, mistakes: [mistake, mistake] })

    const pA = await db.get('mistakes-db', 'entry-a')
    const pB = await db.get('mistakes-db', 'entry-b')
    expect(pA?.frequency).toBe(1)
    expect(pB?.frequency).toBe(2)
  })
})

describe('mistake wiring — end-to-end contract', () => {
  let db: Awaited<ReturnType<typeof initDB>>

  beforeEach(async () => {
    globalThis.indexedDB = new IDBFactory()
    db = await initDB()
    vi.mocked(useAuth).mockReturnValue({ db, keys: null, isUnlocked: true, isFirstSetup: false } as ReturnType<typeof useAuth>)
  })

  it('dictation wrong answer: userAnswer and correctAnswer stored in mistakes-db', async () => {
    const { result } = renderHook(() => useTracking())
    const today = new Date().toISOString().split('T')[0]
    await result.current.logExerciseResult({
      vocabEntry: mockVocabEntry,
      exerciseType: 'dictation',
      score: 40,
      mistakes: [{ userAnswer: '你坏', correctAnswer: '你好', date: today }],
    })
    const pattern = await db.get('mistakes-db', 'entry-1')
    expect(pattern?.frequency).toBe(1)
    expect(pattern?.examples[0].userAnswer).toBe('你坏')
    expect(pattern?.examples[0].correctAnswer).toBe('你好')
  })

  it('romanization-recall wrong answer: userAnswer and correctAnswer stored', async () => {
    const { result } = renderHook(() => useTracking())
    const today = new Date().toISOString().split('T')[0]
    await result.current.logExerciseResult({
      vocabEntry: mockVocabEntry,
      exerciseType: 'romanization-recall',
      score: 50,
      mistakes: [{ userAnswer: 'ni hao', correctAnswer: 'nǐ hǎo', date: today }],
    })
    const pattern = await db.get('mistakes-db', 'entry-1')
    expect(pattern?.examples[0].userAnswer).toBe('ni hao')
    expect(pattern?.examples[0].correctAnswer).toBe('nǐ hǎo')
  })

  it('cloze with two wrong blanks: both stored as separate examples', async () => {
    const { result } = renderHook(() => useTracking())
    const today = new Date().toISOString().split('T')[0]
    await result.current.logExerciseResult({
      vocabEntry: mockVocabEntry,
      exerciseType: 'cloze',
      score: 0,
      mistakes: [
        { userAnswer: '走', correctAnswer: '去', date: today },
        { userAnswer: '今日', correctAnswer: '今天', date: today },
      ],
    })
    const pattern = await db.get('mistakes-db', 'entry-1')
    expect(pattern?.frequency).toBe(2)
    expect(pattern?.examples).toHaveLength(2)
  })

  it('reconstruction wrong sentence: full sentence stored', async () => {
    const { result } = renderHook(() => useTracking())
    const today = new Date().toISOString().split('T')[0]
    await result.current.logExerciseResult({
      vocabEntry: mockVocabEntry,
      exerciseType: 'reconstruction',
      score: 0,
      mistakes: [{ userAnswer: '世界你好', correctAnswer: '你好世界', date: today }],
    })
    const pattern = await db.get('mistakes-db', 'entry-1')
    expect(pattern?.examples[0].userAnswer).toBe('世界你好')
    expect(pattern?.examples[0].correctAnswer).toBe('你好世界')
  })

  it('correct answer (score 100): no mistake entry created', async () => {
    const { result } = renderHook(() => useTracking())
    await result.current.logExerciseResult({
      vocabEntry: mockVocabEntry,
      exerciseType: 'dictation',
      score: 100,
    })
    const pattern = await db.get('mistakes-db', 'entry-1')
    expect(pattern).toBeUndefined()
  })
})
