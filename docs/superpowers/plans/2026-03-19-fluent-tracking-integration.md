# Fluent Tracking System Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate a spaced-repetition (SM-2) tracking system into the existing study exercises, persisting all progress in IndexedDB, and expose a Progress Dashboard page.

**Architecture:** Six new IDB object stores (three singletons, three flat-record) hold learner stats, SM-2 scheduling, mastery, and mistakes. A pure `spacedRepetition.ts` library computes SM-2 updates; a `useTracking` hook writes to IDB after each exercise. All exercise `onNext` callbacks change from `boolean` to a `0–100` score so the SM-2 algorithm has the granularity it needs.

**Tech Stack:** React 19, TypeScript, `idb` v8, `vitest` + `fake-indexeddb`, Tailwind CSS v4, `react-router-dom` v7. No new runtime dependencies required (chart uses CSS only).

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `frontend/src/db/index.ts` | Add 6 new typed IDB stores + CRUD helpers |
| **Create** | `frontend/src/lib/spacedRepetition.ts` | Pure SM-2 algorithm functions |
| **Create** | `frontend/tests/spacedRepetition.test.ts` | Unit tests for SM-2 library |
| **Create** | `frontend/src/hooks/useTracking.ts` | Hook: writes SM-2 + stats to IDB after each exercise |
| **Create** | `frontend/tests/useTracking.test.ts` | Integration tests (fake-indexeddb) |
| Modify | `frontend/src/components/study/exercises/RomanizationRecallExercise.tsx` | `onNext(score: number)` |
| Modify | `frontend/src/components/study/exercises/DictationExercise.tsx` | `onNext(score: number)` |
| Modify | `frontend/src/components/study/exercises/ClozeExercise.tsx` | `onNext(score: number)` |
| Modify | `frontend/src/components/study/exercises/ReconstructionExercise.tsx` | `onNext(score: number)` |
| Modify | `frontend/src/components/study/exercises/CharacterWritingExercise.tsx` | `onNext(score: number)` |
| Modify | `frontend/src/components/study/exercises/PronunciationReferee.tsx` | `onNext(score: number)` |
| Modify | `frontend/src/components/study/exercises/TranslationExercise.tsx` | `onNext(score: number)` |
| Modify | `frontend/src/components/study/StudySession.tsx` | `handleNext(score)`, call tracking, support `preloadedEntries` |
| Modify | `frontend/src/components/study/SessionSummary.tsx` | Score-based stats + SM-2 next-review display |
| **Create** | `frontend/src/pages/ProgressDashboardPage.tsx` | `/progress` route page |
| **Create** | `frontend/src/pages/ReviewSessionPage.tsx` | `/progress/review` route — loads due SM-2 items |
| **Create** | `frontend/src/components/progress/OverallStatsPanel.tsx` | Total sessions / accuracy / minutes |
| **Create** | `frontend/src/components/progress/AccuracyTrendChart.tsx` | CSS-only bar chart of last 30 days |
| **Create** | `frontend/src/components/progress/SkillMasteryGrid.tsx` | 5-star mastery per skill |
| **Create** | `frontend/src/components/progress/MistakesPanel.tsx` | Top recent mistakes |
| **Create** | `frontend/src/components/progress/ReviewQueueBanner.tsx` | "X items due" + Start Review button |
| Modify | `frontend/src/App.tsx` | Add `/progress` and `/progress/review` routes |
| Modify | `frontend/src/components/Layout.tsx` | Add "Progress" nav link |

---

## Task 1: DB Schema v5

**Files:**
- Modify: `frontend/src/db/index.ts`

### Design notes

Three stores hold singleton documents (no `keyPath`; keyed by a constant string):
- `learner-profile` → key `'profile'`
- `progress-db` → key `'global'`
- `mastery-db` → key `'global'`

Three stores hold flat records (one row per item):
- `spaced-repetition` → `keyPath: 'itemId'`, index `by-due` on `dueDate`
- `session-logs` → `keyPath: 'sessionId'`
- `mistakes-db` → `keyPath: 'patternId'` (patternId = vocabEntry.id)

- [ ] **Step 1: Add the six TypeScript interfaces** to `db/index.ts` (above `ShadowLearnSchema`):

```typescript
export interface LearnerProfile {
  name: string
  nativeLanguage: string
  targetLanguage: string
  currentLevel: string
  dailyGoalMinutes: number
  currentStreakDays: number
  totalSessions: number
  totalStudyMinutes: number
  lastStudyDate: string | null
  profileCreated: string
}

export interface DailyAccuracy { date: string; accuracy: number; exercises: number }
export interface SkillStats { sessions: number; accuracy: number; lastPracticed: string | null }

export interface ProgressStats {
  totalSessions: number
  totalExercises: number
  totalCorrect: number
  totalIncorrect: number
  accuracyRate: number
  totalStudyMinutes: number
  accuracyTrend: DailyAccuracy[]   // max 90 entries, one per day
  skillProgress: Record<'writing' | 'speaking' | 'vocabulary' | 'reading' | 'listening', SkillStats>
}

export interface SpacedRepetitionItem {
  itemId: string               // = VocabEntry.id
  itemType: 'vocabulary'
  easinessFactor: number       // default 2.5
  intervalDays: number         // default 1
  repetitions: number          // SM-2 repetition count
  consecutiveCorrect: number   // for mastery level ups
  consecutiveIncorrect: number // for mastery level downs
  masteryLevel: number         // 0–5
  dueDate: string              // 'YYYY-MM-DD' — indexed for querying
  lastReviewed: string | null
  reviewHistory: { date: string; quality: number; intervalDays: number }[]
}

export interface MistakeExample {
  userAnswer: string
  correctAnswer: string
  context?: string
  date: string
}

export interface ErrorPattern {
  patternId: string   // = VocabEntry.id
  frequency: number
  lastOccurred: string
  examples: MistakeExample[]  // keep last 10
}

export interface SessionLog {
  sessionId: string
  date: string
  durationMinutes: number
  skillPracticed: 'writing' | 'speaking' | 'vocabulary' | 'reading' | 'listening' | 'mixed'
  exercisesCompleted: number
  exercisesCorrect: number
  accuracy: number
  itemsMastered: string[]  // itemIds that hit masteryLevel 5 this session
}

export interface SkillMastery {
  masteryLevel: number   // 0–5
  confidenceScore: number
  totalPracticeTime: number
  lastPracticed: string | null
}
export type MasteryData = Record<'writing' | 'speaking' | 'vocabulary' | 'reading' | 'listening', SkillMastery>
```

