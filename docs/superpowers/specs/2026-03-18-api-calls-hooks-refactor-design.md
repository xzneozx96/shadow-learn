# API Calls Hooks Refactor — Design Spec

**Date:** 2026-03-18
**Scope:** Extract direct API calls and recording logic from presentational components into reusable custom hooks.

---

## Problem

Three components make API calls or manage MediaRecorder state directly:

| Component | Violation |
|---|---|
| `StudySession.tsx` | `fetchAIContent` fires `POST /api/quiz/generate` (×2 parallel) inline |
| `PronunciationReferee.tsx` | `handleSubmit` fires `POST /api/pronunciation/assess` inline; receives `apiBaseUrl`, `azureKey`, `azureRegion` as props (prop drilling) |
| `ShadowingSpeakingPhase.tsx` | Full MediaRecorder lifecycle duplicated inline |

`PronunciationReferee` also duplicates the MediaRecorder pattern already present in `ShadowingSpeakingPhase` and `LessonView`. The component is 308 lines, exceeding the 200-line limit in CLAUDE.md.

---

## Solution: 3 New Hooks

### 1. `useAudioRecorder`

**File:** `frontend/src/hooks/useAudioRecorder.ts`

Owns the full MediaRecorder + playback lifecycle, shared across all recording callsites.

**Options:**
```ts
interface UseAudioRecorderOptions {
  minDurationMs?: number  // default: 0. Pass 500 for ShadowingSpeakingPhase minimum-duration guard.
}
```

**Return:**
```ts
interface UseAudioRecorderReturn {
  recordingState: 'idle' | 'recording' | 'stopped'
  blob: Blob | null
  isPlaying: boolean
  attempt: number
  startRecording: () => Promise<void>
  stopRecording: () => void
  cancel: () => void       // sets cancellation flag so onstop ignores blob (tab-hidden guard)
  togglePlayback: () => void
  reset: () => void        // clears blob, resets to idle (re-record / try again)
}
```

**Responsibilities:**
- `navigator.mediaDevices.getUserMedia`
- `MediaRecorder` setup, chunk collection, blob assembly
- `minDurationMs` check — blobs shorter than threshold are discarded, state resets to `'idle'`
- `cancel()` — sets internal cancellation flag before calling `recorder.stop()` so `onstop` ignores the result
- Playback via `new Audio(objectURL)`, URL lifecycle management (revoke on reset/unmount)
- `attempt` counter increments on each `startRecording` call

**Derived state for consumers:**
- `ShadowingSpeakingPhase` `'processing'` sub-state = `recordingState === 'stopped' && blob === null`
- `PronunciationReferee` `'stopped'` state = `recordingState === 'stopped'`

**Consumers after refactor:**
- `PronunciationReferee.tsx` — replaces all inline recording/playback state and functions
- `ShadowingSpeakingPhase.tsx` — replaces inline MediaRecorder logic; retains tab-hidden `visibilitychange` effect that calls `cancel()`
- `LessonView.tsx` — replaces inline MediaRecorder logic

---

### 2. `useQuizGeneration`

**File:** `frontend/src/hooks/useQuizGeneration.ts`

Owns parallel quiz generation API calls for `StudySession`.

**Return:**
```ts
interface UseQuizGenerationReturn {
  generateQuiz: (
    types: Exclude<ExerciseMode, 'mixed'>[],
    pool: VocabEntry[],
    signal: AbortSignal,
  ) => Promise<{ clozeExercises: ClozeExercise[], pronExercises: PronExercise[] }>
  loading: boolean
}
```

**Responsibilities:**
- Reads `keys` from `useAuth()` directly — no prop drilling
- Fires `POST /api/quiz/generate` for cloze and pronunciation in parallel via `Promise.all`
- Skips a call entirely if count for that type is 0 (resolves immediately with `{ exercises: [] }`)
- Throws on non-ok response so `StudySession.handleStart` keeps its existing try/catch + fallback logic unchanged
- Manages `loading` boolean state

**Impact on `StudySession`:**
- Removes inline `fetchAIContent` function (~55 lines)
- Removes `loading` / `setLoading` state (moved into hook)
- `handleStart` calls `generateQuiz(types, pool, controller.signal)` in place of `fetchAIContent`

---

### 3. `usePronunciationAssessment`

**File:** `frontend/src/hooks/usePronunciationAssessment.ts`

Owns the pronunciation assessment API call for `PronunciationReferee`.

**Return:**
```ts
interface UsePronunciationAssessmentReturn {
  submit: (blob: Blob, sentence: string) => Promise<void>
  result: PronunciationAssessResult | null
  submitting: boolean
  error: string | null
  reset: () => void  // clears result and error for "Try again"
}
```

**Responsibilities:**
- Reads `keys` from `useAuth()` directly
- Constructs `FormData` with `audio`, `reference_text`, `language`, `azure_key`, `azure_region`
- `POST /api/pronunciation/assess`, parses JSON result
- Sets `error` string on failure

**Impact on `PronunciationReferee`:**
- Removes `apiBaseUrl`, `azureKey`, `azureRegion` props entirely
- Props become: `sentence`, `progress`, `onNext`
- Removes inline `handleSubmit`, `submitting`, `result`, `error` state
- Combined with `useAudioRecorder`, component drops from 308 → ~150 lines

**Impact on `StudySession`:**
- Removes `apiBaseUrl` and key props from `<PronunciationReferee>` usage

---

## Files Changed

| File | Change |
|---|---|
| `frontend/src/hooks/useAudioRecorder.ts` | **new** |
| `frontend/src/hooks/useQuizGeneration.ts` | **new** |
| `frontend/src/hooks/usePronunciationAssessment.ts` | **new** |
| `frontend/src/components/study/exercises/PronunciationReferee.tsx` | remove fetch + recording logic, use 2 new hooks, remove 3 props |
| `frontend/src/components/study/StudySession.tsx` | remove `fetchAIContent`, use `useQuizGeneration`, remove `loading` state |
| `frontend/src/components/shadowing/ShadowingSpeakingPhase.tsx` | replace MediaRecorder inline logic with `useAudioRecorder({ minDurationMs: 500 })` |
| `frontend/src/components/lesson/LessonView.tsx` | replace MediaRecorder inline logic with `useAudioRecorder` |

---

## Out of Scope

- `Setup.tsx`, `Settings.tsx` — `GET /api/config` duplication (separate refactor)
- `CreateLesson.tsx`, `Library.tsx` — lesson generation calls (separate refactor)
- `DocumentationPage.tsx` — static doc fetch (low value)

---

## Constraints

- No React Query, Axios, or new state management libraries (CLAUDE.md)
- No `useContext` — use React 19 `use()` hook for context access
- Hooks and `lib/` utilities must have tests in `frontend/tests/`
- `useAudioRecorder` should be tested with a mocked `MediaRecorder`
