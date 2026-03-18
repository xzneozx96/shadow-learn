# Exercise Components Redesign Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign all 5 study exercise components and ProgressBar to a consistent three-zone card layout (Header · Body · Footer) using the existing OKLCH dark glass theme and shadcn/ui components exclusively.

**Architecture:** A new shared `ExerciseCard` shell component wraps every exercise, enforcing a consistent visual structure (header with type label + counter, padded body, bordered footer). Each exercise component fills only the body and footer slots — no layout logic lives inside them. Logic and test contracts are unchanged.

**Tech Stack:** React, TypeScript, Tailwind CSS v4, shadcn/ui (`Button`, `Input`) via Base UI, `cn` from `@/lib/utils`, OKLCH design tokens from `index.css`.

---

## Chunk 1: Shared Shell + ProgressBar + PinyinRecall

### Task 1: Create `ExerciseCard` shared shell

**Files:**
- Create: `frontend/src/components/study/exercises/ExerciseCard.tsx`
- Create: `frontend/tests/ExerciseCard.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/tests/ExerciseCard.test.tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { ExerciseCard } from '@/components/study/exercises/ExerciseCard'

describe('ExerciseCard', () => {
  it('renders type label and progress in header', () => {
    render(
      <ExerciseCard type="Pinyin Recall" progress="3 / 10" footer={<span>footer</span>}>
        <span>body</span>
      </ExerciseCard>,
    )
    expect(screen.getByText('Pinyin Recall')).toBeInTheDocument()
    expect(screen.getByText('3 / 10')).toBeInTheDocument()
  })

  it('renders body children', () => {
    render(
      <ExerciseCard type="Dictation" progress="1 / 10" footer={null}>
        <span data-testid="body-content">hello</span>
      </ExerciseCard>,
    )
    expect(screen.getByTestId('body-content')).toBeInTheDocument()
  })

  it('renders footer when provided', () => {
    render(
      <ExerciseCard type="Cloze" progress="2 / 10" footer={<button>Check</button>}>
        <span>body</span>
      </ExerciseCard>,
    )
    expect(screen.getByRole('button', { name: /check/i })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd frontend && npx vitest run tests/ExerciseCard.test.tsx
```

Expected: FAIL — `ExerciseCard` not found.

- [ ] **Step 3: Implement `ExerciseCard`**

```tsx
// frontend/src/components/study/exercises/ExerciseCard.tsx
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface ExerciseCardProps {
  type: string
  progress: string
  footer: ReactNode
  children: ReactNode
  className?: string
}

export function ExerciseCard({ type, progress, footer, children, className }: ExerciseCardProps) {
  return (
    <div className={cn('rounded-xl border border-border bg-card overflow-hidden', className)}>
      {/* Header */}
      <div className="flex items-center gap-2.5 px-[18px] py-3 border-b border-border">
        <div className="size-[7px] rounded-full bg-muted-foreground/50 shrink-0" />
        <span className="text-[11px] font-bold uppercase tracking-[0.09em] text-foreground/90">
          {type}
        </span>
        <span className="text-[11px] text-muted-foreground ml-auto">{progress}</span>
      </div>
      {/* Body */}
      <div className="px-[18px] py-5">{children}</div>
      {/* Footer */}
      {footer !== null && (
        <div className="border-t border-border">{footer}</div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
cd frontend && npx vitest run tests/ExerciseCard.test.tsx
```

Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/study/exercises/ExerciseCard.tsx frontend/tests/ExerciseCard.test.tsx
git commit -m "feat(exercises): add ExerciseCard shared shell component"
```

---

### Task 2: Update `ProgressBar`

**Files:**
- Modify: `frontend/src/components/study/ProgressBar.tsx`

No behavioral changes — only the track height increases from `h-0.5` to `h-1`.

- [ ] **Step 1: Confirm existing tests pass before touching anything**

```bash
cd frontend && npx vitest run tests/StudySession.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Update `ProgressBar`**

Replace the entire file content:

