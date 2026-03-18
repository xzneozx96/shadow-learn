# API Calls Hooks Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract direct API calls and MediaRecorder logic from three presentational components into three reusable custom hooks (`useAudioRecorder`, `useQuizGeneration`, `usePronunciationAssessment`).

**Architecture:** Each hook owns a single concern — recording lifecycle, quiz generation, or pronunciation assessment — and is tested independently. Components are then updated to consume the hooks, removing inline fetch calls and prop drilling of API credentials. `useAudioRecorder` is shared across `PronunciationReferee` and `ShadowingSpeakingPhase`.

**Tech Stack:** React 19, TypeScript, Vitest + `@testing-library/react` `renderHook`, `vi.stubGlobal` for fetch mocking, `vi.fn()` for MediaRecorder mocking.

---

## File Map

| File | Status | Responsibility |
|---|---|---|
| `frontend/src/hooks/useAudioRecorder.ts` | **create** | Full MediaRecorder + playback lifecycle |
| `frontend/src/hooks/useQuizGeneration.ts` | **create** | Parallel quiz API calls for StudySession |
| `frontend/src/hooks/usePronunciationAssessment.ts` | **create** | Pronunciation assessment API call |
| `frontend/tests/useAudioRecorder.test.ts` | **create** | Unit tests for useAudioRecorder |
| `frontend/tests/useQuizGeneration.test.ts` | **create** | Unit tests for useQuizGeneration |
| `frontend/tests/usePronunciationAssessment.test.ts` | **create** | Unit tests for usePronunciationAssessment |
| `frontend/src/components/study/exercises/PronunciationReferee.tsx` | **modify** | Use useAudioRecorder + usePronunciationAssessment, remove 3 props |
| `frontend/src/components/study/StudySession.tsx` | **modify** | Use useQuizGeneration, remove fetchAIContent + loading state |
| `frontend/src/components/shadowing/ShadowingSpeakingPhase.tsx` | **modify** | Use useAudioRecorder({ minDurationMs: 500 }) |

---

## Task 1: `useAudioRecorder` hook + tests

**Files:**
- Create: `frontend/src/hooks/useAudioRecorder.ts`
- Create: `frontend/tests/useAudioRecorder.test.ts`

### Background: how the hook works

`recordingState` state machine:
- `'idle'` → `startRecording()` → `'recording'`
- `'recording'` → `stopRecording()` → `'processing'` (recorder.stop() called, onstop not yet fired)
- `'processing'` → onstop fires → `'stopped'` (blob assembled) OR `'idle'` (cancelled or < minDurationMs)
- `'stopped'` → `reset()` or `startRecording()` → `'idle'` / `'recording'`
- Any state → `cancel()` → `'idle'` immediately

Key implementation details:
- Cancellation flag must be a `useRef<boolean>` (not state) so `onstop` can read it after unmount
- `cancel()` only calls `recorder.stop()` when `recordingState` is `'recording'` or `'processing'` — calling `.stop()` on an already-stopped recorder throws `DOMException`
- `startRecording()` revokes any existing object URL and stops existing stream tracks before acquiring mic
- Object URL is also revoked on `reset()` and on unmount (cleanup ref)
- `attempt` increments on each `startRecording()` call

---

- [ ] **Step 1.1: Write failing tests**

Create `frontend/tests/useAudioRecorder.test.ts`:

```ts
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAudioRecorder } from '@/hooks/useAudioRecorder'

// Minimal MediaRecorder mock
function makeRecorderMock() {
  let onstop: (() => void) | null = null
  let ondataavailable: ((e: { data: Blob }) => void) | null = null
  const recorder = {
    start: vi.fn(),
    stop: vi.fn().mockImplementation(() => { onstop?.() }),
    ondataavailable: null as any,
    onstop: null as any,
    get _onstop() { return onstop },
    set _onstop(fn) { onstop = fn },
    get _ondataavailable() { return ondataavailable },
    set _ondataavailable(fn) { ondataavailable = fn },
  }
  // Proxy so setting recorder.onstop updates our internal ref
  return new Proxy(recorder, {
    set(target: any, key, value) {
      if (key === 'onstop') { onstop = value; return true }
      if (key === 'ondataavailable') { ondataavailable = value; return true }
      target[key] = value
      return true
    },
  })
}

function makeStreamMock() {
  const track = { stop: vi.fn() }
  return { getTracks: vi.fn(() => [track]), _track: track }
}

beforeEach(() => {
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => 'blob:mock-url'),
    revokeObjectURL: vi.fn(),
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useAudioRecorder', () => {
  it('starts in idle state', () => {
    const { result } = renderHook(() => useAudioRecorder())
    expect(result.current.recordingState).toBe('idle')
    expect(result.current.blob).toBeNull()
    expect(result.current.attempt).toBe(0)
  })

  it('transitions idle → recording on startRecording', async () => {
    const stream = makeStreamMock()
    const recorder = makeRecorderMock()
    vi.stubGlobal('navigator', {
      mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) },
    })
    vi.stubGlobal('MediaRecorder', vi.fn(() => recorder))

    const { result } = renderHook(() => useAudioRecorder())
    await act(async () => { await result.current.startRecording() })

    expect(result.current.recordingState).toBe('recording')
    expect(result.current.attempt).toBe(1)
    expect(recorder.start).toHaveBeenCalledOnce()
  })

  it('transitions recording → processing → stopped on stopRecording', async () => {
    const stream = makeStreamMock()
    const recorder = makeRecorderMock()
    vi.stubGlobal('navigator', {
      mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) },
    })
    vi.stubGlobal('MediaRecorder', vi.fn(() => recorder))

    const { result } = renderHook(() => useAudioRecorder())
    await act(async () => { await result.current.startRecording() })

    // Simulate a data chunk arriving
    act(() => { (recorder as any).ondataavailable?.({ data: new Blob(['audio']) }) })

    // stopRecording triggers recorder.stop() which synchronously calls onstop in our mock
    act(() => { result.current.stopRecording() })

    expect(result.current.recordingState).toBe('stopped')
    expect(result.current.blob).not.toBeNull()
  })

  it('discards blob and resets to idle when recording is shorter than minDurationMs', async () => {
    const stream = makeStreamMock()
    const recorder = makeRecorderMock()
    vi.stubGlobal('navigator', {
      mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) },
    })
    vi.stubGlobal('MediaRecorder', vi.fn(() => recorder))

    // Use real Date.now but control timing by patching it
    let now = 0
    vi.spyOn(Date, 'now').mockImplementation(() => now)

    const { result } = renderHook(() => useAudioRecorder({ minDurationMs: 500 }))
    await act(async () => {
      now = 1000
      await result.current.startRecording()
    })

    act(() => { (recorder as any).ondataavailable?.({ data: new Blob(['audio']) }) })

    // Stop immediately — duration = 0ms < 500ms
    act(() => { result.current.stopRecording() })

    expect(result.current.recordingState).toBe('idle')
    expect(result.current.blob).toBeNull()
  })

  it('cancel() resets to idle and prevents onstop from setting blob', async () => {
    const stream = makeStreamMock()
    // Use a recorder whose stop() does NOT immediately call onstop (async)
    let capturedOnstop: (() => void) | null = null
    const recorder = {
      start: vi.fn(),
      stop: vi.fn(),
      set onstop(fn: any) { capturedOnstop = fn },
      set ondataavailable(_fn: any) {},
    }
    vi.stubGlobal('navigator', {
      mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) },
    })
    vi.stubGlobal('MediaRecorder', vi.fn(() => recorder))

    const { result } = renderHook(() => useAudioRecorder())
    await act(async () => { await result.current.startRecording() })

    act(() => { result.current.cancel() })
    expect(result.current.recordingState).toBe('idle')

    // Now fire onstop — should be ignored
    act(() => { capturedOnstop?.() })
    expect(result.current.blob).toBeNull()
    expect(result.current.recordingState).toBe('idle')
  })

  it('reset() clears blob and revokes object URL', async () => {
    const stream = makeStreamMock()
    const recorder = makeRecorderMock()
    vi.stubGlobal('navigator', {
      mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) },
    })
    vi.stubGlobal('MediaRecorder', vi.fn(() => recorder))

    const { result } = renderHook(() => useAudioRecorder())
    await act(async () => { await result.current.startRecording() })
    act(() => { (recorder as any).ondataavailable?.({ data: new Blob(['audio']) }) })
    act(() => { result.current.stopRecording() })
    expect(result.current.blob).not.toBeNull()

    act(() => { result.current.reset() })
    expect(result.current.blob).toBeNull()
    expect(result.current.recordingState).toBe('idle')
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url')
  })
})
```

- [ ] **Step 1.2: Run tests to verify they fail**

```bash
cd frontend && npx vitest run tests/useAudioRecorder.test.ts
```

Expected: FAIL — `Cannot find module '@/hooks/useAudioRecorder'`

- [ ] **Step 1.3: Implement `useAudioRecorder`**