- [ ] **Step 2: Extend `ShadowLearnSchema`** with the six new stores:

```typescript
// Inside ShadowLearnSchema extends DBSchema:
'learner-profile': { key: string; value: LearnerProfile }
'progress-db': { key: string; value: ProgressStats }
'mastery-db': { key: string; value: MasteryData }
'spaced-repetition': {
  key: string
  value: SpacedRepetitionItem
  indexes: { 'by-due': string }
}
'session-logs': { key: string; value: SessionLog }
'mistakes-db': { key: string; value: ErrorPattern }
```

- [ ] **Step 3: Add the `if (oldVersion < 5)` migration block** inside `upgrade()`:

```typescript
if (oldVersion < 5) {
  db.createObjectStore('learner-profile')
  db.createObjectStore('progress-db')
  db.createObjectStore('mastery-db')
  const srStore = db.createObjectStore('spaced-repetition', { keyPath: 'itemId' })
  srStore.createIndex('by-due', 'dueDate', { unique: false })
  db.createObjectStore('session-logs', { keyPath: 'sessionId' })
  db.createObjectStore('mistakes-db', { keyPath: 'patternId' })
}
```

- [ ] **Step 4: Bump `DB_VERSION` from `4` to `5`.**

- [ ] **Step 5: Add CRUD helpers** for the new stores at the bottom of `db/index.ts`:

```typescript
// Spaced Repetition
export async function getSpacedRepetitionItem(db: ShadowLearnDB, itemId: string) {
  return db.get('spaced-repetition', itemId)
}
export async function saveSpacedRepetitionItem(db: ShadowLearnDB, item: SpacedRepetitionItem) {
  await db.put('spaced-repetition', item)
}
export async function getDueItems(db: ShadowLearnDB, today: string): Promise<SpacedRepetitionItem[]> {
  const all = await db.getAllFromIndex('spaced-repetition', 'by-due', IDBKeyRange.upperBound(today))
  return all
}

// Progress Stats
export async function getProgressStats(db: ShadowLearnDB) {
  return db.get('progress-db', 'global')
}
export async function saveProgressStats(db: ShadowLearnDB, stats: ProgressStats) {
  await db.put('progress-db', stats, 'global')
}

// Mastery
export async function getMasteryData(db: ShadowLearnDB) {
  return db.get('mastery-db', 'global')
}
export async function saveMasteryData(db: ShadowLearnDB, data: MasteryData) {
  await db.put('mastery-db', data, 'global')
}

// Mistakes
export async function getErrorPattern(db: ShadowLearnDB, patternId: string) {
  return db.get('mistakes-db', patternId)
}
export async function saveErrorPattern(db: ShadowLearnDB, pattern: ErrorPattern) {
  await db.put('mistakes-db', pattern)
}
export async function getRecentMistakes(db: ShadowLearnDB, limit = 20): Promise<ErrorPattern[]> {
  const all = await db.getAll('mistakes-db')
  return all.sort((a, b) => b.lastOccurred.localeCompare(a.lastOccurred)).slice(0, limit)
}

// Session Logs
export async function saveSessionLog(db: ShadowLearnDB, log: SessionLog) {
  await db.put('session-logs', log)
}

// Vocabulary by ID (needed for SM-2 review sessions)
export async function getVocabEntryById(db: ShadowLearnDB, id: string): Promise<VocabEntry | undefined> {
  return db.get('vocabulary', id)
}
```

- [ ] **Step 6: Verify the existing `db.test.ts` still passes.**

Run: `npx vitest run tests/db.test.ts`
Expected: all tests PASS (migration is additive — no existing data touched)

- [ ] **Step 7: Commit**

```bash
git add frontend/src/db/index.ts
git commit -m "feat(db): add v5 schema with 6 spaced-repetition tracking stores"
```

---

## Task 2: SM-2 Algorithm Library

**Files:**
- Create: `frontend/src/lib/spacedRepetition.ts`
- Create: `frontend/tests/spacedRepetition.test.ts`

### Score-to-quality mapping

Exercises produce a `0–100` score. SM-2 needs quality `0–5`:

```
score 100   → quality 5  (perfect)
score 80–99 → quality 4  (correct, easy)
score 60–79 → quality 3  (correct, some effort)
score 40–59 → quality 2  (incorrect but knew it when shown)
score 20–39 → quality 1  (incorrect, somewhat familiar)
score 0–19  → quality 0  (complete blackout / skip)
```

Formula: `quality = Math.min(5, Math.floor(score / 20))`