```tsx
// frontend/src/components/study/ProgressBar.tsx
interface ProgressBarProps { current: number, total: number }

export function ProgressBar({ current, total }: ProgressBarProps) {
  const pct = total > 0 ? (current / total) * 100 : 0
  return (
    <div className="flex items-center gap-3 mb-6">
      <div className="flex-1 h-1 bg-border rounded-full overflow-hidden">
        <div
          className="h-full bg-foreground/60 rounded-full transition-all duration-400"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-sm text-muted-foreground whitespace-nowrap">{current} / {total}</span>
    </div>
  )
}
```

- [ ] **Step 3: Run StudySession tests**

```bash
cd frontend && npx vitest run tests/StudySession.test.tsx
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/study/ProgressBar.tsx
git commit -m "fix(exercises): increase ProgressBar track height to h-1"
```

---

### Task 3: Redesign `PinyinRecallExercise`

**Files:**
- Modify: `frontend/src/components/study/exercises/PinyinRecallExercise.tsx`
- Test: `frontend/tests/PinyinRecallExercise.test.tsx` (existing — must stay green)

- [ ] **Step 1: Run existing tests to confirm baseline**

```bash
cd frontend && npx vitest run tests/PinyinRecallExercise.test.tsx
```

Expected: PASS — 2 tests.

- [ ] **Step 2: Rewrite `PinyinRecallExercise`**

```tsx
// frontend/src/components/study/exercises/PinyinRecallExercise.tsx
import type { VocabEntry } from '@/types'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ExerciseCard } from '@/components/study/exercises/ExerciseCard'
import { comparePinyin } from '@/lib/pinyin-utils'
import { cn } from '@/lib/utils'

interface Props {
  entry: VocabEntry
  progress?: string
  onNext: (correct: boolean) => void
  playTTS: (text: string) => Promise<void>
}

export function PinyinRecallExercise({ entry, progress = '', onNext, playTTS }: Props) {
  const [value, setValue] = useState('')
  const [checked, setChecked] = useState(false)
  const correct = comparePinyin(value, entry.pinyin)

  function handleCheck() {
    if (!value.trim())
      return
    setChecked(true)
    if (correct)
      void playTTS(entry.word)
  }

  const footer = (
    <div className="flex items-center justify-center gap-3 p-3">
      <Button variant="ghost" size="sm" onClick={() => onNext(false)}>Skip</Button>
      {!checked
        ? <Button size="sm" onClick={handleCheck}>Check →</Button>
        : <Button size="sm" onClick={() => onNext(correct)}>Next →</Button>}
    </div>
  )

  return (
    <ExerciseCard type="Pinyin Recall" progress={progress} footer={footer}>
      {/* Word display */}
      <div className="text-center py-2 pb-5">
        <div className="text-[52px] font-extrabold tracking-widest leading-none text-foreground">
          {entry.word}
        </div>
        <p className="text-sm text-muted-foreground mt-3">{entry.meaning}</p>
      </div>

      {/* Input */}
      <Input
        className="text-center"
        placeholder="Type pinyin with tones, e.g. jīntiān or jin1tian1…"
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && !checked && handleCheck()}
        disabled={checked}
      />
      <p className="text-[11px] text-muted-foreground/50 text-center mt-1.5">
        Accepts tone marks or tone numbers
      </p>

      {/* Feedback */}
      {checked && (
        <div className={cn(
          'mt-4 rounded-lg border px-4 py-3 text-sm',
          correct
            ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400'
            : 'border-destructive/25 bg-destructive/10 text-destructive',
        )}
        >
          {correct ? '✓ Correct!' : `✗ Incorrect — ${entry.pinyin}`}
        </div>
      )}
    </ExerciseCard>
  )
}
```

- [ ] **Step 3: Update callers — `StudySession.tsx` now passes `progress` prop**

In `frontend/src/components/study/StudySession.tsx`, find the `PinyinRecallExercise` usage and add the `progress` prop:

```tsx
// Before
<PinyinRecallExercise key={current} entry={q.entry} onNext={handleNext} playTTS={playTTS} />

// After
<PinyinRecallExercise
  key={current}
  entry={q.entry}
  progress={`${current + 1} / ${questions.length}`}
  onNext={handleNext}
  playTTS={playTTS}
/>
```