Create `frontend/src/hooks/useAudioRecorder.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from 'react'

export interface UseAudioRecorderOptions {
  minDurationMs?: number
}

export interface UseAudioRecorderReturn {
  recordingState: 'idle' | 'recording' | 'processing' | 'stopped'
  blob: Blob | null
  isPlaying: boolean
  attempt: number
  startRecording: () => Promise<void>
  stopRecording: () => void
  cancel: () => void
  togglePlayback: () => void
  reset: () => void
}

export function useAudioRecorder(options: UseAudioRecorderOptions = {}): UseAudioRecorderReturn {
  const { minDurationMs = 0 } = options

  const [recordingState, setRecordingState] = useState<'idle' | 'recording' | 'processing' | 'stopped'>('idle')
  const [blob, setBlob] = useState<Blob | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [attempt, setAttempt] = useState(0)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const startTimeRef = useRef<number>(0)
  const cancelledRef = useRef(false)
  const objectUrlRef = useRef<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // Revoke object URL helper
  function revokeUrl() {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
    }
  }

  // Stop any active stream tracks
  function stopStream() {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelledRef.current = true
      recorderRef.current?.stop()
      stopStream()
      revokeUrl()
      audioRef.current?.pause()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const startRecording = useCallback(async () => {
    // Clean up any previous recording
    revokeUrl()
    stopStream()
    cancelledRef.current = false
    chunksRef.current = []

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      recorderRef.current = recorder

      recorder.ondataavailable = (e) => { chunksRef.current.push(e.data) }
      recorder.onstop = () => {
        stopStream()
        if (cancelledRef.current) {
          cancelledRef.current = false
          return
        }
        const duration = Date.now() - startTimeRef.current
        if (duration < minDurationMs) {
          setRecordingState('idle')
          return
        }
        const b = new Blob(chunksRef.current, { type: 'audio/webm' })
        objectUrlRef.current = URL.createObjectURL(b)
        setBlob(b)
        setRecordingState('stopped')
      }

      recorder.start()
      startTimeRef.current = Date.now()
      setAttempt(a => a + 1)
      setRecordingState('recording')
    }
    catch {
      // Mic access denied — stay idle
    }
  }, [minDurationMs])

  const stopRecording = useCallback(() => {
    recorderRef.current?.stop()
    recorderRef.current = null
    setRecordingState('processing')
  }, [])

  const cancel = useCallback(() => {
    cancelledRef.current = true
    const state = recorderRef.current
    if (state) {
      recorderRef.current = null
      try { state.stop() } catch { /* already stopped */ }
    }
    stopStream()
    setRecordingState('idle')
  }, [])

  const togglePlayback = useCallback(() => {
    if (isPlaying) {
      audioRef.current?.pause()
      setIsPlaying(false)
      return
    }
    if (!objectUrlRef.current) return
    const audio = new Audio(objectUrlRef.current)
    audioRef.current = audio
    audio.onplay = () => setIsPlaying(true)
    audio.onended = () => { setIsPlaying(false); audioRef.current = null }
    audio.onpause = () => setIsPlaying(false)
    audio.play().catch(() => {})
  }, [isPlaying])

  const reset = useCallback(() => {
    audioRef.current?.pause()
    audioRef.current = null
    revokeUrl()
    setBlob(null)
    setIsPlaying(false)
    setRecordingState('idle')
  }, [])

  return { recordingState, blob, isPlaying, attempt, startRecording, stopRecording, cancel, togglePlayback, reset }
}
```

- [ ] **Step 1.4: Run tests and verify they pass**

```bash
cd frontend && npx vitest run tests/useAudioRecorder.test.ts
```

Expected: all tests PASS

- [ ] **Step 1.5: Commit**

```bash
git add frontend/src/hooks/useAudioRecorder.ts frontend/tests/useAudioRecorder.test.ts
git commit -m "feat: add useAudioRecorder hook with full MediaRecorder + playback lifecycle"
```

---

## Task 2: `useQuizGeneration` hook + tests

**Files:**
- Create: `frontend/src/hooks/useQuizGeneration.ts`
- Create: `frontend/tests/useQuizGeneration.test.ts`

### Background

The hook replicates `fetchAIContent` from `StudySession` verbatim:
- Cloze request body: `{ openrouter_api_key, words: pool.slice(0,5).map(...), exercise_type: 'cloze', story_count: N }`
- Pronunciation request body: `{ openrouter_api_key, words: pool.map(...), exercise_type: 'pronunciation_sentence', count: N }`
- Both calls fire in parallel via `Promise.all`; skipped (resolves `{ exercises: [] }`) when count = 0
- Throws on non-ok so `StudySession.handleStart` catch block handles fallback unchanged

The hook reads `keys` from `AuthContext` using React 19's `use()` hook. Since tests can't easily wrap with `AuthContext`, test the hook by mocking `useAuth` via `vi.mock`.

---

- [ ] **Step 2.1: Write failing tests**

Create `frontend/tests/useQuizGeneration.test.ts`:

```ts
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useQuizGeneration } from '@/hooks/useQuizGeneration'

// Mock useAuth so hook can be tested without AuthContext provider
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ keys: { openrouterApiKey: 'sk-test' } }),
}))

const mockPool = [
  { word: '你好', pinyin: 'nǐ hǎo', meaning: 'hello', usage: 'greeting', sourceSegmentId: 's1', sourceSegmentChinese: '', sourceLessonTitle: '', sourceLessonId: '', id: '1', addedAt: '' },
  { word: '再见', pinyin: 'zài jiàn', meaning: 'goodbye', usage: 'farewell', sourceSegmentId: 's1', sourceSegmentChinese: '', sourceLessonTitle: '', sourceLessonId: '', id: '2', addedAt: '' },
]

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('useQuizGeneration', () => {
  it('returns loading=false initially', () => {
    const { result } = renderHook(() => useQuizGeneration())
    expect(result.current.loading).toBe(false)
  })

  it('sets loading=true while in flight and false after', async () => {
    let resolveFirst!: (v: any) => void
    vi.stubGlobal('fetch', vi.fn()
      .mockImplementationOnce(() => new Promise(res => { resolveFirst = res }))
      .mockResolvedValue({ ok: true, json: () => Promise.resolve({ exercises: [] }) }),
    )

    const { result } = renderHook(() => useQuizGeneration())
    const controller = new AbortController()

    let promise!: Promise<any>
    act(() => { promise = result.current.generateQuiz(['cloze', 'pronunciation'], mockPool, controller.signal) })
    expect(result.current.loading).toBe(true)

    await act(async () => {
      resolveFirst({ ok: true, json: () => Promise.resolve({ exercises: [] }) })
      await promise
    })
    expect(result.current.loading).toBe(false)
  })

  it('returns clozeExercises and pronExercises from API', async () => {
    const clozeResult = [{ story: 'I said __', blanks: ['你好'] }]
    const pronResult = [{ sentence: '你好吗', translation: 'How are you?' }]

    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ exercises: clozeResult }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ exercises: pronResult }) }),
    )

    const { result } = renderHook(() => useQuizGeneration())
    const controller = new AbortController()

    let data: any
    await act(async () => {
      data = await result.current.generateQuiz(['cloze', 'pronunciation'], mockPool, controller.signal)
    })

    expect(data.clozeExercises).toEqual(clozeResult)
    expect(data.pronExercises).toEqual(pronResult)
  })

  it('skips cloze call when no cloze types in distribution', async () => {
    const pronResult = [{ sentence: '你好吗', translation: 'How are you?' }]
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ exercises: pronResult }) })
    vi.stubGlobal('fetch', mockFetch)

    const { result } = renderHook(() => useQuizGeneration())
    const controller = new AbortController()

    await act(async () => {
      await result.current.generateQuiz(['pronunciation'], mockPool, controller.signal)
    })

    // Only 1 fetch call — pronunciation only
    expect(mockFetch).toHaveBeenCalledOnce()
    expect(mockFetch.mock.calls[0][1].body).toContain('pronunciation_sentence')
  })

  it('throws when API returns non-ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }))

    const { result } = renderHook(() => useQuizGeneration())
    const controller = new AbortController()

    await act(async () => {
      await expect(
        result.current.generateQuiz(['cloze'], mockPool, controller.signal)
      ).rejects.toThrow('Quiz generation failed (500)')
    })
  })

  it('sends words as { word, pinyin, meaning, usage } and uses story_count for cloze', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ exercises: [] }) })
    vi.stubGlobal('fetch', mockFetch)

    const { result } = renderHook(() => useQuizGeneration())
    const controller = new AbortController()

    await act(async () => {
      await result.current.generateQuiz(['cloze'], mockPool, controller.signal)
    })

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body).toMatchObject({
      exercise_type: 'cloze',
      story_count: 1,
      words: expect.arrayContaining([
        expect.objectContaining({ word: '你好', pinyin: 'nǐ hǎo', meaning: 'hello', usage: 'greeting' }),
      ]),
    })
    // No extra fields like sourceSegmentId
    expect(body.words[0]).not.toHaveProperty('sourceSegmentId')
  })
})
```

