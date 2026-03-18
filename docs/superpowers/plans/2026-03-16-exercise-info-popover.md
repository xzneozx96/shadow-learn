# Exercise Info Popover Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a small `Info` icon button to each exercise card header that opens a popover describing the exercise's purpose and mechanics.

**Architecture:** Add an optional `info` prop to `ExerciseCard` — when present, a `lucide-react` `Info` icon button appears in the header and opens a shadcn `Popover` with the exercise name as title and the description as body. Each of the six exercise components passes its own info string.

**Tech Stack:** React, shadcn/ui (`Popover`, `PopoverTrigger`, `PopoverContent`), `lucide-react` (`Info` icon), Vitest + `@testing-library/react`

---

## Chunk 1: Install popover + update ExerciseCard

### Task 1: Add popover component

**Files:**
- Create: `frontend/src/components/ui/popover.tsx`

- [ ] **Step 1: Write `popover.tsx` manually**

The project uses `@base-ui/react` (see `tooltip.tsx`, `dialog.tsx`). Write `frontend/src/components/ui/popover.tsx` following the same pattern as `tooltip.tsx`:

```tsx
'use client'

import { Popover as PopoverPrimitive } from '@base-ui/react/popover'

import { cn } from '@/lib/utils'

function Popover({ ...props }: PopoverPrimitive.Root.Props) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />
}

function PopoverTrigger({ ...props }: PopoverPrimitive.Trigger.Props) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />
}

function PopoverContent({
  className,
  side = 'bottom',
  sideOffset = 4,
  align = 'start',
  alignOffset = 0,
  children,
  ...props
}: PopoverPrimitive.Popup.Props
  & Pick<
    PopoverPrimitive.Positioner.Props,
    'align' | 'alignOffset' | 'side' | 'sideOffset'
  >) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        className="isolate z-50"
      >
        <PopoverPrimitive.Popup
          data-slot="popover-content"
          className={cn(
            'z-50 rounded-md border border-border bg-popover p-4 text-popover-foreground shadow-md outline-hidden',
            className,
          )}
          {...props}
        >
          {children}
        </PopoverPrimitive.Popup>
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  )
}

export { Popover, PopoverContent, PopoverTrigger }
```

- [ ] **Step 2: Verify TypeScript compiles cleanly**

```bash
cd frontend && npx tsc --noEmit
```
Expected: no errors related to `popover.tsx`.

---

### Task 2: Update ExerciseCard to support info popover

**Files:**
- Modify: `frontend/src/components/study/exercises/ExerciseCard.tsx`
- Modify: `frontend/tests/ExerciseCard.test.tsx` (file already exists — append new tests)

- [ ] **Step 1: Write failing tests**

First update the import line at the top of `frontend/tests/ExerciseCard.test.tsx` to add `fireEvent`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react'
```

Then append these tests to the existing `describe('exerciseCard', ...)` block:

```tsx
  it('does not render info button when info prop is absent', () => {
    render(
      <ExerciseCard type="Dictation" progress="" footer={null}>
        <p>body</p>
      </ExerciseCard>,
    )
    expect(screen.queryByRole('button', { name: /about this exercise/i })).not.toBeInTheDocument()
  })

  it('renders info button when info prop is provided', () => {
    render(
      <ExerciseCard type="Dictation" progress="" footer={null} info="Test info text.">
        <p>body</p>
      </ExerciseCard>,
    )
    expect(screen.getByRole('button', { name: /about this exercise/i })).toBeInTheDocument()
  })

  it('opens popover with description text on click', () => {
    render(
      <ExerciseCard type="Dictation" progress="" footer={null} info="Test info text.">
        <p>body</p>
      </ExerciseCard>,
    )
    fireEvent.click(screen.getByRole('button', { name: /about this exercise/i }))
    expect(screen.getByText('Test info text.')).toBeInTheDocument()
  })
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd frontend && npx vitest run tests/ExerciseCard.test.tsx
```
Expected: FAIL — info button not found / popover not rendering.

- [ ] **Step 3: Implement info prop in ExerciseCard**

Replace the contents of `frontend/src/components/study/exercises/ExerciseCard.tsx`:

```tsx
import type { ReactNode } from 'react'
import { Info } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

interface ExerciseCardProps {
  type: string
  progress: string
  footer: ReactNode | null
  children: ReactNode
  className?: string
  info?: string
}

