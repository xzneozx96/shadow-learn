# Study Session Modal Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the route-based study session redirect with an in-place full-screen overlay so users can study vocabulary without leaving LessonView.

**Architecture:** Extract all session logic from `StudySessionPage` into a `StudySession` component that accepts `lessonId` and `onClose` as props. `LessonWorkbookPanel` renders the overlay inline (a fixed `div` covering the viewport) containing `StudySession`. `StudySessionPage` becomes a thin wrapper that still works for direct URL access.

**Tech Stack:** React, React Router (useParams/useNavigate for page wrapper only), Tailwind CSS, existing study exercise components, vitest + @testing-library/react.

---

## File Structure

| File | Change | Responsibility |
|------|--------|----------------|
| `frontend/src/components/study/StudySession.tsx` | **Create** | All study session logic/JSX, accepts `lessonId` + `onClose` props |
| `frontend/src/pages/StudySessionPage.tsx` | **Modify** | Thin wrapper: reads route params, renders `StudySession` |
| `frontend/src/components/lesson/LessonWorkbookPanel.tsx` | **Modify** | Add `studyOpen` state, render full-screen overlay with `StudySession` |
| `frontend/tests/StudySession.test.tsx` | **Create** | Tests for StudySession component |
| `frontend/tests/LessonWorkbookPanel.test.tsx` | **Modify** | Add tests for modal open/close behavior |

---

## Task 1: Extract StudySession component

**Files:**
- Create: `frontend/src/components/study/StudySession.tsx`
- Modify: `frontend/src/pages/StudySessionPage.tsx`

The `StudySession` component contains the full logic currently in `StudySessionPage` (lines 17–254), but:
- Takes `{ lessonId: string; onClose: () => void }` props instead of reading from `useParams`/`useNavigate`
- Removes the `Layout` wrapper (caller provides layout context)
- Replaces `navigate('/vocabulary')` in `SessionSummary.onBack` with `onClose()`
- Adds a close `×` button at the top-right (calls `onClose()`) so the user can dismiss at any phase

- [ ] **Step 1: Write failing test**

Create `frontend/tests/StudySession.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

// Mock all deps that StudySession pulls in
vi.mock('@/hooks/useVocabulary', () => ({
  useVocabulary: () => ({
    entriesByLesson: { lesson_1: [] },
    entries: [],
    isSaved: () => false,
    save: vi.fn(),
    remove: vi.fn(),
  }),
}))

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ db: null, keys: null }),
}))

vi.mock('@/hooks/useTTS', () => ({
  useTTS: () => ({ playTTS: vi.fn(), loadingText: null }),
}))

// Import after mocks
import { StudySession } from '@/components/study/StudySession'

describe('StudySession', () => {
  it('renders ModePicker on initial mount', () => {
    render(<StudySession lessonId="lesson_1" onClose={vi.fn()} />)
    // ModePicker renders a Start button
    expect(screen.getByRole('button', { name: /start/i })).toBeTruthy()
  })

  it('calls onClose when the × button is clicked', () => {
    const onClose = vi.fn()
    render(<StudySession lessonId="lesson_1" onClose={onClose} />)
    screen.getByRole('button', { name: /close/i }).click()
    expect(onClose).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd frontend && npx vitest run tests/StudySession.test.tsx
```

Expected: FAIL — `StudySession` does not exist yet.

- [ ] **Step 3: Create `StudySession` component**

Create `frontend/src/components/study/StudySession.tsx` (this is the full session logic extracted from `StudySessionPage`):