- [ ] **Step 4: Run exercise tests**

```bash
cd frontend && npx vitest run tests/PinyinRecallExercise.test.tsx tests/StudySession.test.tsx
```

Expected: PASS — all 4 tests. The `progress` prop is optional (`progress?: string`) so the existing test renders without it correctly.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/study/exercises/PinyinRecallExercise.tsx \
        frontend/src/components/study/StudySession.tsx
git commit -m "feat(exercises): redesign PinyinRecallExercise with ExerciseCard shell"
```

---

## Chunk 2: Dictation + Cloze + Reconstruction

### Task 4: Redesign `DictationExercise`

**Files:**
- Modify: `frontend/src/components/study/exercises/DictationExercise.tsx`
- Modify: `frontend/src/components/study/StudySession.tsx` (add `progress` prop)

- [ ] **Step 1: Rewrite `DictationExercise`**

```tsx
// frontend/src/components/study/exercises/DictationExercise.tsx
import type { VocabEntry } from '@/types'
import { Volume2 } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ExerciseCard } from '@/components/study/exercises/ExerciseCard'
import { cn } from '@/lib/utils'

interface Props {
  entry: VocabEntry
  progress?: string
  onNext: (correct: boolean) => void
  playTTS: (text: string) => Promise<void>
}

export function DictationExercise({ entry, progress = '', onNext, playTTS }: Props) {
  const [value, setValue] = useState('')
  const [checked, setChecked] = useState(false)
  const [pinyinMode, setPinyinMode] = useState(false)
  const expected = pinyinMode ? entry.pinyin : entry.sourceSegmentChinese
  const correct = value.trim() === expected.trim()

  const footer = (
    <div className="flex items-center justify-center gap-3 p-3">
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" onClick={() => onNext(false)}>Skip</Button>
        <Button variant="ghost" size="sm" onClick={() => setPinyinMode(m => !m)}>
          {pinyinMode ? 'Characters' : 'Pinyin mode'}
        </Button>
      </div>
      {!checked
        ? <Button size="sm" onClick={() => setChecked(true)}>Check →</Button>
        : <Button size="sm" onClick={() => onNext(correct)}>Next →</Button>}
    </div>
  )

  return (
    <ExerciseCard type="Dictation" progress={progress} footer={footer}>
      <p className="text-sm text-muted-foreground mb-4">
        Listen carefully and type what you hear in Chinese.
      </p>

      {/* TTS play button */}
      <button
        type="button"
        aria-label="Play audio"
        className="flex items-center justify-center mx-auto mb-5 size-14 rounded-full border border-border bg-secondary hover:bg-accent transition-colors"
        onClick={() => void playTTS(entry.sourceSegmentChinese)}
      >
        <Volume2 className="size-5 text-muted-foreground" />
      </button>

      {/* Input */}
      <Input
        placeholder={pinyinMode ? 'Type pinyin…' : 'Type what you heard…'}
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && !checked && setChecked(true)}
        disabled={checked}
      />

      {/* Feedback */}
      {checked && (
        <div className={cn(
          'mt-4 rounded-lg border px-4 py-3 text-sm',
          correct
            ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400'
            : 'border-destructive/25 bg-destructive/10 text-destructive',
        )}
        >
          {correct ? '✓ Correct!' : `✗ Incorrect — ${expected}`}
        </div>
      )}
    </ExerciseCard>
  )
}
```

- [ ] **Step 2: Update `StudySession.tsx` — add `progress` prop to `DictationExercise`**

```tsx
// Before
<DictationExercise key={current} entry={q.entry} onNext={handleNext} playTTS={playTTS} />

// After
<DictationExercise
  key={current}
  entry={q.entry}
  progress={`${current + 1} / ${questions.length}`}
  onNext={handleNext}
  playTTS={playTTS}
/>
```

- [ ] **Step 3: Run tests**

```bash
cd frontend && npx vitest run tests/StudySession.test.tsx
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/study/exercises/DictationExercise.tsx \
        frontend/src/components/study/StudySession.tsx