export function ExerciseCard({ type, progress, footer, children, className, info }: ExerciseCardProps) {
  return (
    <div className={cn('rounded-xl border border-border bg-card overflow-hidden', className)}>
      {/* Header */}
      <div className="flex items-center gap-2.5 px-[18px] py-3 border-b border-border">
        <div className="size-[7px] rounded-full bg-muted-foreground/50 shrink-0" />
        <span className="text-[11px] font-bold uppercase tracking-[0.09em] text-foreground/90">
          {type}
        </span>
        {info && (
          <Popover>
            <PopoverTrigger
              type="button"
              aria-label="About this exercise"
              className="flex items-center text-muted-foreground/50 hover:text-muted-foreground transition-colors"
            >
              <Info className="size-3.5" />
            </PopoverTrigger>
            <PopoverContent className="w-72 text-sm">
              <p className="font-semibold mb-1">{type}</p>
              <p className="text-muted-foreground">{info}</p>
            </PopoverContent>
          </Popover>
        )}
        <span className="text-[11px] text-muted-foreground ml-auto">{progress}</span>
      </div>
      {/* Body */}
      <div className="px-10 py-5 min-h-80 flex items-center justify-center">
        <div className="w-full text-center">{children}</div>
      </div>
      {/* Footer */}
      {footer !== null && (
        <div className="border-t border-border">{footer}</div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd frontend && npx vitest run tests/ExerciseCard.test.tsx
```
Expected: all 6 tests PASS (3 existing + 3 new).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ui/popover.tsx frontend/src/components/study/exercises/ExerciseCard.tsx frontend/tests/ExerciseCard.test.tsx
git commit -m "feat(exercises): add info popover to ExerciseCard"
```

---

## Chunk 2: Wire info strings into each exercise

### Task 3: Add info to DictationExercise

**Files:**
- Modify: `frontend/src/components/study/exercises/DictationExercise.tsx:33`

- [ ] **Step 1: Add info prop to ExerciseCard usage**

In `DictationExercise.tsx`, find the `<ExerciseCard` opening tag (line 33) and add the `info` prop:

```tsx
    <ExerciseCard
      type="Dictation"
      progress={progress}
      footer={footer}
      info="Listen to the audio clip and type the Chinese sentence you hear. Tests listening comprehension and character recall."
    >
```

- [ ] **Step 2: Verify visually (dev server) or run full test suite**

```bash
cd frontend && npx vitest run
```
Expected: no regressions.

---

### Task 4: Add info to PinyinRecallExercise

**Files:**
- Modify: `frontend/src/components/study/exercises/PinyinRecallExercise.tsx:39`

- [ ] **Step 1: Add info prop**

Find `<ExerciseCard type="Pinyin Recall"` and add:

```tsx
    <ExerciseCard
      type="Pinyin Recall"
      progress={progress}
      footer={footer}
      info="See the characters and type their pinyin with tone marks. Tests pronunciation knowledge without speaking aloud."
    >
```

- [ ] **Step 2: Run tests**

```bash
cd frontend && npx vitest run
```
Expected: PASS.

---

### Task 5: Add info to ReconstructionExercise

**Files:**
- Modify: `frontend/src/components/study/exercises/ReconstructionExercise.tsx:37`

- [ ] **Step 1: Add info prop**

Find `<ExerciseCard type="Sentence Reconstruction"` and add:

```tsx
    <ExerciseCard
      type="Sentence Reconstruction"
      progress={progress}
      footer={footer}
      info="Rearrange the scrambled word chips into the correct sentence. Tests grammar and word order."
    >
```

- [ ] **Step 2: Run tests**

```bash
cd frontend && npx vitest run
```
Expected: PASS.

---

### Task 6: Add info to ClozeExercise

**Files:**
- Modify: `frontend/src/components/study/exercises/ClozeExercise.tsx:66`

- [ ] **Step 1: Add info prop**

Find `<ExerciseCard type="Scenario Cloze"` and add:

```tsx
    <ExerciseCard
      type="Scenario Cloze"
      progress={progress}
      footer={footer}
      info="Read a short story and fill in the missing vocabulary words from context. Tests contextual understanding."
    >
```

- [ ] **Step 2: Run tests**

```bash
cd frontend && npx vitest run
```
Expected: PASS.

---

### Task 7: Add info to PronunciationReferee

**Files:**
- Modify: `frontend/src/components/study/exercises/PronunciationReferee.tsx:139`

- [ ] **Step 1: Add info prop**

Find `<ExerciseCard type="Pronunciation Referee"` and add:

```tsx
    <ExerciseCard
      type="Pronunciation Referee"
      progress={progress}
      footer={footer}
      info="Read the sentence aloud and get AI-scored feedback on accuracy, fluency, and prosody."
    >
```

- [ ] **Step 2: Run tests**

```bash
cd frontend && npx vitest run
```
Expected: PASS.

---

### Task 8: Add info to CharacterWritingExercise

**Files:**
- Modify: `frontend/src/components/study/exercises/CharacterWritingExercise.tsx:65`

- [ ] **Step 1: Add info prop**

Find `<ExerciseCard type="Character Writing"` and add:

```tsx
    <ExerciseCard
      type="Character Writing"
      progress={progress}
      footer={footer}
      info="Trace each stroke of the character in the correct order. Builds handwriting muscle memory."
    >
```

- [ ] **Step 2: Run full test suite**

```bash
cd frontend && npx vitest run
```
Expected: all tests PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/study/exercises/DictationExercise.tsx \
        frontend/src/components/study/exercises/PinyinRecallExercise.tsx \
        frontend/src/components/study/exercises/ReconstructionExercise.tsx \
        frontend/src/components/study/exercises/ClozeExercise.tsx \
        frontend/src/components/study/exercises/PronunciationReferee.tsx \
        frontend/src/components/study/exercises/CharacterWritingExercise.tsx
git commit -m "feat(exercises): add info descriptions to all exercise types"
```
