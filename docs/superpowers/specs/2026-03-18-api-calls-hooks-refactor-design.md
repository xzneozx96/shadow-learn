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

`PronunciationReferee` also duplicates the MediaRecorder pattern already present in `ShadowingSpeakingPhase`. The component is 308 lines, exceeding the 200-line limit in CLAUDE.md.

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
  recordingState: 'idle' | 'recording' | 'processing' | 'stopped'
  blob: Blob | null
  isPlaying: boolean
  attempt: number
  startRecording: () => Promise<void>
  stopRecording: () => void
  cancel: () => void       // cancels in-flight recording and resets to 'idle' immediately
  togglePlayback: () => void
  reset: () => void        // clears blob, revokes object URL, resets to 'idle'
}
```

**`recordingState` transitions:**
- `'idle'` → `startRecording()` → `'recording'`
- `'recording'` → `stopRecording()` → `'processing'` (recorder.stop() called, onstop not yet fired)
- `'processing'` → onstop fires → `'stopped'` (blob assembled) or `'idle'` (cancelled or too short)
- `'stopped'` → `reset()` or `startRecording()` → `'idle'` / `'recording'`
- Any state → `cancel()` → `'idle'` immediately (cancellation flag set, onstop ignores blob)

**Responsibilities:**
- `navigator.mediaDevices.getUserMedia`; `startRecording()` also stops any existing stream tracks before acquiring a new one to release the microphone
- `MediaRecorder` setup, chunk collection, blob assembly
- `minDurationMs` check — blobs shorter than threshold are discarded, `recordingState` resets to `'idle'`
- `cancel()` — only calls `recorder.stop()` when `recordingState` is `'recording'` or `'processing'` (calling `.stop()` on an already-stopped recorder throws a `DOMException`); in all other states it is a no-op. Sets cancellation flag using a `useRef` (not state) so `onstop` can safely check it even after component unmount. Resets `recordingState` to `'idle'` immediately.
- `startRecording()` — revokes any existing object URL and stops existing stream tracks before acquiring mic to prevent leaks on re-record
- Playback via `new Audio(objectURL)`, revokes object URL on `reset()` and on unmount
- `attempt` counter increments on each `startRecording` call

**Derived state for consumers:**
- `ShadowingSpeakingPhase` reads `recordingState === 'processing'` directly to show the spinner
- `PronunciationReferee`: `recordingState === 'processing'` shows a disabled Submit button (same as `'recording'`); `recordingState === 'stopped'` enables Submit

**Consumers after refactor:**
- `PronunciationReferee.tsx` — replaces all inline recording/playback state and functions
- `ShadowingSpeakingPhase.tsx` — replaces inline MediaRecorder logic; retains tab-hidden `visibilitychange` effect that calls `cancel()` (which resets to `'idle'`); `handleSkip` also calls `cancel()` before calling `onSkip()` — safe to call immediately before unmount since the cancellation flag is a ref
- `LessonView.tsx` — no changes needed; the `typeof MediaRecorder !== 'undefined'` capability guard is unrelated to this refactor

---

### 2. `useQuizGeneration`

**File:** `frontend/src/hooks/useQuizGeneration.ts`

Owns parallel quiz generation API calls for `StudySession`.

**Return:**
```ts
// Inline types matching existing StudySession Question interface
type ClozeExerciseData = { story: string, blanks: string[] }
type PronExerciseData = { sentence: string, translation: string }

interface UseQuizGenerationReturn {
  generateQuiz: (
    types: Exclude<ExerciseMode, 'mixed'>[],
    pool: VocabEntry[],
    signal: AbortSignal,
  ) => Promise<{ clozeExercises: ClozeExerciseData[], pronExercises: PronExerciseData[] }>
  loading: boolean  // true while generateQuiz is in flight; read by StudySession to pass to <ModePicker>
}
```

**API base URL:** Hook reads `import.meta.env.VITE_API_BASE ?? 'http://localhost:8000'` directly (same pattern as existing `API_BASE` constant in `StudySession`).

**Responsibilities:**
- Reads `keys` from `useAuth()` directly — no prop drilling
- Replicates existing `fetchAIContent` request-body construction verbatim:
  - Cloze: sends first 5 pool entries mapped to `{ word, pinyin, meaning, usage }`, field name `story_count`
  - Pronunciation: sends full pool mapped to `{ word, pinyin, meaning, usage }`, field name `count`
- Fires `POST /api/quiz/generate` for cloze and pronunciation in parallel via `Promise.all`
- Skips a call entirely if count for that type is 0 (resolves immediately with `{ exercises: [] }`)
- Throws on non-ok response so `StudySession.handleStart` keeps its existing try/catch + fallback logic unchanged
- Manages `loading` boolean state

**Impact on `StudySession`:**
- Removes inline `fetchAIContent` function (~55 lines)
- `loading` from the hook replaces `loading` / `setLoading` state — `StudySession` reads `loading` from the hook and passes it to `<ModePicker loading={loading}>`. The existing `abortRef.current` guard in `handleStart` remains sufficient to prevent re-entry; `loading` is UI-only.
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

**API base URL:** Hook reads `import.meta.env.VITE_API_BASE ?? 'http://localhost:8000'` directly.

**Responsibilities:**
- Reads `keys` from `useAuth()` directly (`keys.azureSpeechKey`, `keys.azureSpeechRegion`)
- Constructs `FormData` with `audio`, `reference_text`, `language`, `azure_key`, `azure_region`
- `POST /api/pronunciation/assess`, parses JSON result
- Sets `error` string on failure

**Impact on `PronunciationReferee`:**
- Removes `apiBaseUrl`, `azureKey`, `azureRegion` props entirely
- Props become: `sentence`, `progress`, `onNext`
- Removes inline `handleSubmit`, `submitting`, `result`, `error` state
- "Try again" handler calls both `assessmentReset()` (from `usePronunciationAssessment`) and `audioReset()` (from `useAudioRecorder`) to clear all state
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
| `frontend/tests/useAudioRecorder.test.ts` | **new** |
| `frontend/tests/useQuizGeneration.test.ts` | **new** |
| `frontend/tests/usePronunciationAssessment.test.ts` | **new** |

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