git commit -m "feat(exercises): redesign DictationExercise with ExerciseCard shell"
```

---

### Task 5: Redesign `ClozeExercise`

**Files:**
- Modify: `frontend/src/components/study/exercises/ClozeExercise.tsx`
- Modify: `frontend/src/components/study/StudySession.tsx` (add `progress` prop)

- [ ] **Step 1: Rewrite `ClozeExercise`**

```tsx
// frontend/src/components/study/exercises/ClozeExercise.tsx
import type { VocabEntry } from '@/types'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { ExerciseCard } from '@/components/study/exercises/ExerciseCard'
import { cn } from '@/lib/utils'

interface ClozeQuestion {
  story: string   // "小明说{{今天}}他要去..."
  blanks: string[]
}

interface Props {
  question: ClozeQuestion
  entries: VocabEntry[]
  progress?: string
  onNext: (correct: boolean) => void
}

function parseStory(story: string): { text: string, blank: string | null }[] {
  const parts: { text: string, blank: string | null }[] = []
  const regex = /\{\{([^}]+)\}\}/g
  let last = 0
  const matches = [...story.matchAll(regex)]
  for (const m of matches) {
    if (m.index !== undefined && m.index > last)
      parts.push({ text: story.slice(last, m.index), blank: null })
    parts.push({ text: '', blank: m[1] })
    if (m.index !== undefined)
      last = m.index + m[0].length
  }
  if (last < story.length)
    parts.push({ text: story.slice(last), blank: null })
  return parts
}

export function ClozeExercise({ question, entries, progress = '', onNext }: Props) {
  const parts = parseStory(question.story)
  const [answers, setAnswers] = useState<Record<number, string>>({})
  const [checked, setChecked] = useState(false)
  const firstInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { firstInputRef.current?.focus() }, [])

  let blankIdx = 0
  const blankIndices: number[] = []
  parts.forEach((p, i) => { if (p.blank) blankIndices.push(i) })

  const allCorrect = blankIndices.every(i => answers[i]?.trim() === parts[i].blank)

  function findEntry(blank: string) {
    return entries.find(e => e.word === blank)
  }

  const footer = (
    <div className="flex items-center justify-center gap-3 px-[18px] py-3">
      <Button variant="ghost" size="sm" onClick={() => onNext(false)}>Skip</Button>
      {!checked
        ? <Button size="sm" onClick={() => setChecked(true)}>Check →</Button>
        : <Button size="sm" onClick={() => onNext(allCorrect)}>Next →</Button>}
    </div>
  )

  return (
    <ExerciseCard type="Scenario Cloze" progress={progress} footer={footer}>
      {/* Story with inline inputs */}
      <div className="rounded-lg border border-border bg-muted/20 px-4 py-3 text-sm leading-[2.4] text-foreground/90 mb-0">
        {parts.map((part, i) => {
          if (!part.blank)
            return <span key={i}>{part.text}</span>
          const idx = blankIdx++
          const correct = answers[i]?.trim() === part.blank
          return (
            <input
              key={i}
              ref={idx === 0 ? firstInputRef : undefined}
              className={cn(
                'inline-block w-14 text-center text-sm border-0 border-b bg-transparent mx-1 px-1 outline-none transition-colors',
                checked
                  ? correct
                    ? 'border-emerald-500/50 text-emerald-400'
                    : 'border-destructive/50 text-destructive'
                  : 'border-border/60 focus:border-foreground/40',
              )}
              value={answers[i] ?? ''}
              onChange={e => setAnswers(a => ({ ...a, [i]: e.target.value }))}
              disabled={checked}
              placeholder="…"
            />
          )
        })}
      </div>

      {/* Per-blank feedback (post-check) */}
      {checked && blankIndices.map((i) => {
        const blank = parts[i].blank!
        const entry = findEntry(blank)
        const correct = answers[i]?.trim() === blank
        return (
          <div
            key={i}
            className={cn(
              'mt-3 rounded-lg border px-4 py-3 text-sm flex items-start gap-2.5',
              correct
                ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400'
                : 'border-destructive/25 bg-destructive/10 text-destructive',
            )}
          >
            <span className="shrink-0">{correct ? '✓' : '✗'}</span>
            <div>
              <span className="font-semibold">{blank}</span>
              {' — '}
              {correct ? 'correct!' : `expected "${blank}"`}
              {entry && (
                <Link
                  to={`/lesson/${entry.sourceLessonId}?segmentId=${entry.sourceSegmentId}`}
                  className="block text-sm mt-0.5 opacity-60 hover:opacity-100"
                >
                  📍 View in video →
                </Link>
              )}
            </div>
          </div>
        )
      })}
    </ExerciseCard>
  )
}
```

- [ ] **Step 2: Update `StudySession.tsx` — add `progress` prop to `ClozeExercise`**

```tsx
// Before
<ClozeExercise key={current} question={q.clozeData} entries={entries} onNext={handleNext} />