- [ ] **Step 2.2: Run tests to verify they fail**

```bash
cd frontend && npx vitest run tests/useQuizGeneration.test.ts
```

Expected: FAIL — `Cannot find module '@/hooks/useQuizGeneration'`

- [ ] **Step 2.3: Implement `useQuizGeneration`**

Create `frontend/src/hooks/useQuizGeneration.ts`:

```ts
import type { ExerciseMode } from '@/components/study/ModePicker'
import type { VocabEntry } from '@/types'
import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000'

type ClozeExerciseData = { story: string, blanks: string[] }
type PronExerciseData = { sentence: string, translation: string }

interface UseQuizGenerationReturn {
  generateQuiz: (
    types: Exclude<ExerciseMode, 'mixed'>[],
    pool: VocabEntry[],
    signal: AbortSignal,
  ) => Promise<{ clozeExercises: ClozeExerciseData[], pronExercises: PronExerciseData[] }>
  loading: boolean
}

export function useQuizGeneration(): UseQuizGenerationReturn {
  const { keys } = useAuth()
  const [loading, setLoading] = useState(false)

  async function generateQuiz(
    types: Exclude<ExerciseMode, 'mixed'>[],
    pool: VocabEntry[],
    signal: AbortSignal,
  ) {
    const clozeCount = types.filter(t => t === 'cloze').length
    const pronCount = types.filter(t => t === 'pronunciation').length

    const wordMap = (entries: VocabEntry[]) =>
      entries.map(e => ({ word: e.word, pinyin: e.pinyin, meaning: e.meaning, usage: e.usage }))

    setLoading(true)
    try {
      const [clozeResp, pronResp] = await Promise.all([
        clozeCount > 0
          ? fetch(`${API_BASE}/api/quiz/generate`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                openrouter_api_key: keys?.openrouterApiKey,
                words: wordMap(pool.slice(0, 5)),
                exercise_type: 'cloze',
                story_count: clozeCount,
              }),
              signal,
            }).then(async (r) => {
              if (!r.ok) throw new Error(`Quiz generation failed (${r.status})`)
              return r.json()
            })
          : Promise.resolve({ exercises: [] }),
        pronCount > 0
          ? fetch(`${API_BASE}/api/quiz/generate`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                openrouter_api_key: keys?.openrouterApiKey,
                words: wordMap(pool),
                exercise_type: 'pronunciation_sentence',
                count: pronCount,
              }),
              signal,
            }).then(async (r) => {
              if (!r.ok) throw new Error(`Quiz generation failed (${r.status})`)
              return r.json()
            })
          : Promise.resolve({ exercises: [] }),
      ])

      return {
        clozeExercises: (clozeResp.exercises ?? []) as ClozeExerciseData[],
        pronExercises: (pronResp.exercises ?? []) as PronExerciseData[],
      }
    }
    finally {
      setLoading(false)
    }
  }

  return { generateQuiz, loading }
}
```

- [ ] **Step 2.4: Run tests and verify they pass**

```bash
cd frontend && npx vitest run tests/useQuizGeneration.test.ts
```

Expected: all tests PASS

- [ ] **Step 2.5: Commit**

```bash
git add frontend/src/hooks/useQuizGeneration.ts frontend/tests/useQuizGeneration.test.ts
git commit -m "feat: add useQuizGeneration hook extracting parallel quiz API calls"
```