- [ ] **Step 1: Write failing tests** in `frontend/tests/spacedRepetition.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import {
  createSpacedRepetitionItem,
  isItemDueToday,
  scoreToQuality,
  updateSpacedRepetition,
} from '../src/lib/spacedRepetition'

describe('scoreToQuality', () => {
  it('maps 100 → 5', () => expect(scoreToQuality(100)).toBe(5))
  it('maps 80 → 4', () => expect(scoreToQuality(80)).toBe(4))
  it('maps 60 → 3', () => expect(scoreToQuality(60)).toBe(3))
  it('maps 40 → 2', () => expect(scoreToQuality(40)).toBe(2))
  it('maps 20 → 1', () => expect(scoreToQuality(20)).toBe(1))
  it('maps 0 → 0', () => expect(scoreToQuality(0)).toBe(0))
  it('maps 99 → 4', () => expect(scoreToQuality(99)).toBe(4))
  it('maps 19 → 0', () => expect(scoreToQuality(19)).toBe(0))
})

describe('createSpacedRepetitionItem', () => {
  it('creates default item with correct initial values', () => {
    const item = createSpacedRepetitionItem('vocab-1')
    expect(item.itemId).toBe('vocab-1')
    expect(item.easinessFactor).toBe(2.5)
    expect(item.intervalDays).toBe(1)
    expect(item.repetitions).toBe(0)
    expect(item.masteryLevel).toBe(0)
    expect(item.consecutiveCorrect).toBe(0)
    expect(item.consecutiveIncorrect).toBe(0)
    expect(item.reviewHistory).toEqual([])
  })
})

describe('updateSpacedRepetition', () => {
  it('increments repetitions and sets interval=1 on first correct answer', () => {
    const item = createSpacedRepetitionItem('vocab-1')
    const updated = updateSpacedRepetition(item, 80)
    expect(updated.repetitions).toBe(1)
    expect(updated.intervalDays).toBe(1)
    expect(updated.consecutiveCorrect).toBe(1)
    expect(updated.consecutiveIncorrect).toBe(0)
  })

  it('sets interval=6 on second correct answer', () => {
    let item = createSpacedRepetitionItem('vocab-1')
    item = updateSpacedRepetition(item, 80)
    item = updateSpacedRepetition(item, 80)
    expect(item.repetitions).toBe(2)
    expect(item.intervalDays).toBe(6)
  })

  it('multiplies interval by easiness factor on third+ correct answer', () => {
    let item = createSpacedRepetitionItem('vocab-1')
    item = updateSpacedRepetition(item, 80)  // rep=1, interval=1
    item = updateSpacedRepetition(item, 80)  // rep=2, interval=6
    const ef = item.easinessFactor
    item = updateSpacedRepetition(item, 80)  // rep=3, interval=round(6*ef)
    expect(item.intervalDays).toBe(Math.round(6 * ef))
  })

  it('resets interval to 1 and repetitions to 0 on incorrect answer (score < 60)', () => {
    let item = createSpacedRepetitionItem('vocab-1')
    item = updateSpacedRepetition(item, 80)  // correct
    item = updateSpacedRepetition(item, 80)  // correct
    item = updateSpacedRepetition(item, 20)  // incorrect
    expect(item.repetitions).toBe(0)
    expect(item.intervalDays).toBe(1)
    expect(item.consecutiveIncorrect).toBe(1)
    expect(item.consecutiveCorrect).toBe(0)
  })

  it('clamps easiness factor to minimum 1.3', () => {
    let item = createSpacedRepetitionItem('vocab-1')
    // Spam quality=0 (score=0) many times to drive EF down
    for (let i = 0; i < 20; i++) item = updateSpacedRepetition(item, 0)
    expect(item.easinessFactor).toBeGreaterThanOrEqual(1.3)
  })

  it('increments masteryLevel after 5 consecutive correct answers and resets counter', () => {
    let item = createSpacedRepetitionItem('vocab-1')
    for (let i = 0; i < 5; i++) item = updateSpacedRepetition(item, 80)
    expect(item.masteryLevel).toBe(1)
    expect(item.consecutiveCorrect).toBe(0)  // counter resets so next level-up requires another 5
  })

  it('decrements masteryLevel after 3 consecutive incorrect answers', () => {
    let item = createSpacedRepetitionItem('vocab-1')
    item = { ...item, masteryLevel: 3 }
    for (let i = 0; i < 3; i++) item = updateSpacedRepetition(item, 0)
    expect(item.masteryLevel).toBe(2)
  })

  it('does not exceed masteryLevel 5 or go below 0', () => {
    let item = createSpacedRepetitionItem('vocab-1')
    item = { ...item, masteryLevel: 5, consecutiveCorrect: 4 }
    item = updateSpacedRepetition(item, 100)
    expect(item.masteryLevel).toBe(5)

    item = { ...item, masteryLevel: 0, consecutiveIncorrect: 2 }
    item = updateSpacedRepetition(item, 0)
    expect(item.masteryLevel).toBe(0)
  })

  it('appends to reviewHistory on each update', () => {
    let item = createSpacedRepetitionItem('vocab-1')
    item = updateSpacedRepetition(item, 80)
    item = updateSpacedRepetition(item, 40)
    expect(item.reviewHistory).toHaveLength(2)
    expect(item.reviewHistory[0].quality).toBe(4)
    expect(item.reviewHistory[1].quality).toBe(2)
  })

  it('sets dueDate to today+intervalDays', () => {
    const item = createSpacedRepetitionItem('vocab-1')
    const updated = updateSpacedRepetition(item, 80)
    const expectedDate = new Date()
    expectedDate.setDate(expectedDate.getDate() + updated.intervalDays)
    expect(updated.dueDate).toBe(expectedDate.toISOString().split('T')[0])
  })
})

describe('isItemDueToday', () => {
  it('returns true when dueDate is today', () => {
    const today = new Date().toISOString().split('T')[0]
    const item = { ...createSpacedRepetitionItem('x'), dueDate: today }
    expect(isItemDueToday(item)).toBe(true)
  })

  it('returns true when dueDate is in the past', () => {
    const item = { ...createSpacedRepetitionItem('x'), dueDate: '2020-01-01' }
    expect(isItemDueToday(item)).toBe(true)
  })

  it('returns false when dueDate is in the future', () => {
    const item = { ...createSpacedRepetitionItem('x'), dueDate: '2099-01-01' }
    expect(isItemDueToday(item)).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to confirm they all fail**

Run: `npx vitest run tests/spacedRepetition.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `frontend/src/lib/spacedRepetition.ts`**:

```typescript
import type { SpacedRepetitionItem } from '@/db'

export function scoreToQuality(score: number): number {
  // Input is clamped to 100 because sources like Azure TTS can return floats slightly above 100.
  // ISO date strings 'YYYY-MM-DD' sort lexicographically == chronologically, making string
  // comparison safe for dueDate range queries in IDB.
  return Math.min(5, Math.floor(Math.min(score, 100) / 20))
}

export function createSpacedRepetitionItem(itemId: string): SpacedRepetitionItem {
  const today = new Date().toISOString().split('T')[0]
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
): SpacedRepetitionItem {
  const quality = scoreToQuality(performanceScore)
  const today = new Date().toISOString().split('T')[0]

  let { repetitions, intervalDays, easinessFactor, consecutiveCorrect, consecutiveIncorrect, masteryLevel } = item

  if (quality >= 3) {
    repetitions += 1
    consecutiveCorrect += 1
    consecutiveIncorrect = 0
    if (repetitions === 1) intervalDays = 1
    else if (repetitions === 2) intervalDays = 6
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
    consecutiveCorrect = 0   // reset counter so each level-up requires another 5 consecutive
  }
  else if (consecutiveIncorrect >= 3) {
    masteryLevel = Math.max(0, masteryLevel - 1)
  }

  const dueDate = new Date()
  dueDate.setDate(dueDate.getDate() + intervalDays)

  return {
    ...item,
    repetitions,
    intervalDays,
    easinessFactor,
    consecutiveCorrect,
    consecutiveIncorrect,
    masteryLevel,
    dueDate: dueDate.toISOString().split('T')[0],
    lastReviewed: today,
    reviewHistory: [
      ...item.reviewHistory,
      { date: today, quality, intervalDays },
    ],
  }
}

export function isItemDueToday(item: SpacedRepetitionItem): boolean {
  const today = new Date().toISOString().split('T')[0]
  return item.dueDate <= today
}
```