// After
<ClozeExercise
  key={current}
  question={q.clozeData}
  entries={entries}
  progress={`${current + 1} / ${questions.length}`}
  onNext={handleNext}
/>
```

- [ ] **Step 3: Run tests**

```bash
cd frontend && npx vitest run tests/StudySession.test.tsx
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/study/exercises/ClozeExercise.tsx \
        frontend/src/components/study/StudySession.tsx
git commit -m "feat(exercises): redesign ClozeExercise with ExerciseCard shell"
```

---

### Task 6: Redesign `ReconstructionExercise`

**Files:**
- Modify: `frontend/src/components/study/exercises/ReconstructionExercise.tsx`
- Modify: `frontend/src/components/study/StudySession.tsx` (add `progress` prop)
- Test: `frontend/tests/ReconstructionExercise.test.ts` (existing — must stay green)

- [ ] **Step 1: Run existing tests**

```bash
cd frontend && npx vitest run tests/ReconstructionExercise.test.ts
```

Expected: PASS (tests `getActiveChips` from `study-utils` — unaffected by this change).

- [ ] **Step 2: Rewrite `ReconstructionExercise`**

```tsx
// frontend/src/components/study/exercises/ReconstructionExercise.tsx
import type { VocabEntry } from '@/types'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ExerciseCard } from '@/components/study/exercises/ExerciseCard'
import { charDiff, getActiveChips, shuffleArray } from '@/lib/study-utils'
import { cn } from '@/lib/utils'

interface Props {
  entry: VocabEntry
  words: string[]
  progress?: string
  onNext: (correct: boolean) => void
}