---

## Task 3: `usePronunciationAssessment` hook + tests

**Files:**
- Create: `frontend/src/hooks/usePronunciationAssessment.ts`
- Create: `frontend/tests/usePronunciationAssessment.test.ts`

---

- [ ] **Step 3.1: Write failing tests**

Create `frontend/tests/usePronunciationAssessment.test.ts`:

```ts
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usePronunciationAssessment } from '@/hooks/usePronunciationAssessment'

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ keys: { azureSpeechKey: 'az-key', azureSpeechRegion: 'eastus' } }),
}))

const mockBlob = new Blob(['audio'], { type: 'audio/webm' })
const mockResult = {
  overall: { accuracy: 85, fluency: 80, completeness: 90, prosody: 75 },
  words: [{ word: '你好', accuracy: 85, error_type: null }],
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('usePronunciationAssessment', () => {
  it('starts with null result and no error', () => {
    const { result } = renderHook(() => usePronunciationAssessment())
    expect(result.current.result).toBeNull()
    expect(result.current.error).toBeNull()
    expect(result.current.submitting).toBe(false)
  })

  it('sets submitting=true while in flight and false after', async () => {
    let resolve!: (v: any) => void
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => new Promise(res => { resolve = res })))

    const { result } = renderHook(() => usePronunciationAssessment())
    act(() => { void result.current.submit(mockBlob, '你好') })
    expect(result.current.submitting).toBe(true)

    await act(async () => {
      resolve({ ok: true, json: () => Promise.resolve(mockResult) })
    })
    expect(result.current.submitting).toBe(false)
  })

  it('sets result on successful submission', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResult),
    }))

    const { result } = renderHook(() => usePronunciationAssessment())
    await act(async () => { await result.current.submit(mockBlob, '你好') })

    expect(result.current.result).toEqual(mockResult)
    expect(result.current.error).toBeNull()
  })

  it('sends correct FormData fields', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(mockResult) })
    vi.stubGlobal('fetch', mockFetch)

    const { result } = renderHook(() => usePronunciationAssessment())
    await act(async () => { await result.current.submit(mockBlob, '你好吗') })

    const formData: FormData = mockFetch.mock.calls[0][1].body
    expect(formData.get('reference_text')).toBe('你好吗')
    expect(formData.get('language')).toBe('zh-CN')
    expect(formData.get('azure_key')).toBe('az-key')
    expect(formData.get('azure_region')).toBe('eastus')
    expect(formData.get('audio')).toBeInstanceOf(Blob)
  })

  it('sets error on non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      text: () => Promise.resolve('Azure quota exceeded'),
    }))

    const { result } = renderHook(() => usePronunciationAssessment())
    await act(async () => { await result.current.submit(mockBlob, '你好') })

    expect(result.current.error).toBe('Azure quota exceeded')
    expect(result.current.result).toBeNull()
  })

  it('reset() clears result and error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(mockResult) }))

    const { result } = renderHook(() => usePronunciationAssessment())
    await act(async () => { await result.current.submit(mockBlob, '你好') })
    expect(result.current.result).not.toBeNull()

    act(() => { result.current.reset() })
    expect(result.current.result).toBeNull()
    expect(result.current.error).toBeNull()
  })
})
```

- [ ] **Step 3.2: Run tests to verify they fail**

```bash
cd frontend && npx vitest run tests/usePronunciationAssessment.test.ts
```

Expected: FAIL — `Cannot find module '@/hooks/usePronunciationAssessment'`

- [ ] **Step 3.3: Implement `usePronunciationAssessment`**

Create `frontend/src/hooks/usePronunciationAssessment.ts`:

```ts
import type { PronunciationAssessResult } from '@/types'
import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000'

interface UsePronunciationAssessmentReturn {
  submit: (blob: Blob, sentence: string) => Promise<void>
  result: PronunciationAssessResult | null
  submitting: boolean
  error: string | null
  reset: () => void
}

export function usePronunciationAssessment(): UsePronunciationAssessmentReturn {
  const { keys } = useAuth()
  const [result, setResult] = useState<PronunciationAssessResult | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(blob: Blob, sentence: string) {
    setSubmitting(true)
    setError(null)
    try {
      const form = new FormData()
      form.append('audio', blob, 'recording.webm')
      form.append('reference_text', sentence)
      form.append('language', 'zh-CN')
      form.append('azure_key', keys?.azureSpeechKey ?? '')
      form.append('azure_region', keys?.azureSpeechRegion ?? 'eastus')
      const resp = await fetch(`${API_BASE}/api/pronunciation/assess`, { method: 'POST', body: form })
      if (!resp.ok) throw new Error(await resp.text())
      setResult(await resp.json())
    }
    catch (e) {
      setError(e instanceof Error ? e.message : 'Assessment failed')
    }
    finally {
      setSubmitting(false)
    }
  }

  function reset() {
    setResult(null)
    setError(null)
  }

  return { submit, result, submitting, error, reset }
}
```

- [ ] **Step 3.4: Run tests and verify they pass**

```bash
cd frontend && npx vitest run tests/usePronunciationAssessment.test.ts
```

Expected: all tests PASS

- [ ] **Step 3.5: Commit**

```bash
git add frontend/src/hooks/usePronunciationAssessment.ts frontend/tests/usePronunciationAssessment.test.ts
git commit -m "feat: add usePronunciationAssessment hook"
```