- [ ] **Step 4: Run tests to confirm they all pass**

Run: `npx vitest run tests/spacedRepetition.test.ts`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/spacedRepetition.ts frontend/tests/spacedRepetition.test.ts
git commit -m "feat(lib): implement SM-2 spaced repetition algorithm with full test coverage"
```

---

## Task 3: `useTracking` Hook

**Files:**
- Create: `frontend/src/hooks/useTracking.ts`
- Create: `frontend/tests/useTracking.test.ts`

### Design

The hook calls `useAuth()` for `db`. It exposes one function: `logExerciseResult(...)`. Internally:
1. **Upsert SM-2 item** — get existing or create default, then apply `updateSpacedRepetition`
2. **Update `progress-db`** — read-modify-write; initialize if missing; cap `accuracyTrend` at 90 entries
3. **Update `mastery-db`** — read-modify-write; initialize if missing
4. **Log mistakes** — append to `mistakes-db` if `mistakes` provided; keep last 10 examples per pattern

**Exercise → skill mapping:**

| Exercise type | Skill |
|--------------|-------|
| `dictation` | `listening` |
| `romanization-recall` | `speaking` |
| `reconstruction` | `reading` |
| `writing` | `writing` |
| `pronunciation` | `speaking` |
| `cloze` | `vocabulary` |
| `translation` | `writing` |

**Return value:** `{ logExerciseResult, getDueItemCount }`

- `logExerciseResult` returns `Promise<SpacedRepetitionItem>` (the updated item, used by SessionSummary to show "Next review in N days")
- `getDueItemCount` returns `Promise<number>` (for ReviewQueueBanner)

- [ ] **Step 1: Write failing tests** in `frontend/tests/useTracking.test.ts`:

```typescript
import { IDBFactory } from 'fake-indexeddb'
import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import 'fake-indexeddb/auto'
import { initDB } from '../src/db'
import { useTracking } from '../src/hooks/useTracking'

// Mock useAuth to return our test db
vi.mock('../src/contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}))
import { useAuth } from '../src/contexts/AuthContext'

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
    expect(updated.itemId).toBe('entry-1')
    expect(updated.repetitions).toBe(1)
    expect(updated.intervalDays).toBe(1)
  })

  it('updates an existing SM-2 item on subsequent calls', async () => {
    const { result } = renderHook(() => useTracking())
    await result.current.logExerciseResult({ vocabEntry: mockVocabEntry, exerciseType: 'dictation', score: 100 })
    const second = await result.current.logExerciseResult({ vocabEntry: mockVocabEntry, exerciseType: 'dictation', score: 100 })
    expect(second.repetitions).toBe(2)
    expect(second.intervalDays).toBe(6)
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
})
```

**Note on `mistakes` tracking:** The `mistakes-db` path is tested above as a unit test of the code path in isolation. In practice, the current exercise `onNext(score)` signature does not carry mistake data upward — exercises only report a numeric score. The `mistakes` parameter will not be populated by `StudySession` in Tasks 5–6. This is acceptable for this implementation; mistake detail collection can be added in a future pass by extending `onNext` or using a separate callback. The `mistakes-db` store and code path remain in place and ready to use.

- [ ] **Step 2: Run tests to confirm they fail**

Run: `npx vitest run tests/useTracking.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Create `frontend/src/hooks/useTracking.ts`**:

```typescript
import type { ExerciseMode } from '@/components/study/ModePicker'
import type { MistakeExample, SpacedRepetitionItem } from '@/db'
import type { VocabEntry } from '@/types'
import {
  getErrorPattern,
  getMasteryData,
  getProgressStats,
  getSpacedRepetitionItem,
  saveErrorPattern,
  saveMasteryData,
  saveProgressStats,
  saveSpacedRepetitionItem,
  getDueItems,
} from '@/db'
import { useAuth } from '@/contexts/AuthContext'
import { createSpacedRepetitionItem, updateSpacedRepetition } from '@/lib/spacedRepetition'

type Skill = 'writing' | 'speaking' | 'vocabulary' | 'reading' | 'listening'
type ExerciseType = Exclude<ExerciseMode, 'mixed'>

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
    totalSessions: 0, totalExercises: 0, totalCorrect: 0,
    totalIncorrect: 0, accuracyRate: 0, totalStudyMinutes: 0,
    accuracyTrend: [],
    skillProgress: {
      writing: { ...defaultSkill }, speaking: { ...defaultSkill },
      vocabulary: { ...defaultSkill }, reading: { ...defaultSkill },
      listening: { ...defaultSkill },
    },
  }
}

function defaultMasteryData() {
  const s = { masteryLevel: 0, confidenceScore: 0, totalPracticeTime: 0, lastPracticed: null }
  return { writing: { ...s }, speaking: { ...s }, vocabulary: { ...s }, reading: { ...s }, listening: { ...s } }
}

export function useTracking() {
  const { db } = useAuth()

  async function logExerciseResult({
    vocabEntry,
    exerciseType,
    score,
    mistakes,
  }: {
    vocabEntry: VocabEntry
    exerciseType: ExerciseType
    score: number
    mistakes?: MistakeExample[]
  }): Promise<SpacedRepetitionItem | null> {
    if (!db) return null

    const today = new Date().toISOString().split('T')[0]
    const isCorrect = score >= 60

    // 1. Upsert SM-2 item
    const existing = await getSpacedRepetitionItem(db, vocabEntry.id)
    const item = existing ?? createSpacedRepetitionItem(vocabEntry.id)
    const updated = updateSpacedRepetition(item, score)
    await saveSpacedRepetitionItem(db, updated)

    // 2. Update progress-db
    const skill = EXERCISE_TO_SKILL[exerciseType]
    const progress = (await getProgressStats(db)) ?? defaultProgressStats()
    progress.totalExercises += 1
    if (isCorrect) progress.totalCorrect += 1
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
      if (progress.accuracyTrend.length > 90) progress.accuracyTrend.shift()
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

  async function getDueItemCount(): Promise<number> {
    if (!db) return 0
    const today = new Date().toISOString().split('T')[0]
    const items = await getDueItems(db, today)
    return items.length
  }

  return { logExerciseResult, getDueItemCount }
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/useTracking.test.ts`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/useTracking.ts frontend/tests/useTracking.test.ts
git commit -m "feat(hooks): add useTracking hook with SM-2 upsert, progress, mastery, and mistakes writes"
```

---

## Task 4: Update Exercise `onNext` Signatures

**Files:** All 7 exercise components in `frontend/src/components/study/exercises/`

The prop type changes from `onNext: (correct: boolean) => void` to `onNext: (score: number) => void` everywhere. Binary scores: correct first-try = `100`, skip/wrong = `0`. Exercises that already surface numeric scores pass them through directly.

- [ ] **Step 1: Update `RomanizationRecallExercise.tsx`**

Change interface: `onNext: (score: number) => void`

```diff
- <Button variant="ghost" size="sm" onClick={() => onNext(false)}>Skip</Button>
+ <Button variant="ghost" size="sm" onClick={() => onNext(0)}>Skip</Button>
```
```diff
- : <Button size="sm" onClick={() => onNext(correct)}>Next →</Button>}
+ : <Button size="sm" onClick={() => onNext(correct ? 100 : 0)}>Next →</Button>}
```

- [ ] **Step 2: Update `DictationExercise.tsx`**

Change interface: `onNext: (score: number) => void`

```diff
- <Button variant="ghost" size="sm" onClick={() => onNext(false)}>Skip</Button>
+ <Button variant="ghost" size="sm" onClick={() => onNext(0)}>Skip</Button>
```
```diff
- : <Button size="sm" onClick={() => onNext(correct)}>Next →</Button>}
+ : <Button size="sm" onClick={() => onNext(correct ? 100 : 0)}>Next →</Button>}
```

- [ ] **Step 3: Update `ClozeExercise.tsx`**

Change interface: `onNext: (score: number) => void`

```diff
- <Button variant="ghost" size="sm" onClick={() => onNext(false)}>Skip</Button>
+ <Button variant="ghost" size="sm" onClick={() => onNext(0)}>Skip</Button>
```
```diff
- : <Button size="sm" onClick={() => onNext(allCorrect)}>Next →</Button>}
+ : <Button size="sm" onClick={() => onNext(allCorrect ? 100 : 0)}>Next →</Button>}
```

- [ ] **Step 4: Update `ReconstructionExercise.tsx`**

Change interface: `onNext: (score: number) => void`

```diff
- <Button variant="ghost" size="sm" onClick={() => onNext(false)}>Skip</Button>
+ <Button variant="ghost" size="sm" onClick={() => onNext(0)}>Skip</Button>
```
```diff
- : <Button size="sm" onClick={() => onNext(correct)}>Next →</Button>}
+ : <Button size="sm" onClick={() => onNext(correct ? 100 : 0)}>Next →</Button>}
```

- [ ] **Step 5: Update `CharacterWritingExercise.tsx`**

Change interface: `onNext: (score: number) => void`

This exercise already tracks hint usage via `anyHintUsedRef`. Mapping: no hints used = 100, hints used = 80, skip = 0.

```diff
- <Button variant="ghost" size="sm" onClick={() => onNext(false)}>Skip</Button>
+ <Button variant="ghost" size="sm" onClick={() => onNext(0)}>Skip</Button>
```

In `advance()`:
```diff
- setTimeout(onNext, 0, !anyHintUsedRef.current)
+ setTimeout(onNext, 0, anyHintUsedRef.current ? 80 : 100)
```

- [ ] **Step 6: Update `PronunciationReferee.tsx`**

Change interface: `onNext: (score: number) => void`

This exercise has `result.overall.accuracy` (0-100 numeric).

```diff
- <Button variant="ghost" size="sm" onClick={() => onNext(false)}>Skip</Button>
+ <Button variant="ghost" size="sm" onClick={() => onNext(0)}>Skip</Button>
```
```diff
- onClick={() => onNext(result.overall.accuracy >= 70)}
+ onClick={() => onNext(Math.round(result.overall.accuracy))}
```

- [ ] **Step 7: Update `TranslationExercise.tsx`**

Change interface: `onNext: (score: number) => void`

```diff
- onNext: (correct: boolean) => void
+ onNext: (score: number) => void
```

In the error fallback inside `handleSubmit`:
```diff
- onNext(false)
+ onNext(0)
```

On the "Next →" button in the result view:
```diff
- const passed = result.overall_score >= 60
- ...
- onClick={() => onNext(passed)}
+ onClick={() => onNext(result.overall_score)}
```

Also update the skip button:
```diff
- onClick={() => onNext(false)}
+ onClick={() => onNext(0)}
```

- [ ] **Step 8: Run existing tests to confirm nothing is broken**

Run: `npx vitest run tests/ReconstructionExercise.test.ts`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add frontend/src/components/study/exercises/
git commit -m "feat(exercises): change onNext signature from boolean to numeric score (0–100)"
```

---

## Task 5: Update `StudySession.tsx`

**Files:**
- Modify: `frontend/src/components/study/StudySession.tsx`

Changes:
1. `results` state: `{ entry: VocabEntry, correct: boolean }[]` → `{ entry: VocabEntry, score: number }[]`
2. `handleNext(correct: boolean)` → `handleNext(score: number)`, calls `logExerciseResult` (fire-and-forget)
3. Auto-skip: `handleNext(false)` → `handleNext(0)`
4. Accept optional `preloadedEntries?: VocabEntry[]` prop for SM-2 review sessions
5. Pass `studiedEntryIds` to `SessionSummary`

- [ ] **Step 1: Add `useTracking` import, `preloadedEntries` prop, and `smItems` state**