export function ReconstructionExercise({ entry, words, progress = '', onNext }: Props) {
  const chips = useMemo(() => shuffleArray(words), [words])
  const [value, setValue] = useState('')
  const [checked, setChecked] = useState(false)
  const active = getActiveChips(chips, value)
  const correct = value.trim() === entry.sourceSegmentChinese.trim()
  const diff = checked ? charDiff(value, entry.sourceSegmentChinese) : null

  const footer = (
    <div className="flex items-center justify-center gap-3 p-3">
      <Button variant="ghost" size="sm" onClick={() => onNext(false)}>Skip</Button>
      {!checked
        ? <Button size="sm" onClick={() => setChecked(true)}>Check →</Button>
        : <Button size="sm" onClick={() => onNext(correct)}>Next →</Button>}
    </div>
  )

  return (
    <ExerciseCard type="Sentence Reconstruction" progress={progress} footer={footer}>
      {/* Source context link */}
      <Link
        to={`/lesson/${entry.sourceLessonId}?segmentId=${entry.sourceSegmentId}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground border border-border/50 rounded-full px-2.5 py-1 mb-3 hover:text-foreground transition-colors"
      >
        📍 {entry.sourceLessonTitle} — where you saved {entry.word}
      </Link>

      <p className="text-sm text-muted-foreground mb-3">Type the words in correct order.</p>

      {/* Word chips */}
      <div className="flex flex-wrap gap-2 mb-4">
        {chips.map((chip, i) => (
          <span
            key={i}
            className={cn(
              'px-3 py-1.5 rounded-md text-sm font-semibold border border-border bg-secondary transition-opacity',
              !active[i] && 'opacity-25',
            )}
          >
            {chip}
          </span>
        ))}
      </div>

      {/* Input */}
      <Input
        className="text-base tracking-wide"
        placeholder="Type the sentence…"
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && !checked && setChecked(true)}
        disabled={checked}
      />

      {/* Char diff (post-check) */}
      {diff && (
        <div className="mt-3 px-3 py-2 rounded-lg bg-muted/30 text-lg font-bold tracking-wider">
          {diff.map((d, i) => (
            <span key={i} className={d.ok ? 'text-emerald-400' : 'text-destructive'}>{d.char}</span>
          ))}
        </div>
      )}
    </ExerciseCard>
  )
}
```

- [ ] **Step 3: Update `StudySession.tsx` — add `progress` prop to `ReconstructionExercise`**

```tsx
// Before
<ReconstructionExercise
  key={current}
  entry={q.entry}
  words={q.reconstructionTokens ?? [q.entry.word]}
  onNext={handleNext}
/>

// After
<ReconstructionExercise
  key={current}
  entry={q.entry}
  words={q.reconstructionTokens ?? [q.entry.word]}
  progress={`${current + 1} / ${questions.length}`}
  onNext={handleNext}
/>
```

- [ ] **Step 4: Run tests**

```bash
cd frontend && npx vitest run tests/ReconstructionExercise.test.ts tests/StudySession.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/study/exercises/ReconstructionExercise.tsx \
        frontend/src/components/study/StudySession.tsx
git commit -m "feat(exercises): redesign ReconstructionExercise with ExerciseCard shell"
```

---

## Chunk 3: PronunciationReferee + Final Verification

### Task 7: Redesign `PronunciationReferee`

**Files:**
- Modify: `frontend/src/components/study/exercises/PronunciationReferee.tsx`
- Modify: `frontend/src/components/study/StudySession.tsx` (add `progress` prop)

The score UI mirrors `ShadowingRevealPhase > SpeakingScores` exactly: hero accuracy + verdict, 3-col secondary grid, word breakdown with bars + error pills.

- [ ] **Step 1: Rewrite `PronunciationReferee`**

```tsx
// frontend/src/components/study/exercises/PronunciationReferee.tsx
import type { PronunciationAssessResult } from '@/types'
import { Pause, Play } from 'lucide-react'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ExerciseCard } from '@/components/study/exercises/ExerciseCard'
import { cn } from '@/lib/utils'

interface PronunciationSentence { sentence: string, translation: string }

interface Props {
  sentence: PronunciationSentence
  apiBaseUrl: string
  azureKey: string
  azureRegion: string
  progress?: string
  onNext: (correct: boolean) => void
}

type RecordingState = 'idle' | 'recording' | 'stopped'
type AssessResult = PronunciationAssessResult

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

export function PronunciationReferee({ sentence, apiBaseUrl, azureKey, azureRegion, progress = '', onNext }: Props) {
  const [state, setState] = useState<RecordingState>('idle')
  const [attempt, setAttempt] = useState(0)
  const [blob, setBlob] = useState<Blob | null>(null)
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null)
  const [result, setResult] = useState<AssessResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const mediaRef = useRef<MediaRecorder | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const chunksRef = useRef<Blob[]>([])

  async function startRecording() {
    if (audioRef.current) {
      audioRef.current.pause()
      setIsPlaying(false)
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
    chunksRef.current = []
    recorder.ondataavailable = e => chunksRef.current.push(e.data)
    recorder.onstop = () => {
      const b = new Blob(chunksRef.current, { type: 'audio/webm' })
      setBlob(b)
      if (playbackUrl) URL.revokeObjectURL(playbackUrl)
      setPlaybackUrl(URL.createObjectURL(b))
      stream.getTracks().forEach(t => t.stop())
    }
    recorder.start()
    mediaRef.current = recorder
    setState('recording')
    setAttempt(a => a + 1)
    setResult(null)
    setError(null)
  }

  function stopRecording() {
    mediaRef.current?.stop()
    setState('stopped')
  }

  async function handleSubmit() {
    if (!blob) return
    setSubmitting(true)
    setError(null)
    try {
      const form = new FormData()
      form.append('audio', blob, 'recording.webm')
      form.append('reference_text', sentence.sentence)
      form.append('language', 'zh-CN')
      form.append('azure_key', azureKey)
      form.append('azure_region', azureRegion)
      const resp = await fetch(`${apiBaseUrl}/api/pronunciation/assess`, { method: 'POST', body: form })
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

  function togglePlayback() {
    if (!playbackUrl) return
    if (isPlaying) {
      audioRef.current?.pause()
      setIsPlaying(false)
      return
    }
    const audio = new Audio(playbackUrl)
    audioRef.current = audio
    audio.onplay = () => setIsPlaying(true)
    audio.onended = () => { setIsPlaying(false); audioRef.current = null }
    audio.onpause = () => setIsPlaying(false)
    audio.play().catch(console.error)
  }

  // Footer hidden once results are shown — result actions replace it
  const footer = result ? null : (
    <div className="flex items-center justify-center gap-3 p-3">
      <Button variant="ghost" size="sm" onClick={() => onNext(false)}>Skip</Button>
      <Button
        size="sm"
        disabled={!blob || submitting}
        onClick={() => void handleSubmit()}
      >
        {submitting
          ? <><div className="size-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" /> Scoring…</>
          : 'Submit →'}
      </Button>
    </div>
  )

  return (
    <ExerciseCard type="Pronunciation Referee" progress={progress} footer={footer}>
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
                state === 'recording' && 'shadow-[0_0_0_3px_oklch(0.65_0.18_25/0.2)]',
              )}
              onClick={state === 'recording' ? stopRecording : () => void startRecording()}
            >
              {state === 'recording' ? '⏹ Stop' : '⏺ Record'}
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
              Attempt {attempt} · Re-record anytime before submitting
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

      {/* Score results — mirrors ShadowingRevealPhase > SpeakingScores */}
      {result && (
        <div className="space-y-2">
          {/* Score panel */}
          <div className="rounded-xl border border-border/50 bg-muted/20 overflow-hidden">
            {/* Hero row */}
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
            {/* Secondary scores */}
            <div className="grid grid-cols-3 border-t border-border/40">
              {(['fluency', 'completeness', 'prosody'] as const).map((k, i) => (
                <div key={k} className={cn('px-3 py-2 text-center', i < 2 && 'border-r border-border/40')}>
                  <div className={cn('text-base font-bold tabular-nums', scoreColor(result.overall[k]))}>
                    {Math.round(result.overall[k])}
                  </div>
                  <div className="text-[9px] uppercase tracking-wider text-muted-foreground capitalize">{k}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Word breakdown */}
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
                  )}>
                    {w.error_type === 'Mispronunciation' ? 'Mispron.' : w.error_type}
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Result actions (replaces footer) */}
          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => { setResult(null); setBlob(null); setState('idle') }}
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

- [ ] **Step 2: Update `StudySession.tsx` — add `progress` prop to `PronunciationReferee`**

```tsx
// Before
<PronunciationReferee
  key={current}
  sentence={q.pronunciationData}
  apiBaseUrl={API_BASE}
  azureKey={keys?.azureSpeechKey ?? ''}
  azureRegion={keys?.azureSpeechRegion ?? 'eastus'}
  onNext={handleNext}
/>

// After
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

- [ ] **Step 3: Run tests**

```bash
cd frontend && npx vitest run tests/StudySession.test.tsx
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/study/exercises/PronunciationReferee.tsx \
        frontend/src/components/study/StudySession.tsx
git commit -m "feat(exercises): redesign PronunciationReferee with ExerciseCard shell"
```

---

### Task 8: Full test suite verification

- [ ] **Step 1: Run the entire frontend test suite**

```bash
cd frontend && npx vitest run
```

Expected: All tests pass. If any fail, investigate and fix before proceeding.

- [ ] **Step 2: TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Final commit if any stragglers**

If Step 1 or 2 revealed fixes committed separately, add a final cleanup commit:

```bash
git add -p  # stage only the specific fix
git commit -m "fix(exercises): resolve type errors after exercise redesign"
```