---

## Task 4: Refactor `PronunciationReferee`

**Files:**
- Modify: `frontend/src/components/study/exercises/PronunciationReferee.tsx`

Remove: `apiBaseUrl`, `azureKey`, `azureRegion` props, all inline recording state/functions, inline fetch.
Add: `useAudioRecorder()`, `usePronunciationAssessment()`.

Props before:
```ts
interface Props {
  sentence: PronunciationSentence
  apiBaseUrl: string
  azureKey: string
  azureRegion: string
  progress?: string
  onNext: (correct: boolean) => void
}
```

Props after:
```ts
interface Props {
  sentence: PronunciationSentence
  progress?: string
  onNext: (correct: boolean) => void
}
```

---

- [ ] **Step 4.1: Rewrite `PronunciationReferee.tsx`**

Replace the full file content. Key changes:
- Add `const { recordingState, blob, isPlaying, attempt, startRecording, stopRecording, togglePlayback, reset: audioReset } = useAudioRecorder()`
- Add `const { submit, result, submitting, error, reset: assessmentReset } = usePronunciationAssessment()`
- "Try again" handler: `assessmentReset(); audioReset()`
- Submit button calls `submit(blob, sentence.sentence)` instead of `handleSubmit()`
- Submit disabled when `!blob || submitting || recordingState !== 'stopped'`
- Record/Stop button uses `recordingState === 'recording'` instead of `state === 'recording'`
- Show spinner (disabled Submit button content) when `recordingState === 'processing' || submitting`
- Remove `state`, `blob` (local), `playbackUrl`, `result`, `error`, `submitting`, `isPlaying` useState — all from hooks
- Remove `mediaRef`, `audioRef`, `chunksRef` useRef
- Remove `startRecording`, `stopRecording`, `handleSubmit`, `togglePlayback` inline functions
- Playback button uses `togglePlayback` from `useAudioRecorder`; disabled when `blob === null`

```tsx
import type { PronunciationAssessResult } from '@/types'
import { Pause, Play } from 'lucide-react'
import { ExerciseCard } from '@/components/study/exercises/ExerciseCard'
import { Button } from '@/components/ui/button'
import { useAudioRecorder } from '@/hooks/useAudioRecorder'
import { usePronunciationAssessment } from '@/hooks/usePronunciationAssessment'
import { cn } from '@/lib/utils'

interface PronunciationSentence { sentence: string, translation: string }

interface Props {
  sentence: PronunciationSentence
  progress?: string
  onNext: (correct: boolean) => void
}

function scoreColor(n: number) {
  if (n >= 80) return 'text-emerald-400'
  if (n >= 60) return 'text-amber-400'
  return 'text-destructive'
}

function barColor(n: number) {
  if (n >= 80) return 'bg-emerald-400'
  if (n >= 60) return 'bg-amber-400'
  return 'bg-destructive'
}

function verdict(n: number) {
  if (n >= 90) return 'Excellent'
  if (n >= 75) return 'Good'
  if (n >= 60) return 'Fair'
  if (n >= 40) return 'Keep Practicing'
  return 'Needs Work'
}

export function PronunciationReferee({ sentence, progress = '', onNext }: Props) {
  const {
    recordingState, blob, isPlaying, attempt,
    startRecording, stopRecording, togglePlayback, reset: audioReset,
  } = useAudioRecorder()
  const { submit, result, submitting, error, reset: assessmentReset } = usePronunciationAssessment()

  const isProcessing = recordingState === 'processing' || submitting
  const canSubmit = blob !== null && recordingState === 'stopped' && !submitting

  const footer = result
    ? null
    : (
        <div className="flex items-center justify-center gap-3 p-3">
          <Button variant="ghost" size="sm" onClick={() => onNext(false)}>Skip</Button>
          <Button
            size="sm"
            disabled={!canSubmit}
            onClick={() => blob && void submit(blob, sentence.sentence)}
          >
            {isProcessing
              ? (
                  <>
                    <div className="size-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
                    {' '}
                    Scoring…
                  </>
                )
              : 'Submit →'}
          </Button>
        </div>
      )

  return (
    <ExerciseCard
      type="Pronunciation Referee"
      progress={progress}
      footer={footer}
      info="Read the sentence aloud and get AI-scored feedback on accuracy, fluency, and prosody."
    >
      {/* Sentence display */}
      <div className="rounded-lg border border-border bg-muted/20 p-4 text-center mb-4">
        <div className="text-xl font-bold tracking-widest text-foreground">
          {sentence.sentence}
        </div>
        <div className="text-sm text-muted-foreground mt-1.5">{sentence.translation}</div>
      </div>

      {/* Recording controls (hidden once scored) */}
      {!result && (
        <>
          <div className="flex gap-2 mb-2">
            <Button
              variant="destructive"
              className={cn(
                'flex-1',
                recordingState === 'recording' && 'shadow-[0_0_0_3px_oklch(0.65_0.18_25/0.2)]',
              )}
              onClick={recordingState === 'recording' ? stopRecording : () => void startRecording()}
            >
              {recordingState === 'recording' ? '⏹ Stop' : '⏺ Record'}
            </Button>
            <Button
              variant="outline"
              disabled={!blob}
              onClick={togglePlayback}
            >
              {isPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}
              {isPlaying ? 'Pause' : 'Playback'}
            </Button>
          </div>
          {attempt > 0 && (
            <p className="text-sm text-muted-foreground/50 text-center mb-2">
              Attempt
              {' '}
              {attempt}
              {' '}
              · Re-record anytime before submitting
            </p>
          )}
        </>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive mb-3">
          {error}
        </div>
      )}

      {/* Score results */}
      {result && (
        <div className="space-y-2">
          <div className="rounded-xl border border-border/50 bg-muted/20 overflow-hidden">
            <div className="flex items-center justify-between px-4 pt-3 pb-2.5">
              <div>
                <div className={cn('text-3xl font-bold tabular-nums tracking-tight leading-none', scoreColor(result.overall.accuracy))}>
                  {Math.round(result.overall.accuracy)}
                </div>
                <div className="mt-1 text-[10px] uppercase tracking-widest text-muted-foreground">
                  Accuracy
                </div>
              </div>
              <div className={cn('text-sm font-semibold', scoreColor(result.overall.accuracy))}>
                {verdict(result.overall.accuracy)}
              </div>
            </div>
            <div className="grid grid-cols-3 border-t border-border/40">
              {(['fluency', 'completeness', 'prosody'] as const).map((k, i) => (
                <div key={k} className={cn('px-3 py-2 text-center', i < 2 && 'border-r border-border/40')}>
                  <div className={cn('text-base font-bold tabular-nums', scoreColor(result.overall[k]))}>
                    {Math.round(result.overall[k])}
                  </div>
                  <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{k}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            {result.words.map(w => (
              <div
                key={w.word}
                className="flex items-center gap-2.5 rounded-lg border border-border/30 bg-muted/20 px-3 py-2"
              >
                <span className={cn('w-10 shrink-0 text-base font-bold', scoreColor(w.accuracy))}>
                  {w.word}
                </span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-border/60">
                  <div
                    className={cn('h-full rounded-full transition-all duration-700 ease-out', barColor(w.accuracy))}
                    style={{ width: `${w.accuracy}%` }}
                  />
                </div>
                <span className={cn('w-7 shrink-0 text-right text-sm font-bold tabular-nums', scoreColor(w.accuracy))}>
                  {Math.round(w.accuracy)}
                </span>
                {w.error_type && (
                  <span className={cn(
                    'shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-medium',
                    w.error_type === 'Mispronunciation' && 'border-amber-500/30 bg-amber-500/10 text-amber-400',
                    w.error_type === 'Omission' && 'border-destructive/30 bg-destructive/10 text-destructive',
                    w.error_type === 'Insertion' && 'border-blue-500/30 bg-blue-500/10 text-blue-400',
                  )}
                  >
                    {w.error_type === 'Mispronunciation' ? 'Mispron.' : w.error_type}
                  </span>
                )}
              </div>
            ))}
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => { assessmentReset(); audioReset() }}
            >
              ⏺ Try again
            </Button>
            <Button
              className="flex-1"
              onClick={() => onNext(result.overall.accuracy >= 70)}
            >
              Next →
            </Button>
          </div>
        </div>
      )}
    </ExerciseCard>
  )
}
```

