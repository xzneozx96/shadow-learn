# Shadowing Start Segment & Count Selection — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users choose a starting segment and segment count before a shadowing session, replacing the "always start from the beginning" behaviour.

**Architecture:** Three focused changes: (1) `ShadowingModePicker` is rewritten to accept `startSegment` + `totalRemaining` props and expose a count selector; (2) `TranscriptPanel` adds a per-row Swords icon that fires `onShadowClick(segment)`; (3) `LessonView` wires the two together by replacing `pickerOpen: boolean` with `pickerSegment: Segment | null`, slicing the segments array before passing to `ShadowingPanel`.

**Tech Stack:** React, TypeScript, Vitest + jsdom + React Testing Library, shadcn/ui (Button, Dialog), lucide-react (Swords icon), Tailwind CSS.

**Spec:** `docs/superpowers/specs/2026-03-16-shadowing-start-segment-design.md`

---

## File Map

| File | Change |
|---|---|
| `frontend/src/components/shadowing/ShadowingModePicker.tsx` | Rewrite — new props, count chips, formatTimestamp |
| `frontend/src/components/lesson/TranscriptPanel.tsx` | Add Swords icon per row, remove Shadow button, rename prop |
| `frontend/src/components/lesson/LessonView.tsx` | Replace pickerOpen with pickerSegment, update handlers + shadowingMode type |
| `frontend/tests/ShadowingModePicker.test.tsx` | New — unit tests for picker UI |
| `frontend/tests/TranscriptPanel.shadow.test.tsx` | New — Swords icon renders and fires correct callback |

---

## Chunk 1: ShadowingModePicker rewrite

### Task 1: Rewrite `ShadowingModePicker`

**Files:**
- Modify: `frontend/src/components/shadowing/ShadowingModePicker.tsx`
- Create: `frontend/tests/ShadowingModePicker.test.tsx`

**Background:** The current picker only has `speakingAvailable`, `onStart(mode)`, and `onClose`. It will be fully replaced with a new interface that adds `startSegment`, `startSegmentNumber`, `totalRemaining`, and changes `onStart` to `onStart(mode, count)`. The `formatTimestamp` utility lives inline in this file.

- [ ] **Step 1.1: Write failing tests for the new picker**

Create `frontend/tests/ShadowingModePicker.test.tsx`:

```tsx
import type { Segment } from '@/types'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ShadowingModePicker } from '@/components/shadowing/ShadowingModePicker'

function makeSegment(overrides: Partial<Segment> = {}): Segment {
  return {
    id: 'seg-1',
    start: 3660, // 01:01:00
    end: 3665,
    chinese: '你好吗',
    pinyin: 'nǐ hǎo ma',
    translations: { en: 'How are you?' },
    words: [],
    ...overrides,
  }
}

const baseProps = {
  startSegment: makeSegment(),
  startSegmentNumber: 12,
  totalRemaining: 88,
  speakingAvailable: true,
  onStart: vi.fn(),
  onClose: vi.fn(),
}

describe('ShadowingModePicker', () => {
  it('shows start segment info in description', () => {
    render(<ShadowingModePicker {...baseProps} />)
    expect(screen.getByText(/segment 12/)).toBeInTheDocument()
    expect(screen.getByText(/你好吗/)).toBeInTheDocument()
    expect(screen.getByText(/01:01:00/)).toBeInTheDocument()
  })

  it('defaults count to 10 when totalRemaining > 10', () => {
    render(<ShadowingModePicker {...baseProps} totalRemaining={88} />)
    // The "10" chip should appear selected (aria-pressed or data-selected)
    const chip10 = screen.getByRole('button', { name: '10' })
    expect(chip10).toHaveAttribute('data-selected', 'true')
  })

  it('defaults count to all when totalRemaining <= 10', () => {
    render(<ShadowingModePicker {...baseProps} totalRemaining={8} />)
    const chipAll = screen.getByRole('button', { name: /All/ })
    expect(chipAll).toHaveAttribute('data-selected', 'true')
  })

  it('defaults count to all when totalRemaining is exactly 10', () => {
    render(<ShadowingModePicker {...baseProps} totalRemaining={10} />)
    const chipAll = screen.getByRole('button', { name: /All/ })
    expect(chipAll).toHaveAttribute('data-selected', 'true')
    // The 10-chip is enabled but not selected
    expect(screen.getByRole('button', { name: '10' })).not.toBeDisabled()
    expect(screen.getByRole('button', { name: '10' })).toHaveAttribute('data-selected', 'false')
  })

  it('disables 5/10/20 chips when totalRemaining < chip value', () => {
    render(<ShadowingModePicker {...baseProps} totalRemaining={4} />)
    expect(screen.getByRole('button', { name: '5' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '10' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '20' })).toBeDisabled()
  })

  it('never disables the All chip', () => {
    render(<ShadowingModePicker {...baseProps} totalRemaining={1} />)
    const chipAll = screen.getByRole('button', { name: /All/ })
    expect(chipAll).not.toBeDisabled()
  })

  it('shows totalRemaining in the All chip label', () => {
    render(<ShadowingModePicker {...baseProps} totalRemaining={42} />)
    expect(screen.getByRole('button', { name: /All \(42\)/ })).toBeInTheDocument()
  })

  it('calls onStart with selected mode and count on Start', () => {
    const onStart = vi.fn()
    render(<ShadowingModePicker {...baseProps} onStart={onStart} />)
    fireEvent.click(screen.getByRole('button', { name: '20' }))
    fireEvent.click(screen.getByRole('button', { name: /Start/ }))
    expect(onStart).toHaveBeenCalledWith('dictation', 20)
  })

  it('calls onStart with "all" when All chip selected', () => {
    const onStart = vi.fn()
    render(<ShadowingModePicker {...baseProps} totalRemaining={5} onStart={onStart} />)
    fireEvent.click(screen.getByRole('button', { name: /Start/ }))
    expect(onStart).toHaveBeenCalledWith('dictation', 'all')
  })

  it('calls onClose on Cancel', () => {
    const onClose = vi.fn()
    render(<ShadowingModePicker {...baseProps} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: /Cancel/ }))
    expect(onClose).toHaveBeenCalled()
  })
})

describe('formatTimestamp (via picker description)', () => {
  it('formats 0 seconds as 00:00:00', () => {
    render(<ShadowingModePicker {...baseProps} startSegment={makeSegment({ start: 0 })} />)
    expect(screen.getByText(/00:00:00/)).toBeInTheDocument()
  })

  it('formats 3723 seconds as 01:02:03', () => {
    render(<ShadowingModePicker {...baseProps} startSegment={makeSegment({ start: 3723 })} />)
    expect(screen.getByText(/01:02:03/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 1.2: Run tests to confirm they fail**

```bash
cd frontend && npx vitest run tests/ShadowingModePicker.test.tsx
```

Expected: tests fail (component has wrong interface).

- [ ] **Step 1.3: Rewrite `ShadowingModePicker.tsx`**

Replace the entire file content:

```tsx
import type { Segment } from '@/types'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

function formatTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

const COUNT_OPTIONS = [5, 10, 20] as const

interface ShadowingModePickerProps {
  startSegment: Segment
  startSegmentNumber: number
  totalRemaining: number
  speakingAvailable: boolean
  onStart: (mode: 'dictation' | 'speaking', count: number | 'all') => void
  onClose: () => void
}