```tsx
import { useState } from 'react'
import { X } from 'lucide-react'
import { useVocabulary } from '@/hooks/useVocabulary'
import { useAuth } from '@/contexts/AuthContext'
import { useTTS } from '@/hooks/useTTS'
import { ModePicker, type ExerciseMode } from '@/components/study/ModePicker'
import { ProgressBar } from '@/components/study/ProgressBar'
import { SessionSummary } from '@/components/study/SessionSummary'
import { ClozeExercise } from '@/components/study/exercises/ClozeExercise'
import { DictationExercise } from '@/components/study/exercises/DictationExercise'
import { PinyinRecallExercise } from '@/components/study/exercises/PinyinRecallExercise'
import { PronunciationReferee } from '@/components/study/exercises/PronunciationReferee'
import { ReconstructionExercise } from '@/components/study/exercises/ReconstructionExercise'
import type { VocabEntry } from '@/types'

type Phase = 'picker' | 'session' | 'summary'

interface Question {
  type: Exclude<ExerciseMode, 'mixed'>
  entry: VocabEntry
  clozeData?: { story: string; blanks: string[] }
  pronunciationData?: { sentence: string; translation: string }
  reconstructionTokens?: string[]
}

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000'

function getReconstructionTokens(entry: VocabEntry, allEntries: VocabEntry[]): string[] {
  const segWords = allEntries
    .filter(e => e.sourceSegmentId === entry.sourceSegmentId)
    .map(e => e.word)
    .filter(w => entry.sourceSegmentChinese.includes(w))
  return [...new Set(segWords)]
}

function distributeExercises(
  _entries: VocabEntry[],
  mode: ExerciseMode,
  count: number,
  hasAzure: boolean,
): Exclude<ExerciseMode, 'mixed'>[] {
  const available: Exclude<ExerciseMode, 'mixed'>[] = ['cloze', 'dictation', 'pinyin', 'reconstruction']
  if (hasAzure) available.push('pronunciation')

  if (mode !== 'mixed') {
    return Array.from({ length: count }, () => mode as Exclude<ExerciseMode, 'mixed'>)
  }

  const result: Exclude<ExerciseMode, 'mixed'>[] = []
  if (count >= available.length) {
    result.push(...available)
  }
  while (result.length < count) {
    result.push(available[Math.floor(Math.random() * available.length)])
  }
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result.slice(0, count)
}

interface StudySessionProps {
  lessonId: string
  onClose: () => void
}

export function StudySession({ lessonId, onClose }: StudySessionProps) {
  const { entriesByLesson } = useVocabulary()
  const { db, keys } = useAuth()
  const { playTTS } = useTTS(db, keys)

  const entries = entriesByLesson[lessonId] ?? []
  const lessonTitle = entries[0]?.sourceLessonTitle ?? 'Unknown Lesson'

  const [phase, setPhase] = useState<Phase>('picker')
  const [mode, setMode] = useState<ExerciseMode>('mixed')
  const [count, setCount] = useState(10)
  const [questions, setQuestions] = useState<Question[]>([])
  const [current, setCurrent] = useState(0)
  const [results, setResults] = useState<{ entry: VocabEntry; correct: boolean }[]>([])
  const [loading, setLoading] = useState(false)
  const [azureBanner, setAzureBanner] = useState(false)

  const hasAzure = Boolean(keys?.azureSpeechKey)

  async function fetchAIContent(types: Exclude<ExerciseMode, 'mixed'>[], pool: VocabEntry[]) {
    const clozeWords = pool.slice(0, 5).map(e => ({
      word: e.word, pinyin: e.pinyin, meaning: e.meaning, usage: e.usage,
    }))
    const pronWords = pool.map(e => ({
      word: e.word, pinyin: e.pinyin, meaning: e.meaning, usage: e.usage,
    }))
    const pronCount = types.filter(t => t === 'pronunciation').length
    const clozeCount = types.filter(t => t === 'cloze').length

    const [clozeResp, pronResp] = await Promise.all([
      clozeCount > 0
        ? fetch(`${API_BASE}/api/quiz/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              openai_api_key: keys?.openaiApiKey,
              words: clozeWords,
              exercise_type: 'cloze',
              story_count: clozeCount,
            }),
          }).then(r => r.json())
        : Promise.resolve({ exercises: [] }),
      pronCount > 0
        ? fetch(`${API_BASE}/api/quiz/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              openai_api_key: keys?.openaiApiKey,
              words: pronWords,
              exercise_type: 'pronunciation_sentence',
              count: pronCount,
            }),
          }).then(r => r.json())
        : Promise.resolve({ exercises: [] }),
    ])

    return { clozeExercises: clozeResp.exercises ?? [], pronExercises: pronResp.exercises ?? [] }
  }

  async function handleStart() {
    if (entries.length === 0) return
    setLoading(true)

    const types = distributeExercises(entries, mode, count, hasAzure)
    if (mode === 'mixed' && !hasAzure) setAzureBanner(true)

    const pool = [...entries].sort(() => Math.random() - 0.5)

    try {
      const { clozeExercises, pronExercises } = await fetchAIContent(types, pool)
      let clozeIdx = 0
      let pronIdx = 0

      const qs: Question[] = types.map((type, i) => {
        const entry = pool[i % pool.length]
        const q: Question = { type, entry }
        if (type === 'cloze') q.clozeData = clozeExercises[clozeIdx++]
        if (type === 'pronunciation') q.pronunciationData = pronExercises[pronIdx++]
        if (type === 'reconstruction') q.reconstructionTokens = getReconstructionTokens(entry, entries)
        return q
      })

      setQuestions(qs)
      setCurrent(0)
      setResults([])
      setPhase('session')
    }
    catch {
      const fallbackTypes = types.map(t => (t === 'cloze' ? 'pinyin' : t)) as Exclude<ExerciseMode, 'mixed'>[]
      const qs: Question[] = fallbackTypes.map((type, i) => {
        const entry = pool[i % pool.length]
        const q: Question = { type, entry }
        if (type === 'reconstruction') q.reconstructionTokens = getReconstructionTokens(entry, entries)
        return q
      })
      setQuestions(qs)
      setCurrent(0)
      setResults([])
      setPhase('session')
    }
    finally {
      setLoading(false)
    }
  }

  function handleNext(correct: boolean) {
    const q = questions[current]
    setResults(r => [...r, { entry: q.entry, correct }])
    if (current + 1 >= questions.length) {
      setPhase('summary')
    }
    else {
      setCurrent(c => c + 1)
    }
  }

  const q = questions[current]

  return (
    <div className="relative min-h-full">
      {/* Close button — always visible */}
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute right-4 top-4 z-10 rounded-md p-1 text-muted-foreground hover:text-foreground transition-colors"
      >
        <X className="size-5" />
      </button>

      <div className="max-w-2xl mx-auto px-6 py-10 pb-20">
        {/* Picker */}
        {phase === 'picker' && (
          <ModePicker
            selected={mode}
            onSelect={setMode}
            count={count}
            onCountChange={setCount}
            onStart={() => void handleStart()}
            lessonTitle={lessonTitle}
          />
        )}

        {loading && (
          <div className="text-center py-20 text-muted-foreground text-sm">Generating exercises…</div>
        )}

        {/* Session */}
        {phase === 'session' && q && !loading && (
          <>
            {azureBanner && (
              <div className="text-sm text-amber-400 bg-amber-500/8 border border-amber-500/20 rounded-md px-4 py-3 mb-4">
                Pronunciation exercises are unavailable — add an Azure Speech Key in Settings.
              </div>
            )}
            <ProgressBar current={current} total={questions.length} />
            {q.type === 'pinyin' && (
              <PinyinRecallExercise key={current} entry={q.entry} onNext={handleNext} playTTS={playTTS} />
            )}
            {q.type === 'dictation' && (
              <DictationExercise key={current} entry={q.entry} onNext={handleNext} playTTS={playTTS} />
            )}
            {q.type === 'cloze' && q.clozeData && (
              <ClozeExercise key={current} question={q.clozeData} entries={entries} onNext={handleNext} />
            )}
            {q.type === 'pronunciation' && q.pronunciationData && (
              <PronunciationReferee
                key={current}
                sentence={q.pronunciationData}
                apiBaseUrl={API_BASE}
                azureKey={keys?.azureSpeechKey ?? ''}
                azureRegion={keys?.azureSpeechRegion ?? 'eastus'}
                onNext={handleNext}
              />
            )}
            {q.type === 'reconstruction' && (
              <ReconstructionExercise
                key={current}
                entry={q.entry}
                words={q.reconstructionTokens ?? [q.entry.word]}
                onNext={handleNext}
              />
            )}
          </>
        )}

        {/* Summary */}
        {phase === 'summary' && (
          <SessionSummary
            results={results}
            onStudyAgain={() => setPhase('picker')}
            onBack={onClose}
          />
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Update StudySessionPage to be a thin wrapper**

Replace the contents of `frontend/src/pages/StudySessionPage.tsx` with:

```tsx
import { useNavigate, useParams } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { StudySession } from '@/components/study/StudySession'

export function StudySessionPage() {
  const { lessonId } = useParams<{ lessonId: string }>()
  const navigate = useNavigate()

  return (
    <Layout>
      <StudySession lessonId={lessonId!} onClose={() => navigate(-1)} />
    </Layout>
  )
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd frontend && npx vitest run tests/StudySession.test.tsx
```

Expected: 2 passed

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/study/StudySession.tsx \
        frontend/src/pages/StudySessionPage.tsx \
        frontend/tests/StudySession.test.tsx
git commit -m "refactor: extract StudySession component with onClose prop"
```

---

## Task 2: Open study in full-screen overlay from LessonWorkbookPanel

**Files:**
- Modify: `frontend/src/components/lesson/LessonWorkbookPanel.tsx`
- Modify: `frontend/tests/LessonWorkbookPanel.test.tsx`

Replace the `navigate(...)` call on the Study button with a local `studyOpen` state. Render a fixed full-screen overlay containing `<StudySession>` when `studyOpen` is true.

- [ ] **Step 1: Write failing tests**

Add to `frontend/tests/LessonWorkbookPanel.test.tsx` (after existing mocks, before the `describe` block):

```tsx
// Mock StudySession so we don't need to stub all its dependencies
vi.mock('@/components/study/StudySession', () => ({
  StudySession: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="study-session">
      <button type="button" aria-label="Close" onClick={onClose}>Close</button>
    </div>
  ),
}))
```

Delete these two now-stale tests from the existing `describe` block (they assert behavior the plan removes):
- `'shows tooltip text when Study button is disabled'` — Tooltip is removed
- `'Study button navigates to study session on click'` — navigation is replaced by overlay

Add these two tests inside the existing `describe('LessonWorkbookPanel')` block:

```tsx
it('shows study session overlay when Study button is clicked', () => {
  mockVocab = { entriesByLesson: { lesson_1: mockEntries } }
  render(<LessonWorkbookPanel lessonId="lesson_1" />)
  expect(screen.queryByTestId('study-session')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: /study this lesson/i }))
  expect(screen.getByTestId('study-session')).toBeTruthy()
})

it('closes study session overlay when StudySession calls onClose', () => {
  mockVocab = { entriesByLesson: { lesson_1: mockEntries } }
  render(<LessonWorkbookPanel lessonId="lesson_1" />)
  fireEvent.click(screen.getByRole('button', { name: /study this lesson/i }))
  // Simulate onClose being called from within StudySession
  fireEvent.click(screen.getByRole('button', { name: /close/i }))
  expect(screen.queryByTestId('study-session')).toBeNull()
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend && npx vitest run tests/LessonWorkbookPanel.test.tsx
```

Expected: the 2 new tests FAIL (navigation is used instead of overlay).

- [ ] **Step 3: Update LessonWorkbookPanel**

Replace the contents of `frontend/src/components/lesson/LessonWorkbookPanel.tsx`:

```tsx
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { StudySession } from '@/components/study/StudySession'
import { useVocabulary } from '@/hooks/useVocabulary'

interface LessonWorkbookPanelProps {
  lessonId: string
}

export function LessonWorkbookPanel({ lessonId }: LessonWorkbookPanelProps) {
  const { entriesByLesson } = useVocabulary()
  const navigate = useNavigate()
  const entries = entriesByLesson[lessonId] ?? []
  const count = entries.length
  const [studyOpen, setStudyOpen] = useState(false)

  return (
    <>
      {/* Full-screen study overlay */}
      {studyOpen && (
        <div className="fixed inset-0 z-50 overflow-auto bg-background">
          <StudySession lessonId={lessonId} onClose={() => setStudyOpen(false)} />
        </div>
      )}

      <div className="flex h-full flex-col">
        {/* Sub-header: count + "View all" link */}
        <div className="flex h-14 items-center justify-between border-b border-border px-3 py-2">
          <span className="text-sm text-muted-foreground">
            {count}
            {' '}
            {count === 1 ? 'word' : 'words'}
            {' '}
            saved
          </span>
          <Link
            to="/vocabulary"
            className="text-sm text-foreground transition-colors hover:text-foreground/70"
          >
            View all →
          </Link>
        </div>

        {/* Word grid or empty state */}
        {count === 0
          ? (
              <div className="flex flex-1 items-center justify-center px-6 text-center">
                <p className="text-sm text-muted-foreground">
                  Hover any word in the transcript and tap the bookmark to save it here
                </p>
              </div>
            )
          : (
              <ScrollArea className="min-h-0 flex-1 p-3">
                <div className="grid grid-cols-2 gap-2">
                  {entries.map(entry => (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() =>
                        navigate(`/lesson/${lessonId}?segmentId=${entry.sourceSegmentId}`)}
                      className="cursor-pointer rounded-lg border border-border bg-card p-3 text-left transition-colors hover:bg-white/10 hover:border-white/15"
                    >
                      <p className="text-2xl font-bold text-foreground">{entry.word}</p>
                      <p className="text-sm text-muted-foreground">{entry.pinyin}</p>
                      <p className="line-clamp-2 text-sm text-muted-foreground/70">{entry.meaning}</p>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            )}

        {/* Study button — pinned to bottom */}
        <div className="border-t border-border p-3">
          <Button
            className="w-full"
            disabled={count === 0}
            onClick={() => setStudyOpen(true)}
          >
            Study This Lesson →
          </Button>
        </div>
      </div>
    </>
  )
}
```

Note: the `useNavigate` import is still needed for word-card clicks. The `Tooltip`/`TooltipProvider` imports are intentionally removed — the disabled button already communicates its state visually.

- [ ] **Step 4: Run all tests**

```bash
cd frontend && npx vitest run tests/LessonWorkbookPanel.test.tsx tests/StudySession.test.tsx
```

Expected: all tests pass (9 existing + 2 new LessonWorkbookPanel + 2 StudySession = 13 total).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/lesson/LessonWorkbookPanel.tsx \
        frontend/tests/LessonWorkbookPanel.test.tsx
git commit -m "feat: open study session in full-screen overlay from Workbook panel"
```
