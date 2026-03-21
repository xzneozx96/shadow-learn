# Fix Progress Tracking Data Integrity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three root causes that corrupt progress tracking data: skips counted as failures, auto-skips counted as failures, and mistakes never reaching `mistakes-db`.

**Architecture:** The fix is a two-layer change. First, `handleNext` in `StudySession.tsx` gains an `opts` parameter that exercises use to signal a skip or pass mistake examples. Second, exercises that already compute diff data (Dictation, RomanizationRecall, Reconstruction, Cloze) construct and pass `MistakeExample[]` on wrong answers. TranslationExercise's API-failure path is changed from `onNext(0)` to `onNext(0, { skipped: true })`. No changes to `useTracking.ts` or `spacedRepetition.ts` — the mistake-logging pipeline already works; it just never receives data.

**Tech Stack:** React 19, TypeScript, Vitest, `fake-indexeddb`

**Known limitation:** ClozeExercise generates blanks for multiple vocab words, but `logExerciseResult` attributes all mistakes to `q.entry` (the single entry that generated the question). A wrong blank for word "去" may be stored under a different entry's `patternId`. This is a pre-existing API design limitation — fixing it would require changing `logExerciseResult` to accept per-mistake entry IDs, which is out of scope for this plan.

---

## Files

| Action | File |
|---|---|
| Modify | `frontend/src/components/study/StudySession.tsx` |
| Modify | `frontend/src/components/study/exercises/DictationExercise.tsx` |
| Modify | `frontend/src/components/study/exercises/RomanizationRecallExercise.tsx` |
| Modify | `frontend/src/components/study/exercises/ReconstructionExercise.tsx` |
| Modify | `frontend/src/components/study/exercises/ClozeExercise.tsx` |
| Modify | `frontend/src/components/study/exercises/TranslationExercise.tsx` |
| Modify | `frontend/src/components/study/exercises/CharacterWritingExercise.tsx` |
| Modify | `frontend/src/components/study/exercises/PronunciationReferee.tsx` |
| Modify | `frontend/tests/useTracking.test.ts` |

---

## Shared type: `ExerciseNextOpts`

Every exercise's `onNext` prop and `StudySession.handleNext` will use this shape:

```ts
{ skipped?: boolean, mistakes?: MistakeExample[] }
```

`MistakeExample` is already exported from `@/db`. The type is set once in Task 1 (orchestrator) and Task 2 (all exercises) — no double-editing later.

---

## Task 1 — Extend `handleNext` to support skip and mistakes

**Context:** `StudySession.handleNext` is the single entry point for all exercise completions. Currently `handleNext(score: 0)` is indistinguishable from a skip. Auto-skip for unsupported writing characters also calls `handleNext(0)`, polluting skill accuracy. The fix adds an `opts` object that exercises use to signal skip intent or pass mistake data.

**Files:**
- Modify: `frontend/src/components/study/StudySession.tsx`

- [ ] **Step 1: Add import for `MistakeExample`**

At the top of `StudySession.tsx`, add:

```ts
import type { MistakeExample } from '@/db'
```

- [ ] **Step 2: Change `handleNext` signature and body**

Replace the existing `handleNext` function (lines 208-221) with:

```ts
function handleNext(score: number, opts?: { skipped?: boolean, mistakes?: MistakeExample[] }) {
  const q = questions[current]
  if (q && !opts?.skipped) {
    void logExerciseResult({ vocabEntry: q.entry, score, exerciseType: q.type, mistakes: opts?.mistakes })
    setResults(r => [...r, { entry: q.entry, score, correct: score >= 60 }])
  }

  if (current + 1 >= questions.length) {
    setPhase('summary')
  }
  else {
    setCurrent(c => c + 1)
  }
}
```

- [ ] **Step 3: Fix auto-skip for unsupported writing characters**

Replace line 231:

```ts
// Before:
if (q.type === 'writing' && !isWritingSupported(q.entry.word))
  handleNext(0)

// After:
if (q.type === 'writing' && !isWritingSupported(q.entry.word))
  handleNext(0, { skipped: true })
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: No errors (the `opts` param is optional and backward-compatible).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/study/StudySession.tsx
git commit -m "fix(tracking): skip/auto-skip no longer counted as failures in DB"
```

---

## Task 2 — Update all exercise Skip buttons and set final `onNext` type

**Context:** All 7 exercise components have a Skip button that calls `onNext(0)`. Each must pass `{ skipped: true }` — otherwise a skip still results in a DB write. The `onNext` prop type is set to its **final form** here (including `mistakes?`) so that Tasks 3-4 don't need to re-edit the `Props` interface.