- [ ] **Step 4.2: Update `StudySession.tsx` — remove `apiBaseUrl` and key props from `<PronunciationReferee>`**

In `frontend/src/components/study/StudySession.tsx`, find the `<PronunciationReferee>` JSX (around line 301) and remove the `apiBaseUrl`, `azureKey`, `azureRegion` props:

Before:
```tsx
<PronunciationReferee
  key={current}
  sentence={q.pronunciationData}
  apiBaseUrl={API_BASE}
  azureKey={keys?.azureSpeechKey ?? ''}
  azureRegion={keys?.azureSpeechRegion ?? 'eastus'}
  progress={`${current + 1} / ${questions.length}`}
  onNext={handleNext}
/>
```

After:
```tsx
<PronunciationReferee
  key={current}
  sentence={q.pronunciationData}
  progress={`${current + 1} / ${questions.length}`}
  onNext={handleNext}
/>
```

- [ ] **Step 4.3: Run the full test suite to check for regressions**

```bash
cd frontend && npx vitest run
```

Expected: all tests PASS (no component tests exist for PronunciationReferee per CLAUDE.md)

- [ ] **Step 4.4: Commit**

```bash
git add frontend/src/components/study/exercises/PronunciationReferee.tsx frontend/src/components/study/StudySession.tsx
git commit -m "refactor: PronunciationReferee uses useAudioRecorder + usePronunciationAssessment, remove prop drilling"
```

---

## Task 5: Refactor `StudySession` — remove `fetchAIContent`

**Files:**
- Modify: `frontend/src/components/study/StudySession.tsx`

---

- [ ] **Step 5.1: Refactor `StudySession`**

In `frontend/src/components/study/StudySession.tsx`:

1. Add import: `import { useQuizGeneration } from '@/hooks/useQuizGeneration'`
2. Add inside component: `const { generateQuiz, loading } = useQuizGeneration()`
3. Remove `const [loading, setLoading] = useState(false)` (line 89)
4. Delete the entire `fetchAIContent` function (lines 103–157)
5. In `handleStart`, replace:
   ```ts
   setLoading(true)
   // ...
   const { clozeExercises, pronExercises } = await fetchAIContent(types, pool, controller.signal)
   // ...
   finally {
     abortRef.current = null
     setLoading(false)
   }
   ```
   With:
   ```ts
   try {
     const { clozeExercises, pronExercises } = await generateQuiz(types, pool, controller.signal)
     // ... (rest of the try block unchanged)
   }
   catch {
     // ... (fallback block unchanged)
   }
   finally {
     abortRef.current = null
   }
   ```