export function ShadowingModePicker({
  startSegment,
  startSegmentNumber,
  totalRemaining,
  speakingAvailable,
  onStart,
  onClose,
}: ShadowingModePickerProps) {
  const [selectedMode, setSelectedMode] = useState<'dictation' | 'speaking'>('dictation')
  const [count, setCount] = useState<number | 'all'>(totalRemaining > 10 ? 10 : 'all')

  return (
    <>
      <DialogHeader>
        <DialogTitle>Shadowing Mode</DialogTitle>
        <DialogDescription>
          {`Starting from segment ${startSegmentNumber} — "${startSegment.chinese}" (${formatTimestamp(startSegment.start)})`}
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-2 py-2">
        {/* Dictation */}
        <button
          className={cn(
            'rounded-lg border p-3 text-left transition-colors',
            selectedMode === 'dictation'
              ? 'border-foreground/25 bg-foreground/8'
              : 'border-border hover:bg-accent',
          )}
          onClick={() => setSelectedMode('dictation')}
        >
          <div className="text-sm font-semibold">✍️ Dictation</div>
          <div className="mt-0.5 text-sm text-muted-foreground">
            Listen to each segment, type what you heard
          </div>
        </button>

        {/* Speaking (may be disabled) */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                role="button"
                tabIndex={0}
                className={cn(
                  'rounded-lg border p-3 text-left transition-colors',
                  !speakingAvailable && 'cursor-not-allowed opacity-40',
                  selectedMode === 'speaking' && speakingAvailable
                    ? 'border-foreground/25 bg-foreground/8'
                    : 'border-border',
                  speakingAvailable && 'hover:bg-accent',
                )}
                onClick={() => speakingAvailable && setSelectedMode('speaking')}
                aria-disabled={!speakingAvailable}
              >
                <div className="text-sm font-semibold">🎤 Speaking</div>
                <div className="mt-0.5 text-sm text-muted-foreground">
                  Listen to each segment, speak it back — scored by Azure
                </div>
              </div>
            </TooltipTrigger>
            {!speakingAvailable && (
              <TooltipContent>Azure key required in Settings</TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Count chips */}
      <div className="flex flex-col gap-1.5">
        <span className="text-sm text-muted-foreground">Segments to practice:</span>
        <div className="flex gap-2">
          {COUNT_OPTIONS.map(n => (
            <button
              key={n}
              role="button"
              disabled={totalRemaining < n}
              data-selected={count === n ? 'true' : 'false'}
              className={cn(
                'rounded-md border px-3 py-1 text-sm transition-colors',
                count === n
                  ? 'border-foreground/25 bg-foreground/8 font-semibold'
                  : 'border-border hover:bg-accent',
                totalRemaining < n && 'cursor-not-allowed opacity-40',
              )}
              onClick={() => !( totalRemaining < n) && setCount(n)}
            >
              {n}
            </button>
          ))}
          <button
            role="button"
            data-selected={count === 'all' ? 'true' : 'false'}
            className={cn(
              'rounded-md border px-3 py-1 text-sm transition-colors',
              count === 'all'
                ? 'border-foreground/25 bg-foreground/8 font-semibold'
                : 'border-border hover:bg-accent',
            )}
            onClick={() => setCount('all')}
          >
            {`All (${totalRemaining})`}
          </button>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={() => onStart(selectedMode, count)}>Start →</Button>
      </div>
    </>
  )
}
```

- [ ] **Step 1.4: Run tests to confirm they pass**

```bash
cd frontend && npx vitest run tests/ShadowingModePicker.test.tsx
```

Expected: all tests pass.

- [ ] **Step 1.5: Commit**

```bash
git add frontend/src/components/shadowing/ShadowingModePicker.tsx \
        frontend/tests/ShadowingModePicker.test.tsx
git commit -m "feat(shadowing): rewrite ShadowingModePicker with start segment info and count chips"
```

---

## Chunk 2: TranscriptPanel — Swords icon

### Task 2: Add per-row shadow icon to `TranscriptPanel`

**Files:**
- Modify: `frontend/src/components/lesson/TranscriptPanel.tsx`
- Create: `frontend/tests/TranscriptPanel.shadow.test.tsx`

**Background:** Each segment row has a vertical column of `size-5` ghost icon buttons (Volume2, Copy). A third button with the `Swords` lucide icon is added after Copy. The existing `onShadowingClick?: () => void` prop and the `🎯 Shadow` header button are both removed. A new `onShadowClick?: (segment: Segment) => void` prop is added. The button's `onClick` must call `e.stopPropagation()` before `onShadowClick` to prevent the row's own `onSegmentClick` from firing.

- [ ] **Step 2.1: Write failing tests**

Create `frontend/tests/TranscriptPanel.shadow.test.tsx`:

```tsx
import type { Segment } from '@/types'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TranscriptPanel } from '@/components/lesson/TranscriptPanel'

// Stub heavy dependencies not relevant to this test
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ db: null, keys: null }),
}))
vi.mock('@/hooks/useTTS', () => ({
  useTTS: () => ({ playTTS: vi.fn(), loadingText: null }),
}))
vi.mock('@/hooks/useVocabulary', () => ({
  useVocabulary: () => ({ save: vi.fn(), isSaved: () => false }),
}))
vi.mock('./SegmentText', () => ({
  SegmentText: ({ text }: { text: string }) => <span>{text}</span>,
}))

function makeSegment(id: string, chinese: string): Segment {
  return {
    id,
    start: 0,
    end: 5,
    chinese,
    pinyin: '',
    translations: { en: 'test' },
    words: [],
  }
}