**Files:**
- Modify: `frontend/src/components/study/exercises/DictationExercise.tsx`
- Modify: `frontend/src/components/study/exercises/RomanizationRecallExercise.tsx`
- Modify: `frontend/src/components/study/exercises/ReconstructionExercise.tsx`
- Modify: `frontend/src/components/study/exercises/ClozeExercise.tsx`
- Modify: `frontend/src/components/study/exercises/TranslationExercise.tsx`
- Modify: `frontend/src/components/study/exercises/CharacterWritingExercise.tsx`
- Modify: `frontend/src/components/study/exercises/PronunciationReferee.tsx`

- [ ] **Step 1: Update `onNext` prop type in each exercise**

**In the 4 exercises that will later wire mistakes** (DictationExercise, RomanizationRecallExercise, ReconstructionExercise, ClozeExercise):

1. Add import: `import type { MistakeExample } from '@/db'`
2. Change `Props.onNext` to:
```ts
onNext: (score: number, opts?: { skipped?: boolean, mistakes?: MistakeExample[] }) => void
```

**In the 3 exercises that only need skip** (CharacterWritingExercise, PronunciationReferee, TranslationExercise):

Change `Props.onNext` to:
```ts
onNext: (score: number, opts?: { skipped?: boolean }) => void
```

(No `MistakeExample` import needed — TypeScript structural typing means `handleNext`'s wider type is assignable.)

- [ ] **Step 2: Update Skip button `onClick` in each exercise**

In each exercise, change every Skip-action `onClick={() => onNext(0)}` to:

```ts
onClick={() => onNext(0, { skipped: true })}
```

Locations:
- `DictationExercise.tsx` line 29
- `RomanizationRecallExercise.tsx` line 36
- `ReconstructionExercise.tsx` line 27
- `ClozeExercise.tsx` line 58
- `TranslationExercise.tsx` line 236
- `CharacterWritingExercise.tsx` line 55
- `PronunciationReferee.tsx` line 69

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Run full test suite**

```bash
cd frontend && npx vitest run
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/study/exercises/
git commit -m "fix(tracking): all exercise skip buttons pass { skipped: true }"
```

---

## Task 3 — Wire mistakes from DictationExercise and RomanizationRecallExercise

**Context:** Both exercises already compute a diff (`computeCharDiff` / `computePinyinDiff`) and an accuracy score. When the score is < 100, one `MistakeExample` capturing the user's answer and the correct answer is passed. One example per exercise attempt (not one per wrong character) keeps the data clean. The `Props.onNext` type and `MistakeExample` import are already in place from Task 2.

**Files:**
- Modify: `frontend/src/components/study/exercises/DictationExercise.tsx`
- Modify: `frontend/src/components/study/exercises/RomanizationRecallExercise.tsx`

- [ ] **Step 1: Update `DictationExercise` "Next →" button**

Change the "Next →" button's `onClick` (currently `onClick={() => onNext(accuracyScore)}`, line ~32):

```tsx
onClick={() => {
  const today = new Date().toISOString().split('T')[0]
  const mistakes: MistakeExample[] = accuracyScore < 100
    ? [{ userAnswer: value.trim(), correctAnswer: expected.trim(), date: today }]
    : []
  onNext(accuracyScore, { mistakes: mistakes.length > 0 ? mistakes : undefined })
}}
```

- [ ] **Step 2: Update `RomanizationRecallExercise` "Next →" button**

Change the "Next →" button's `onClick` (currently `onClick={() => onNext(accuracyScore)}`, line ~39):

```tsx
onClick={() => {
  const today = new Date().toISOString().split('T')[0]
  const mistakes: MistakeExample[] = accuracyScore < 100
    ? [{ userAnswer: value.trim(), correctAnswer: entry.romanization?.trim() ?? '', date: today }]
    : []
  onNext(accuracyScore, { mistakes: mistakes.length > 0 ? mistakes : undefined })
}}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 4: Run tests**

```bash
cd frontend && npx vitest run
```

Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/study/exercises/DictationExercise.tsx \
         frontend/src/components/study/exercises/RomanizationRecallExercise.tsx
git commit -m "feat(tracking): dictation and pinyin recall wire mistakes to DB"
```

---

## Task 4 — Wire mistakes from ReconstructionExercise and ClozeExercise

**Context:** `ReconstructionExercise` is binary (correct or 0). It has `value` (user's attempt) and `entry.sourceSegmentText` (correct answer). `ClozeExercise` tracks per-blank answers; each wrong blank becomes a separate `MistakeExample`. The `Props.onNext` type and `MistakeExample` import are already in place from Task 2.

**Files:**
- Modify: `frontend/src/components/study/exercises/ReconstructionExercise.tsx`
- Modify: `frontend/src/components/study/exercises/ClozeExercise.tsx`

- [ ] **Step 1: Update `ReconstructionExercise` "Next →" button**

Change the "Next →" button's `onClick` (currently `onClick={() => onNext(correct ? 100 : 0)}`, line ~30):

```tsx
onClick={() => {
  const today = new Date().toISOString().split('T')[0]
  const mistakes: MistakeExample[] = !correct
    ? [{ userAnswer: value.trim(), correctAnswer: entry.sourceSegmentText.trim(), date: today }]
    : []
  onNext(correct ? 100 : 0, { mistakes: mistakes.length > 0 ? mistakes : undefined })
}}
```

- [ ] **Step 2: Update `ClozeExercise` "Next →" button**

Change the "Next →" button's `onClick` (currently `onClick={() => onNext(allCorrect ? 100 : 0)}`, line ~61):

```tsx
onClick={() => {
  const today = new Date().toISOString().split('T')[0]
  const mistakes: MistakeExample[] = blankIndices
    .filter(i => answers[i]?.trim() !== parts[i].blank)
    .map(i => ({
      userAnswer: answers[i]?.trim() ?? '',
      correctAnswer: parts[i].blank!,
      date: today,
    }))
  onNext(allCorrect ? 100 : 0, { mistakes: mistakes.length > 0 ? mistakes : undefined })
}}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 4: Run full test suite**

```bash
cd frontend && npx vitest run
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/study/exercises/ReconstructionExercise.tsx \
         frontend/src/components/study/exercises/ClozeExercise.tsx
git commit -m "feat(tracking): reconstruction and cloze wire mistakes to DB"
```

---

## Task 5 — Fix TranslationExercise API failure and add end-to-end tests

**Context:** When the OpenRouter evaluation API fails, `TranslationExercise` currently calls `onNext(0)`, which penalises the SM-2 item for a network error. The fix changes this to a skip. We also add end-to-end integration tests that confirm the full mistake pipeline contract: exercises pass mistakes → `logExerciseResult` stores them in `mistakes-db`.

**Files:**
- Modify: `frontend/src/components/study/exercises/TranslationExercise.tsx`
- Modify: `frontend/tests/useTracking.test.ts`

- [ ] **Step 1: Fix TranslationExercise error path**

In `TranslationExercise.tsx`, find the catch block (line ~135):

```ts
// Before
catch {
  toast.error('Translation evaluation failed. Moving on.')
  onNext(0)
}

// After
catch {
  toast.error('Translation evaluation failed. Moving on.')
  onNext(0, { skipped: true })
}
```

- [ ] **Step 2: Write end-to-end tracking tests**

Add to `frontend/tests/useTracking.test.ts`:

```ts
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
      // No mistakes passed — correct answer
    })
    const pattern = await db.get('mistakes-db', 'entry-1')
    expect(pattern).toBeUndefined()
  })
})
```

- [ ] **Step 3: Run tests to verify they pass**

```bash
cd frontend && npx vitest run tests/useTracking.test.ts
```

Expected: All pass (the hook pipeline already works — these tests document the contract the exercises must fulfill).

- [ ] **Step 4: Run full test suite to confirm no regressions**

```bash
cd frontend && npx vitest run
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/study/exercises/TranslationExercise.tsx \
         frontend/tests/useTracking.test.ts
git commit -m "fix(tracking): translation API failure treated as skip; add e2e mistake pipeline tests"
```

---

## Verification Checklist

After all tasks complete, do a manual smoke test:

1. **Skip button doesn't log**: Open a study session → press Skip on any exercise → open DevTools IndexedDB inspector → confirm `spaced-repetition` has no new entry for that vocab word
2. **Wrong answer logs**: Complete a dictation exercise with a wrong answer → check `mistakes-db` → confirm entry exists with `frequency: 1` and your wrong input as `userAnswer`
3. **Frequent Troubles shows data**: After 2-3 wrong answers on the same word across exercises → open Workbook → Frequent Troubles panel should show that word with occurrence count
4. **Correct answer no mistake**: Get 100% on any exercise → confirm no entry in `mistakes-db` for that word
5. **Cloze partial wrong**: Get one blank wrong in a multi-blank cloze → confirm `frequency: 1` in `mistakes-db` (not the number of blanks in the entire story)
6. **Auto-skip writing**: Add a non-CJK vocab entry (e.g. a test entry with `word: "hello"`) → start a Writing session → confirm the word is silently skipped without appearing in any DB store