```typescript
import type { SpacedRepetitionItem } from '@/db'
import { useTracking } from '@/hooks/useTracking'

interface StudySessionProps {
  lessonId: string
  onClose: () => void
  preloadedEntries?: VocabEntry[]  // if provided, skips lessonId lookup
}
```

Inside the component:
```typescript
const { logExerciseResult } = useTracking()
const entries = props.preloadedEntries ?? (entriesByLesson[lessonId] ?? [])
const lessonTitle = props.preloadedEntries
  ? 'Spaced Repetition Review'
  : (entries[0]?.sourceLessonTitle ?? 'Unknown Lesson')

// Collect SM-2 items to pass to SessionSummary (no re-fetch needed there)
const [smItems, setSMItems] = useState<SpacedRepetitionItem[]>([])
```

Also add `setSMItems([])` to the reset block inside `handleStart`, alongside the existing `setResults([])` and `setCurrent(0)`:

```typescript
// Inside handleStart, before setPhase('session'):
setQuestions(qs)
setCurrent(0)
setResults([])
setSMItems([])   // ← reset SM-2 items so second sessions don't carry over stale data
setPhase('session')
```

- [ ] **Step 2: Update `results` state type and make `handleNext` async**

```diff
- const [results, setResults] = useState<{ entry: VocabEntry, correct: boolean }[]>([])
+ const [results, setResults] = useState<{ entry: VocabEntry, score: number }[]>([])
```

`handleNext` is async so it can await tracking before advancing phase. `setResults` is called before the first `await`, keeping the result recording immediate. `setCurrent` and `setPhase` fire after the IDB write resolves (~1ms later), which is imperceptible. This eliminates the race condition where `SessionSummary` would read IDB before the last write completed.

```typescript
async function handleNext(score: number) {
  const q = questions[current]
  setResults(r => [...r, { entry: q.entry, score }])
  const smItem = await logExerciseResult({
    vocabEntry: q.entry,
    exerciseType: q.type,
    score,
  })
  if (smItem) setSMItems(items => [...items, smItem])
  if (current + 1 >= questions.length) {
    setPhase('summary')
  }
  else {
    setCurrent(c => c + 1)
  }
}
```

- [ ] **Step 3: Fix auto-skip call**

The auto-skip is in the setState-during-render guard pattern (approved by CLAUDE.md). It calls `void handleNext(0)` — the `void` discards the returned Promise, which is correct here since the render guard already prevents double-calls via `setLastAutoSkipCheck`.

```diff
- if (q.type === 'writing' && !isWritingSupported(q.entry.word))
-   handleNext(false)
+ if (q.type === 'writing' && !isWritingSupported(q.entry.word))
+   void handleNext(0)
```

- [ ] **Step 4: Pass `smItems` to `SessionSummary`**

```diff
  <SessionSummary
    results={results}
+   smItems={smItems}
    onStudyAgain={() => setPhase('picker')}
    onBack={onClose}
  />
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/study/StudySession.tsx
git commit -m "feat(study): integrate useTracking in StudySession, switch results to numeric scores"
```

---

## Task 6: Update `SessionSummary.tsx`

**Files:**
- Modify: `frontend/src/components/study/SessionSummary.tsx`

Changes:
1. `correct: boolean` → `score: number` in the `Result` type
2. Compute correct as `score >= 60`
3. Add an optional SM-2 next-review section using `useTracking` to load updated items from IDB

- [ ] **Step 1: Update props — receive `smItems` from `StudySession` instead of fetching from IDB**

`SessionSummary` receives the already-computed `SpacedRepetitionItem[]` from `StudySession`, which collected them during the session. No IDB read, no `useEffect`, no async — pure derivation from props.

```typescript
import type { SpacedRepetitionItem } from '@/db'
import type { VocabEntry } from '@/types'

interface Result { entry: VocabEntry, score: number }

interface Props {
  results: Result[]
  smItems?: SpacedRepetitionItem[]
  onStudyAgain: () => void
  onBack: () => void
}

export function SessionSummary({ results, smItems = [], onStudyAgain, onBack }: Props) {
  const correctCount = results.filter(r => r.score >= 60).length
  const wrong = results.filter(r => r.score < 60).map(r => r.entry)

  // Derive next-review display from smItems prop — no async, no IDB access needed
  const nextReviews = results
    .map(r => {
      const item = smItems.find(i => i.itemId === r.entry.id)
      return item ? { word: r.entry.word, days: item.intervalDays } : null
    })
    .filter((x): x is { word: string, days: number } => x !== null)

  // ... rest of render
}
```

- [ ] **Step 2: Add SM-2 review intervals section** before the action buttons:

```tsx
{nextReviews.length > 0 && (
  <div className="rounded-md border border-border/50 bg-muted/20 px-4 py-3 mb-4 text-left">
    <p className="text-sm font-semibold tracking-widest text-muted-foreground uppercase mb-2">Next reviews</p>
    {nextReviews.slice(0, 5).map(({ word, days }) => (
      <div key={word} className="flex items-center justify-between text-sm py-0.5">
        <span className="font-bold">{word}</span>
        <span className="text-muted-foreground">
          {days === 1 ? 'Tomorrow' : `In ${days} days`}
        </span>
      </div>
    ))}
  </div>
)}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/study/SessionSummary.tsx
git commit -m "feat(study): show SM-2 next-review intervals in SessionSummary"
```

---

## Task 7: Progress Dashboard

**Files:**
- Create: `frontend/src/pages/ProgressDashboardPage.tsx`
- Create: `frontend/src/components/progress/OverallStatsPanel.tsx`
- Create: `frontend/src/components/progress/AccuracyTrendChart.tsx`
- Create: `frontend/src/components/progress/SkillMasteryGrid.tsx`
- Create: `frontend/src/components/progress/MistakesPanel.tsx`

No charting library needed — the accuracy trend uses CSS bar chart (divs with `height` proportional to accuracy).

- [ ] **Step 1: Create `OverallStatsPanel.tsx`**