const lesson = {
  id: 'l1',
  title: 'Test',
  translationLanguages: ['en'],
  createdAt: 0,
  status: 'ready' as const,
}

describe('TranscriptPanel shadow icon', () => {
  it('renders a shadow icon button for each segment', () => {
    const segments = [makeSegment('s1', '你好'), makeSegment('s2', '再见')]
    render(
      <TranscriptPanel
        segments={segments}
        activeSegment={null}
        lesson={lesson}
        onSegmentClick={vi.fn()}
        onProgressUpdate={vi.fn()}
        onShadowClick={vi.fn()}
      />,
    )
    const buttons = screen.getAllByRole('button', { name: 'Shadow from this segment' })
    expect(buttons).toHaveLength(2)
  })

  it('calls onShadowClick with the correct segment reference', () => {
    const segments = [makeSegment('s1', '你好'), makeSegment('s2', '再见')]
    const onShadowClick = vi.fn()
    render(
      <TranscriptPanel
        segments={segments}
        activeSegment={null}
        lesson={lesson}
        onSegmentClick={vi.fn()}
        onProgressUpdate={vi.fn()}
        onShadowClick={onShadowClick}
      />,
    )
    const [btn1] = screen.getAllByRole('button', { name: 'Shadow from this segment' })
    fireEvent.click(btn1)
    expect(onShadowClick).toHaveBeenCalledWith(segments[0])
  })

  it('does not call onSegmentClick when shadow icon is clicked', () => {
    const segments = [makeSegment('s1', '你好')]
    const onSegmentClick = vi.fn()
    render(
      <TranscriptPanel
        segments={segments}
        activeSegment={null}
        lesson={lesson}
        onSegmentClick={onSegmentClick}
        onProgressUpdate={vi.fn()}
        onShadowClick={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Shadow from this segment' }))
    expect(onSegmentClick).not.toHaveBeenCalled()
  })

  it('does not render shadow buttons when onShadowClick is not provided', () => {
    const segments = [makeSegment('s1', '你好')]
    render(
      <TranscriptPanel
        segments={segments}
        activeSegment={null}
        lesson={lesson}
        onSegmentClick={vi.fn()}
        onProgressUpdate={vi.fn()}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Shadow from this segment' })).not.toBeInTheDocument()
  })

  it('does not render the top-level Shadow button', () => {
    const segments = [makeSegment('s1', '你好')]
    render(
      <TranscriptPanel
        segments={segments}
        activeSegment={null}
        lesson={lesson}
        onSegmentClick={vi.fn()}
        onProgressUpdate={vi.fn()}
        onShadowClick={vi.fn()}
      />,
    )
    expect(screen.queryByRole('button', { name: /Shadow$/i })).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2.2: Run tests to confirm they fail**

```bash
cd frontend && npx vitest run tests/TranscriptPanel.shadow.test.tsx
```

Expected: tests fail (Swords button not present, old prop still in place).

- [ ] **Step 2.3: Update `TranscriptPanel.tsx`**

Make these four changes:

**a) Import `Swords` from lucide-react and update the prop interface:**

In the imports line, add `Swords` alongside existing lucide imports:
```tsx
import { Check, Copy, Loader2, Search, Swords, Volume2 } from 'lucide-react'
```

**b) Replace the prop type:**
```tsx
// Remove:
onShadowingClick?: () => void
// Add:
onShadowClick?: (segment: Segment) => void
```

**c) Remove the `🎯 Shadow` button** from the search bar row (the `{onShadowingClick && (<Button ...>🎯 Shadow</Button>)}` block).

**d) Add the Swords icon button** inside each row's action column, after the Copy button:
```tsx
{onShadowClick && (
  <Button
    variant="ghost"
    size="icon-xs"
    className="size-5 text-muted-foreground hover:text-foreground"
    aria-label="Shadow from this segment"
    onClick={(e) => {
      e.stopPropagation()
      onShadowClick(segment)
    }}
  >
    <Swords className="size-4" />
  </Button>
)}
```

- [ ] **Step 2.4: Run tests to confirm they pass**

```bash
cd frontend && npx vitest run tests/TranscriptPanel.shadow.test.tsx
```

Expected: all tests pass.

- [ ] **Step 2.5: Commit**

```bash
git add frontend/src/components/lesson/TranscriptPanel.tsx \
        frontend/tests/TranscriptPanel.shadow.test.tsx
git commit -m "feat(transcript): add per-row shadow icon, remove top-level Shadow button"
```

---

## Chunk 3: LessonView wiring

### Task 3: Wire `pickerSegment` state and segment slicing in `LessonView`

**Files:**
- Modify: `frontend/src/components/lesson/LessonView.tsx`

**Background:** `LessonView` currently manages the picker dialog with `pickerOpen: boolean`. This is replaced with `pickerSegment: Segment | null`. Two derived values are computed from it: `pickerStartIdx` and `totalRemaining`. The `shadowingMode` type gains a `segments` field so the sliced array is stored there instead of always passing the full `segments` prop to `ShadowingPanel`.

No new test file is needed — the existing `ShadowingPanel.test.tsx` continues to pass because `ShadowingPanel`'s interface is unchanged.

- [ ] **Step 3.1: Update `LessonView.tsx` — state and type**

**a) Replace the `ShadowingActiveMode` type and `pickerOpen` state:**

```tsx
// Remove:
type ShadowingActiveMode = null | { mode: 'dictation' | 'speaking' }
const [pickerOpen, setPickerOpen] = useState(false)

// Add:
type ShadowingActiveMode = null | { mode: 'dictation' | 'speaking', segments: Segment[] }
const [pickerSegment, setPickerSegment] = useState<Segment | null>(null)
```

**b) Add derived values** (after the `pickerSegment` state line):
```tsx
const pickerStartIdx = pickerSegment
  ? segments.findIndex(s => s.id === pickerSegment.id)
  : -1
const totalRemaining = pickerStartIdx >= 0 ? segments.length - pickerStartIdx : 0
```

- [ ] **Step 3.2: Replace handlers**

```tsx
// Remove handleShadowingClick entirely.

// Replace handleShadowingStart:
const handleShadowingStart = useCallback(
  (mode: 'dictation' | 'speaking', count: number | 'all') => {
    const startIdx = segments.findIndex(s => s.id === pickerSegment!.id)
    if (startIdx === -1)
      return
    const slice = count === 'all'
      ? segments.slice(startIdx)
      : segments.slice(startIdx, startIdx + count)
    setShadowingMode({ mode, segments: slice })
    setPickerSegment(null)
  },
  [segments, pickerSegment],
)

// Add:
const handleShadowClick = useCallback((segment: Segment) => {
  setPickerSegment(segment)
}, [])
```

- [ ] **Step 3.3: Update JSX — `ShadowingPanel` call site**

Change `segments={segments}` to `segments={shadowingMode.segments}`:

```tsx
<ShadowingPanel
  segments={shadowingMode.segments}   // was: segments={segments}
  mode={shadowingMode.mode}
  azureKey={keys?.azureSpeechKey ?? ''}
  azureRegion={keys?.azureSpeechRegion ?? ''}
  onExit={handleShadowingExit}
/>
```

- [ ] **Step 3.4: Update JSX — `TranscriptPanel` call site**

```tsx
// Remove: onShadowingClick={handleShadowingClick}
// Add:    onShadowClick={handleShadowClick}
```

- [ ] **Step 3.5: Update JSX — Dialog and `ShadowingModePicker`**

Replace the existing `<Dialog open={pickerOpen} ...>` block:

```tsx
<Dialog
  open={pickerSegment !== null && pickerStartIdx >= 0}
  onOpenChange={(open) => { if (!open) setPickerSegment(null) }}
>
  <DialogContent className="max-w-sm">
    {pickerSegment !== null && pickerStartIdx >= 0 && (
      <ShadowingModePicker
        startSegment={pickerSegment}
        startSegmentNumber={pickerStartIdx + 1}
        totalRemaining={totalRemaining}
        speakingAvailable={speakingAvailable}
        onStart={handleShadowingStart}
        onClose={() => setPickerSegment(null)}
      />
    )}
  </DialogContent>
</Dialog>
```

- [ ] **Step 3.6: Run all tests to confirm nothing is broken**

```bash
cd frontend && npx vitest run
```

Expected: all tests pass. The `ShadowingPanel.test.tsx` suite passes unchanged because `ShadowingPanel`'s props and logic are untouched.

- [ ] **Step 3.7: Commit**

```bash
git add frontend/src/components/lesson/LessonView.tsx
git commit -m "feat(lesson): wire pickerSegment state and segment slicing for shadowing start"
```