6. `API_BASE` constant (line 29) is no longer used in `StudySession` — remove it if `<PronunciationReferee>` no longer needs it (it doesn't after Task 4). Remove `const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000'`

- [ ] **Step 5.2: Run the full test suite**

```bash
cd frontend && npx vitest run
```

Expected: all tests PASS

- [ ] **Step 5.3: Commit**

```bash
git add frontend/src/components/study/StudySession.tsx
git commit -m "refactor: StudySession uses useQuizGeneration, remove fetchAIContent"
```

---

## Task 6: Refactor `ShadowingSpeakingPhase`

**Files:**
- Modify: `frontend/src/components/shadowing/ShadowingSpeakingPhase.tsx`

---

- [ ] **Step 6.1: Refactor `ShadowingSpeakingPhase`**

Replace the MediaRecorder lifecycle in `ShadowingSpeakingPhase.tsx` with `useAudioRecorder`.

Key mapping from existing code to hook:

| Existing | Hook equivalent |
|---|---|
| `subState: 'initial'` | `recordingState === 'idle'` |
| `subState: 'recording'` | `recordingState === 'recording'` |
| `subState: 'processing'` | `recordingState === 'processing'` |
| `subState: 'recorded'` | `recordingState === 'stopped'` |
| `blob` state | `blob` from hook |
| `isPlayingBack` | `isPlaying` from hook |
| `handlePlayback()` | `togglePlayback()` from hook |
| `handleRerecord()` | `audioReset()` from hook |
| `startRecording()` | `startRecording()` from hook |
| `stopRecording()` | `stopRecording()` from hook |

Changes to make:
1. Add import: `import { useAudioRecorder } from '@/hooks/useAudioRecorder'`
2. Add inside component:
   ```ts
   const {
     recordingState, blob, isPlaying: isPlayingBack,
     startRecording, stopRecording, cancel, togglePlayback: handlePlayback, reset: handleRerecord,
   } = useAudioRecorder({ minDurationMs: 500 })
   ```
3. Remove all `useState` calls for `subState`, `blob`, `isPlayingBack`
4. Remove all `useRef` calls for `mediaRecorderRef`, `chunksRef`, `recordingStartRef`, `playbackAudioRef`, `playbackUrlRef`, `blobRef`, `cancelledRef`
5. Remove inline `startRecording`, `stopRecording`, `stopPlayback`, `handlePlayback`, `handleRerecord` functions
6. Replace `subState` references with `recordingState` equivalents throughout JSX
7. Update `handleSkip`:
   ```ts
   function handleSkip() {
     cancel()
     onSkip()
   }
   ```
8. Tab-hidden `visibilitychange` effect — update to use `cancel()` from hook:
   ```ts
   useEffect(() => {
     function handleVisibility() {
       if (document.hidden && (recordingState === 'recording' || recordingState === 'processing')) {
         cancel()
       }
     }
     document.addEventListener('visibilitychange', handleVisibility)
     return () => document.removeEventListener('visibilitychange', handleVisibility)
   }, [recordingState, cancel])
   ```
9. Keep the keyboard shortcuts effect and `isReplayingRef` / replay logic unchanged — these are unrelated to recording
10. `blobRef` was used for stable keyboard access to blob. Replace by reading `blob` directly from hook — the keyboard handler closes over the hook's `blob` from the current render. Since the effect re-registers on `[subState]` changes (which now becomes `[recordingState]`), this is safe.
11. Submit button: `disabled={recordingState !== 'stopped' || !blob}` — same semantics as before
12. The `useEffect` cleanup that called `stopPlayback()` on mount (`return () => stopPlayback()`) is now handled by the hook's own unmount cleanup — remove it

- [ ] **Step 6.2: Run the full test suite**

```bash
cd frontend && npx vitest run
```

Expected: all tests PASS

- [ ] **Step 6.3: Commit**

```bash
git add frontend/src/components/shadowing/ShadowingSpeakingPhase.tsx
git commit -m "refactor: ShadowingSpeakingPhase uses useAudioRecorder"
```

---

## Task 7: Final verification

- [ ] **Step 7.1: Run the full test suite one final time**

```bash
cd frontend && npx vitest run
```

Expected: all tests PASS

- [ ] **Step 7.2: Check `PronunciationReferee` line count is under 200**

```bash
wc -l frontend/src/components/study/exercises/PronunciationReferee.tsx
```

Expected: < 200

- [ ] **Step 7.3: Check no direct fetch calls remain in the three target components**

```bash
grep -n "fetch(" \
  frontend/src/components/study/StudySession.tsx \
  frontend/src/components/study/exercises/PronunciationReferee.tsx \
  frontend/src/components/shadowing/ShadowingSpeakingPhase.tsx
```

Expected: no output

- [ ] **Step 7.4: Check no MediaRecorder usage remains in `PronunciationReferee` or `ShadowingSpeakingPhase`**

```bash
grep -n "MediaRecorder\|getUserMedia\|ondataavailable" \
  frontend/src/components/study/exercises/PronunciationReferee.tsx \
  frontend/src/components/shadowing/ShadowingSpeakingPhase.tsx
```

Expected: no output