```tsx
import type { ProgressStats } from '@/db'

export function OverallStatsPanel({ stats }: { stats: ProgressStats }) {
  const accuracy = stats.totalExercises > 0
    ? Math.round(stats.accuracyRate * 100)
    : 0
  return (
    <div className="grid grid-cols-3 gap-3">
      {[
        { label: 'Sessions', value: stats.totalSessions },
        { label: 'Accuracy', value: `${accuracy}%` },
        { label: 'Minutes', value: Math.round(stats.totalStudyMinutes) },
      ].map(({ label, value }) => (
        <div key={label} className="rounded-lg border border-border bg-card p-4 text-center">
          <div className="text-2xl font-bold tabular-nums">{value}</div>
          <div className="text-sm text-muted-foreground uppercase tracking-widest mt-1">{label}</div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Create `AccuracyTrendChart.tsx`** (CSS-only, last 30 days)

```tsx
import type { DailyAccuracy } from '@/db'
import { cn } from '@/lib/utils'

export function AccuracyTrendChart({ trend }: { trend: DailyAccuracy[] }) {
  const recent = trend.slice(-30)
  if (recent.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-8">No data yet — complete some exercises to see your trend.</p>
  }
  return (
    <div>
      <p className="text-sm font-semibold tracking-widest text-muted-foreground uppercase mb-3">Accuracy trend (last 30 days)</p>
      <div className="flex items-end gap-1 h-24">
        {recent.map(({ date, accuracy }) => (
          <div
            key={date}
            title={`${date}: ${Math.round(accuracy * 100)}%`}
            className={cn(
              'flex-1 rounded-sm min-h-[4px] transition-all',
              accuracy >= 0.8 ? 'bg-emerald-500' : accuracy >= 0.6 ? 'bg-amber-500' : 'bg-rose-500',
            )}
            style={{ height: `${Math.max(4, accuracy * 96)}px` }}
          />
        ))}
      </div>
      <div className="flex justify-between mt-1">
        <span className="text-[10px] text-muted-foreground">{recent[0]?.date}</span>
        <span className="text-[10px] text-muted-foreground">{recent.at(-1)?.date}</span>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create `SkillMasteryGrid.tsx`**

```tsx
import type { MasteryData } from '@/db'

const SKILL_LABELS: Record<string, string> = {
  writing: 'Writing', speaking: 'Speaking', vocabulary: 'Vocabulary',
  reading: 'Reading', listening: 'Listening',
}

function Stars({ level }: { level: number }) {
  return (
    <span>
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} className={i < level ? 'text-amber-400' : 'text-muted-foreground/30'}>★</span>
      ))}
    </span>
  )
}

export function SkillMasteryGrid({ mastery }: { mastery: MasteryData }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold tracking-widest text-muted-foreground uppercase mb-3">Skill mastery</p>
      {(Object.keys(SKILL_LABELS) as Array<keyof MasteryData>).map(skill => (
        <div key={skill} className="flex items-center justify-between rounded-lg border border-border/50 bg-card px-4 py-2.5">
          <span className="text-sm font-medium">{SKILL_LABELS[skill]}</span>
          <Stars level={mastery[skill].masteryLevel} />
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Create `MistakesPanel.tsx`**

```tsx
import type { ErrorPattern } from '@/db'

export function MistakesPanel({ patterns }: { patterns: ErrorPattern[] }) {
  if (patterns.length === 0)
    return <p className="text-sm text-muted-foreground text-center py-6">No mistakes recorded yet.</p>

  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold tracking-widest text-muted-foreground uppercase mb-3">Recent mistakes</p>
      {patterns.map(p => (
        <div key={p.patternId} className="flex items-center justify-between rounded-lg border border-border/50 bg-card px-4 py-2.5 text-sm">
          <div>
            <span className="font-bold">{p.examples.at(-1)?.correctAnswer ?? p.patternId}</span>
            {p.examples.at(-1)?.userAnswer && (
              <span className="text-muted-foreground ml-2 text-sm">you wrote: {p.examples.at(-1)?.userAnswer}</span>
            )}
          </div>
          <span className="text-sm text-muted-foreground tabular-nums">{p.frequency}×</span>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 5: Create `ProgressDashboardPage.tsx`**

`useEffect` with a `.then()` callback is used for async IDB data loading. The `react-hooks-extra/no-direct-set-state-in-use-effect` ESLint rule flags only *synchronous* `setState` calls in the effect body, not calls inside `.then()` callbacks — so this pattern is compliant. A single atomic state object avoids multiple re-renders:

```tsx
import { useEffect, useState } from 'react'
import { Layout } from '@/components/Layout'
import { AccuracyTrendChart } from '@/components/progress/AccuracyTrendChart'
import { MistakesPanel } from '@/components/progress/MistakesPanel'
import { OverallStatsPanel } from '@/components/progress/OverallStatsPanel'
import { ReviewQueueBanner } from '@/components/progress/ReviewQueueBanner'
import { SkillMasteryGrid } from '@/components/progress/SkillMasteryGrid'
import { useAuth } from '@/contexts/AuthContext'
import type { ErrorPattern, MasteryData, ProgressStats } from '@/db'
import { getMasteryData, getProgressStats, getRecentMistakes } from '@/db'

interface PageData {
  stats: ProgressStats | null
  mastery: MasteryData | null
  mistakes: ErrorPattern[]
}

export function ProgressDashboardPage() {
  const { db } = useAuth()
  const [data, setData] = useState<PageData | null>(null)

  useEffect(() => {
    if (!db) return
    Promise.all([
      getProgressStats(db),
      getMasteryData(db),
      getRecentMistakes(db, 10),
    ]).then(([stats, mastery, mistakes]) =>
      // Single atomic state update — one re-render
      setData({ stats: stats ?? null, mastery: mastery ?? null, mistakes })
    )
  }, [db])

  const { stats, mastery, mistakes } = data ?? { stats: null, mastery: null, mistakes: [] }

  return (
    <Layout>
      <div className="max-w-2xl mx-auto px-6 py-8 space-y-8">
        <h1 className="text-2xl font-bold tracking-tight">Progress</h1>
        <ReviewQueueBanner />
        {stats
          ? <OverallStatsPanel stats={stats} />
          : <p className="text-sm text-muted-foreground">No study sessions yet. Start an exercise to track progress.</p>}
        {stats && <AccuracyTrendChart trend={stats.accuracyTrend} />}
        {mastery && <SkillMasteryGrid mastery={mastery} />}
        <MistakesPanel patterns={mistakes} />
      </div>
    </Layout>
  )
}
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/ProgressDashboardPage.tsx frontend/src/components/progress/
git commit -m "feat(progress): add Progress Dashboard page with stats, trend chart, mastery, and mistakes panels"
```

---

## Task 8: Review Queue Banner + Review Session Page

**Files:**
- Create: `frontend/src/components/progress/ReviewQueueBanner.tsx`
- Create: `frontend/src/pages/ReviewSessionPage.tsx`

The banner reads due SM-2 items. Clicking "Start Review" navigates to `/progress/review` which fetches the corresponding `VocabEntry` objects and renders `StudySession` with `preloadedEntries`.

- [ ] **Step 1: Create `ReviewQueueBanner.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/contexts/AuthContext'
import { getDueItems } from '@/db'

export function ReviewQueueBanner() {
  const { db } = useAuth()
  const navigate = useNavigate()
  const [dueCount, setDueCount] = useState<number | null>(null)

  useEffect(() => {
    if (!db) return
    const today = new Date().toISOString().split('T')[0]
    getDueItems(db, today).then(items => setDueCount(items.length))
  }, [db])

  if (!dueCount) return null

  return (
    <div className="flex items-center justify-between rounded-lg border border-amber-500/25 bg-amber-500/8 px-4 py-3">
      <div>
        <p className="text-sm font-semibold text-amber-400">{dueCount} item{dueCount !== 1 ? 's' : ''} due for review today</p>
        <p className="text-sm text-muted-foreground mt-0.5">Keep your streak going</p>
      </div>
      <Button size="sm" onClick={() => navigate('/progress/review')}>
        Start Review
      </Button>
    </div>
  )
}
```

- [ ] **Step 2: Create `ReviewSessionPage.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { StudySession } from '@/components/study/StudySession'
import { useAuth } from '@/contexts/AuthContext'
import type { VocabEntry } from '@/types'
import { getDueItems, getVocabEntryById } from '@/db'

export function ReviewSessionPage() {
  const { db } = useAuth()
  const navigate = useNavigate()
  const [entries, setEntries] = useState<VocabEntry[] | null>(null)

  useEffect(() => {
    if (!db) return
    const today = new Date().toISOString().split('T')[0]
    getDueItems(db, today).then(async (items) => {
      const resolved = await Promise.all(items.map(item => getVocabEntryById(db, item.itemId)))
      setEntries(resolved.filter((e): e is VocabEntry => e !== undefined))
    })
  }, [db])

  if (entries === null)
    return <div className="flex h-screen items-center justify-center text-muted-foreground text-sm">Loading review queue…</div>

  if (entries.length === 0)
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4">
        <p className="text-lg font-semibold">No items due today</p>
        <p className="text-sm text-muted-foreground">Check back tomorrow or study a lesson to add items.</p>
        <button onClick={() => navigate('/progress')} className="text-sm underline text-muted-foreground">
          Back to Progress
        </button>
      </div>
    )

  // lessonId="review" is a sentinel that will never match entriesByLesson because no lesson
  // has id "review". The preloadedEntries prop short-circuits that lookup entirely.
  // StudySession shows "Spaced Repetition Review" as the title when preloadedEntries is set.
  return (
    <StudySession
      lessonId="review"
      preloadedEntries={entries}
      onClose={() => navigate('/progress')}
    />
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/progress/ReviewQueueBanner.tsx frontend/src/pages/ReviewSessionPage.tsx
git commit -m "feat(progress): add ReviewQueueBanner and ReviewSessionPage for SM-2 daily review"
```

---

## Task 9: Routing + Navigation

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/Layout.tsx`

- [ ] **Step 1: Add routes in `App.tsx`**

Import the new pages and add routes. The `/progress/review` route must come **before** any wildcard routes:

```diff
+ import { ProgressDashboardPage } from '@/pages/ProgressDashboardPage'
+ import { ReviewSessionPage } from '@/pages/ReviewSessionPage'
```

```diff
  <Route path="/vocabulary/:lessonId/study" element={<StudySessionPage />} />
+ <Route path="/progress" element={<ProgressDashboardPage />} />
+ <Route path="/progress/review" element={<ReviewSessionPage />} />
```

- [ ] **Step 2: Add "Progress" link in `Layout.tsx`**

After the "Workbook" button:

```diff
  <Button
    variant={location.pathname.startsWith('/vocabulary') ? 'default' : 'outline'}
    size="sm"
    render={<Link to="/vocabulary" />}
  >
    Workbook
  </Button>
+ <Button
+   variant={location.pathname.startsWith('/progress') ? 'default' : 'outline'}
+   size="sm"
+   render={<Link to="/progress" />}
+ >
+   Progress
+ </Button>
```

- [ ] **Step 3: Run full test suite**

Run: `npx vitest run`
Expected: all tests PASS

- [ ] **Step 4: Commit**

```bash
git add frontend/src/App.tsx frontend/src/components/Layout.tsx
git commit -m "feat(routing): add /progress and /progress/review routes, add Progress nav link"
```

---

## Verification Plan

### Automated
- `npx vitest run tests/spacedRepetition.test.ts` — SM-2 algorithm tests (all pass)
- `npx vitest run tests/useTracking.test.ts` — tracking hook integration tests (all pass)
- `npx vitest run` — full suite (no regressions)

### Manual

1. Open the app. Navigate to a lesson and start a study session.
2. Complete 3+ exercises with high scores.
3. Open Chrome DevTools → Application → IndexedDB → `shadowlearn`.
4. Confirm:
   - `spaced-repetition` store has entries with `itemId` = vocab entry IDs
   - `dueDate` is set to tomorrow or later on correct items
   - `progress-db → global` shows updated `totalExercises`, `accuracyRate`, `accuracyTrend`
5. Finish the session. On `SessionSummary`, confirm "Next reviews" section shows the correct words and intervals.
6. Navigate to `/progress`. Confirm:
   - `ReviewQueueBanner` shows the correct due-item count (0 if all were just studied)
   - `OverallStatsPanel` reflects the session just completed
   - `AccuracyTrendChart` shows today's bar
   - `SkillMasteryGrid` shows updated stars for the practiced skills
7. Complete the same vocab items poorly (score < 60). Verify in DevTools that `intervalDays` resets to 1.
8. Manually set a `dueDate` in DevTools to today, then navigate to `/progress/review`. Confirm the review session loads those items.
