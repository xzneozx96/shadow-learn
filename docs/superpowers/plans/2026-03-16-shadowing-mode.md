# Shadowing Mode Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Shadowing Mode to the lesson view that lets users practise listening and reproducing each lesson segment via typing (dictation) or recording (speaking, Azure-scored).

**Architecture:** State-driven panel swap in `LessonView` — when `shadowingMode` is active, `TranscriptPanel` is replaced by `ShadowingPanel`. `ShadowingPanel` owns a 3-phase per-segment loop (Listen → Attempt → Reveal) and a session summary at the end. `VideoPanel` and `CompanionPanel` remain mounted and unchanged throughout.

**Tech Stack:** React hooks/context, Vitest + React Testing Library, shadcn/ui Dialog, MediaRecorder API, Azure Speech API (same pattern as `PronunciationReferee`), Tailwind CSS, `Intl.Segmenter` for grapheme clusters, existing `@keyframes wave` from `index.css`.

**Spec:** `docs/superpowers/specs/2026-03-16-shadowing-mode-design.md`

---

## File Map

### New files
| File | Responsibility |
|---|---|
| `frontend/src/lib/shadowing-utils.ts` | Pure utility functions: char diff, pinyin diff, auto-skip detection, session summary |
| `frontend/src/components/shadowing/ShadowingModePicker.tsx` | shadcn Dialog — pick Dictation or Speaking, then start |
| `frontend/src/components/shadowing/ShadowingListenPhase.tsx` | Phase 1: seek+play segment, decorative waveform, auto-transition, Replay |
| `frontend/src/components/shadowing/ShadowingDictationPhase.tsx` | Phase 2a: text input with 汉字/pinyin toggle, Replay, Submit |
| `frontend/src/components/shadowing/ShadowingSpeakingPhase.tsx` | Phase 2b: MediaRecorder UI — initial/recording/processing/recorded sub-states |
| `frontend/src/components/shadowing/ShadowingRevealPhase.tsx` | Phase 3: reveal correct text + char diff (dictation) or Azure scores (speaking) |
| `frontend/src/components/shadowing/ShadowingSessionSummary.tsx` | Post-session: stats, weakest segments, Done |
| `frontend/src/components/shadowing/ShadowingPanel.tsx` | Main container — segment index, phase state machine, session results, exit confirmation |
| `frontend/tests/shadowing-utils.test.ts` | Unit tests for all utility functions |
| `frontend/tests/ShadowingPanel.test.tsx` | Integration tests for state machine |

### Modified files
| File | Change |
|---|---|
| `frontend/src/components/lesson/VideoPanel.tsx` | Add `onShadowingClick?` prop + Shadow button in metadata bar |
| `frontend/src/components/lesson/LessonView.tsx` | Add `shadowingMode` + `pickerOpen` state; conditionally render `ShadowingPanel` instead of `TranscriptPanel`; wire `ShadowingModePicker` |

### Key codebase facts (do NOT re-read these files — they've been studied)
- `VideoPlayer` interface (`player/types.ts`) already has `onEnded(cb) => () => void` — no `PlayerContext` changes needed
- `@keyframes wave` already defined in `index.css` line 222 — use `animate-[wave_1.3s_ease-in-out_infinite]`
- Azure keys live in `keys.azureSpeechKey` / `keys.azureSpeechRegion` (`DecryptedKeys` from `useAuth()`)
- `PronunciationReferee` sends blobs to `/api/pronunciation/assess` — use same endpoint with empty `apiBaseUrl`
- `pinyin-utils.ts` has `stripToneMarks` (internal) + `normalizePinyin` (exported) — for shadowing we use NFD + Mn removal directly
- Existing wave bars: `w-0.5 rounded-full bg-foreground/50 animate-[wave_1.3s_ease-in-out_infinite]` with `animationDelay: \`${i * 0.08}s\``
- Test pattern: `vi.mock('@/contexts/PlayerContext', () => ({ usePlayer: () => ({ player: mockPlayer, currentTime: 0 }) }))`

---

## Chunk 1: Utility Functions

### Task 1: Create `shadowing-utils.ts`

**Files:**
- Create: `frontend/src/lib/shadowing-utils.ts`

- [ ] **Step 1: Write the file**

```typescript
import type { Segment } from '@/types'

// ── Types ──────────────────────────────────────────────────────────────────

export interface DiffToken {
  text: string
  correct: boolean
}

export interface SegmentResult {
  segmentIndex: number
  attempted: boolean    // submitted an answer (not skipped)
  skipped: boolean      // user explicitly skipped
  autoSkipped: boolean  // duration < 0.5 s, silently bypassed
  score: number | null  // 0–100 or null (skipped / Azure failed / dictation not tracked)
}

export interface SessionSummary {
  total: number
  attempted: number
  skipped: number
  averageScore: number | null
  weakestSegments: Array<{ segmentIndex: number; score: number }>
}

// ── Char diff (hanzi) ─────────────────────────────────────────────────────

function getGraphemeClusters(text: string): string[] {
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  return [...segmenter.segment(text)].map(s => s.segment)
}

/**
 * Positional diff over Unicode grapheme clusters.
 * Shorter side is padded with empty slots (counted as incorrect).
 */
export function computeCharDiff(userInput: string, correctText: string): DiffToken[] {
  const userClusters = getGraphemeClusters(userInput.trim())
  const correctClusters = getGraphemeClusters(correctText.trim())
  const len = Math.max(userClusters.length, correctClusters.length)
  const tokens: DiffToken[] = []
  for (let i = 0; i < len; i++) {
    const u = userClusters[i] ?? ''
    const c = correctClusters[i] ?? ''
    tokens.push({ text: c || u, correct: u === c && u !== '' })
  }
  return tokens
}

// ── Pinyin diff ───────────────────────────────────────────────────────────

/**
 * Strip tone diacritics from pinyin by NFD-normalising then removing
 * Unicode combining marks (category Mn).
 */
export function stripPinyinTones(pinyin: string): string {
  return pinyin.normalize('NFD').replace(/\p{Mn}/gu, '')
}

/**
 * Positional diff over whitespace-split pinyin syllables.
 * Both sides have diacritics stripped before comparison.
 */
export function computePinyinDiff(userInput: string, correctPinyin: string): DiffToken[] {
  const normalize = (s: string) => stripPinyinTones(s.trim().toLowerCase())
  const userSyllables = userInput.trim().split(/\s+/).filter(Boolean)
  const correctSyllables = correctPinyin.trim().split(/\s+/).filter(Boolean)
  const len = Math.max(userSyllables.length, correctSyllables.length)
  const tokens: DiffToken[] = []
  for (let i = 0; i < len; i++) {
    const u = userSyllables[i] ?? ''
    const c = correctSyllables[i] ?? ''
    tokens.push({
      text: c || u,
      correct: u !== '' && normalize(u) === normalize(c),
    })
  }
  return tokens
}

// ── Accuracy score ────────────────────────────────────────────────────────

/** Returns integer 0–100. Returns 0 if tokens is empty. */
export function computeAccuracyScore(tokens: DiffToken[]): number {
  if (tokens.length === 0) return 0
  const correct = tokens.filter(t => t.correct).length
  return Math.round((correct / tokens.length) * 100)
}

// ── Auto-skip detection ───────────────────────────────────────────────────

/** A segment with duration < 0.5 s is treated as effectively silent. */
export function isAutoSkipSegment(segment: Segment): boolean {
  return segment.end - segment.start < 0.5
}

// ── Session summary ───────────────────────────────────────────────────────

export function computeSessionSummary(
  results: SegmentResult[],
  totalSegments: number,
): SessionSummary {
  // De-duplicate by segmentIndex — keep last result per segment (covers retries)
  const byIndex = new Map<number, SegmentResult>()
  for (const r of results) byIndex.set(r.segmentIndex, r)
  const deduped = [...byIndex.values()]

  const attempted = deduped.filter(r => r.attempted).length
  const skipped = deduped.filter(r => r.skipped).length

  const validScores = deduped.filter(
    (r): r is SegmentResult & { score: number } => r.attempted && r.score !== null,
  )

  const averageScore
    = validScores.length > 0
      ? Math.round(validScores.reduce((sum, r) => sum + r.score, 0) / validScores.length)
      : null

  const weakestSegments = [...validScores]
    .sort((a, b) => a.score - b.score || a.segmentIndex - b.segmentIndex)
    .slice(0, 3)
    .map(r => ({ segmentIndex: r.segmentIndex, score: r.score }))

  return { total: totalSegments, attempted, skipped, averageScore, weakestSegments }
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/lib/shadowing-utils.ts
git commit -m "feat: add shadowing utility functions (char diff, pinyin diff, session summary)"
```

---

### Task 2: Unit-test `shadowing-utils.ts`

**Files:**
- Create: `frontend/tests/shadowing-utils.test.ts`

- [ ] **Step 1: Write the failing tests first (TDD)**

```typescript
import { describe, expect, it } from 'vitest'
import {
  computeAccuracyScore,
  computeCharDiff,
  computePinyinDiff,
  computeSessionSummary,
  isAutoSkipSegment,
  stripPinyinTones,
} from '@/lib/shadowing-utils'
import type { Segment } from '@/types'

function seg(start: number, end: number): Segment {
  return { id: 's', start, end, chinese: '', pinyin: '', translations: {}, words: [] }
}

describe('computeCharDiff', () => {
  it('marks matching grapheme clusters as correct', () => {
    const tokens = computeCharDiff('你好', '你好')
    expect(tokens.every(t => t.correct)).toBe(true)
  })

  it('marks mismatched clusters as incorrect', () => {
    const tokens = computeCharDiff('你坏', '你好')
    expect(tokens[0].correct).toBe(true)
    expect(tokens[1].correct).toBe(false)
  })

  it('pads shorter user input with incorrect slots', () => {
    const tokens = computeCharDiff('你', '你好')
    expect(tokens).toHaveLength(2)
    expect(tokens[0].correct).toBe(true)
    expect(tokens[1].correct).toBe(false)
  })

  it('pads shorter correct text (extra user chars are wrong)', () => {
    const tokens = computeCharDiff('你好啊', '你好')
    expect(tokens).toHaveLength(3)
    expect(tokens[2].correct).toBe(false)
  })

  it('handles multi-character clusters correctly', () => {
    const tokens = computeCharDiff('什么', '什么')
    expect(tokens).toHaveLength(2)
    expect(tokens.every(t => t.correct)).toBe(true)
  })

  it('returns empty for two empty strings', () => {
    expect(computeCharDiff('', '')).toHaveLength(0)
  })
})

describe('stripPinyinTones', () => {
  it('removes tone diacritics', () => {
    expect(stripPinyinTones('nǐ hǎo')).toBe('ni hao')
    expect(stripPinyinTones('shénme')).toBe('shenme')
    expect(stripPinyinTones('zài')).toBe('zai')
  })

  it('leaves untoned pinyin unchanged', () => {
    expect(stripPinyinTones('ni hao')).toBe('ni hao')
  })
})

describe('computePinyinDiff', () => {
  it('matches syllables ignoring tone diacritics', () => {
    const tokens = computePinyinDiff('ni zai xue shenme', 'nǐ zài xué shénme')
    expect(tokens.every(t => t.correct)).toBe(true)
  })

  it('marks wrong syllables as incorrect', () => {
    const tokens = computePinyinDiff('ni hao', 'nǐ zài')
    expect(tokens[0].correct).toBe(true)
    expect(tokens[1].correct).toBe(false)
  })

  it('pads shorter user input', () => {
    const tokens = computePinyinDiff('ni', 'nǐ zài')
    expect(tokens).toHaveLength(2)
    expect(tokens[0].correct).toBe(true)
    expect(tokens[1].correct).toBe(false)
  })

  it('is case-insensitive', () => {
    const tokens = computePinyinDiff('NI', 'nǐ')
    expect(tokens[0].correct).toBe(true)
  })
})

describe('computeAccuracyScore', () => {
  it('returns 100 for all correct', () => {
    expect(computeAccuracyScore([{ text: 'a', correct: true }, { text: 'b', correct: true }])).toBe(100)
  })

  it('returns 50 for half correct', () => {
    expect(computeAccuracyScore([{ text: 'a', correct: true }, { text: 'b', correct: false }])).toBe(50)
  })

  it('returns 0 for all wrong', () => {
    expect(computeAccuracyScore([{ text: 'a', correct: false }])).toBe(0)
  })

  it('returns 0 for empty tokens', () => {
    expect(computeAccuracyScore([])).toBe(0)
  })
})

describe('isAutoSkipSegment', () => {
  it('returns true for duration < 0.5 s', () => {
    expect(isAutoSkipSegment(seg(0, 0.3))).toBe(true)
    expect(isAutoSkipSegment(seg(5, 5.49))).toBe(true)
  })

  it('returns false for duration >= 0.5 s', () => {
    expect(isAutoSkipSegment(seg(0, 0.5))).toBe(false)
    expect(isAutoSkipSegment(seg(0, 2))).toBe(false)
  })
})

describe('computeSessionSummary', () => {
  it('counts attempted and skipped correctly', () => {
    const results = [
      { segmentIndex: 0, attempted: true, skipped: false, autoSkipped: false, score: 80 },
      { segmentIndex: 1, attempted: false, skipped: true, autoSkipped: false, score: null },
      { segmentIndex: 2, attempted: false, skipped: false, autoSkipped: true, score: null },
    ]
    const s = computeSessionSummary(results, 3)
    expect(s.attempted).toBe(1)
    expect(s.skipped).toBe(1)
    expect(s.total).toBe(3)
  })

  it('computes average from non-null attempted scores only', () => {
    const results = [
      { segmentIndex: 0, attempted: true, skipped: false, autoSkipped: false, score: 80 },
      { segmentIndex: 1, attempted: true, skipped: false, autoSkipped: false, score: 60 },
      { segmentIndex: 2, attempted: true, skipped: false, autoSkipped: false, score: null },
    ]
    const s = computeSessionSummary(results, 3)
    expect(s.averageScore).toBe(70)
  })

  it('returns null average when no valid scores', () => {
    const results = [
      { segmentIndex: 0, attempted: false, skipped: true, autoSkipped: false, score: null },
    ]
    expect(computeSessionSummary(results, 1).averageScore).toBeNull()
  })

  it('returns up to 3 weakest segments, tiebroken by lower index first', () => {
    const results = [
      { segmentIndex: 3, attempted: true, skipped: false, autoSkipped: false, score: 40 },
      { segmentIndex: 0, attempted: true, skipped: false, autoSkipped: false, score: 50 },
      { segmentIndex: 1, attempted: true, skipped: false, autoSkipped: false, score: 40 },
      { segmentIndex: 2, attempted: true, skipped: false, autoSkipped: false, score: 90 },
    ]
    const s = computeSessionSummary(results, 4)
    expect(s.weakestSegments).toHaveLength(3)
    expect(s.weakestSegments[0]).toEqual({ segmentIndex: 1, score: 40 })
    expect(s.weakestSegments[1]).toEqual({ segmentIndex: 3, score: 40 })
    expect(s.weakestSegments[2]).toEqual({ segmentIndex: 0, score: 50 })
  })

  it('de-duplicates retried segments — last result wins', () => {
    const results = [
      { segmentIndex: 0, attempted: true, skipped: false, autoSkipped: false, score: 30 },
      { segmentIndex: 0, attempted: true, skipped: false, autoSkipped: false, score: 75 },
    ]
    const s = computeSessionSummary(results, 1)
    expect(s.attempted).toBe(1)
    expect(s.averageScore).toBe(75)
  })

  it('omits weakestSegments section when no valid scores', () => {
    const results = [
      { segmentIndex: 0, attempted: true, skipped: false, autoSkipped: false, score: null },
    ]
    expect(computeSessionSummary(results, 1).weakestSegments).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run tests — verify they pass against the implementation**

```bash
cd /home/ross-geller/Projects/personal/shadowing-companion/frontend && npx vitest run tests/shadowing-utils.test.ts
```
Expected: All PASS

- [ ] **Step 3: Commit**

```bash
git add frontend/tests/shadowing-utils.test.ts
git commit -m "test: add unit tests for shadowing utility functions"
```

---

## Chunk 2: Mode Picker + Session Summary

### Task 3: `ShadowingModePicker`

**Files:**
- Create: `frontend/src/components/shadowing/ShadowingModePicker.tsx`

- [ ] **Step 1: Write the component**

```typescript
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

interface ShadowingModePickerProps {
  open: boolean
  speakingAvailable: boolean
  onStart: (mode: 'dictation' | 'speaking') => void
  onCancel: () => void
}

export function ShadowingModePicker({ open, speakingAvailable, onStart, onCancel }: ShadowingModePickerProps) {
  const [selected, setSelected] = useState<'dictation' | 'speaking'>('dictation')

  return (
    <Dialog open={open} onOpenChange={open => { if (!open) onCancel() }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Shadowing Mode</DialogTitle>
          <DialogDescription>
            Shadow all segments from the beginning. Choose your practice style:
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2 py-2">
          {/* Dictation */}
          <button
            className={cn(
              'rounded-lg border p-3 text-left transition-colors',
              selected === 'dictation'
                ? 'border-foreground/25 bg-foreground/8'
                : 'border-border hover:bg-accent',
            )}
            onClick={() => setSelected('dictation')}
          >
            <div className="text-sm font-semibold">✍️ Dictation</div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              Listen to each segment, type what you heard
            </div>
          </button>

          {/* Speaking (may be disabled) */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className={cn(
                    'rounded-lg border p-3 text-left transition-colors',
                    !speakingAvailable && 'cursor-not-allowed opacity-40',
                    selected === 'speaking' && speakingAvailable
                      ? 'border-foreground/25 bg-foreground/8'
                      : 'border-border',
                    speakingAvailable && 'hover:bg-accent',
                  )}
                  onClick={() => speakingAvailable && setSelected('speaking')}
                  aria-disabled={!speakingAvailable}
                >
                  <div className="text-sm font-semibold">🎤 Speaking</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    Listen to each segment, speak it back — scored by Azure
                  </div>
                </button>
              </TooltipTrigger>
              {!speakingAvailable && (
                <TooltipContent>Azure key required in Settings</TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button onClick={() => onStart(selected)}>Start →</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/shadowing/ShadowingModePicker.tsx
git commit -m "feat: add ShadowingModePicker dialog"
```

---

### Task 4: `ShadowingSessionSummary`

**Files:**
- Create: `frontend/src/components/shadowing/ShadowingSessionSummary.tsx`

- [ ] **Step 1: Write the component**

```typescript
import type { Segment } from '@/types'
import type { SessionSummary } from '@/lib/shadowing-utils'
import { Button } from '@/components/ui/button'

interface ShadowingSessionSummaryProps {
  summary: SessionSummary
  segments: Segment[]
  onDone: () => void
}

export function ShadowingSessionSummary({ summary, segments, onDone }: ShadowingSessionSummaryProps) {
  const { total, attempted, skipped, averageScore, weakestSegments } = summary

  return (
    <div
      className="flex h-full flex-col items-center justify-center gap-6 p-6"
      role="region"
      aria-label="Session summary"
    >
      <div className="w-full max-w-xs space-y-4">
        <div className="text-center">
          <div className="text-xs uppercase tracking-widest text-muted-foreground mb-1">
            Session Complete
          </div>
          <div className="text-2xl font-semibold">{attempted} / {total}</div>
          <div className="text-xs text-muted-foreground">segments attempted</div>
        </div>

        <div className="flex gap-2">
          <div className="flex-1 rounded-lg border border-border glass-surface p-3 text-center">
            <div className="text-lg font-semibold">{skipped}</div>
            <div className="text-xs text-muted-foreground">skipped</div>
          </div>
          <div className="flex-1 rounded-lg border border-border glass-surface p-3 text-center">
            <div className="text-lg font-semibold">
              {averageScore !== null ? averageScore : '—'}
            </div>
            <div className="text-xs text-muted-foreground">avg score</div>
          </div>
        </div>

        {weakestSegments.length > 0 && (
          <div>
            <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2">
              Needs Practice
            </div>
            <div className="space-y-1.5">
              {weakestSegments.map(({ segmentIndex, score }) => {
                const seg = segments[segmentIndex]
                return (
                  <div
                    key={segmentIndex}
                    className="flex items-center justify-between rounded-md border border-border glass-surface px-3 py-2"
                  >
                    <span className="max-w-[70%] truncate text-sm">
                      {seg?.chinese ?? `Segment ${segmentIndex + 1}`}
                    </span>
                    <span className="shrink-0 text-sm text-muted-foreground">{score}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <Button className="w-full" onClick={onDone}>Done</Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/shadowing/ShadowingSessionSummary.tsx
git commit -m "feat: add ShadowingSessionSummary component"
```

---

## Chunk 3: Listen + Dictation Phases

### Task 5: `ShadowingListenPhase`

**Files:**
- Create: `frontend/src/components/shadowing/ShadowingListenPhase.tsx`

Key behaviours:
- On mount: `player.seekTo(segment.start)` + `player.play()`
- Subscribe to `player.onEnded()` as fallback auto-transition trigger
- Watch `currentTime` from `usePlayer()` — when `>= segment.end` AND `hasAutoTransitioned.current` is false, set ref to true and call `onAutoTransition()`
- Replay button: seek + play, does NOT reset `hasAutoTransitioned` (intentional)
- Space key replays (only when focus is not in a text input)
- On mount, focus the Replay button

- [ ] **Step 1: Write the component**

```typescript
import type { Segment } from '@/types'
import { useEffect, useRef } from 'react'
import { usePlayer } from '@/contexts/PlayerContext'

const WAVE_HEIGHTS = [20, 65, 45, 90, 50, 75, 35, 80, 55, 40, 70, 30]

interface ShadowingListenPhaseProps {
  segment: Segment
  segmentLabel: string
  progress: number
  onAutoTransition: () => void
  onSkip: () => void
  onExit: () => void
}

export function ShadowingListenPhase({
  segment,
  segmentLabel,
  progress,
  onAutoTransition,
  onSkip,
  onExit,
}: ShadowingListenPhaseProps) {
  const { player, currentTime } = usePlayer()
  const hasAutoTransitioned = useRef(false)
  const replayBtnRef = useRef<HTMLButtonElement>(null)
  // Stable refs to avoid stale closures in effects
  const onAutoTransitionRef = useRef(onAutoTransition)
  onAutoTransitionRef.current = onAutoTransition

  // On mount: seek + play + subscribe to ended event
  useEffect(() => {
    if (!player) return
    player.seekTo(segment.start)
    player.play()
    replayBtnRef.current?.focus()

    const cleanup = player.onEnded(() => {
      if (!hasAutoTransitioned.current) {
        hasAutoTransitioned.current = true
        onAutoTransitionRef.current()
      }
    })
    return cleanup
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // intentionally run once on mount only

  // currentTime-based auto-transition
  useEffect(() => {
    if (!hasAutoTransitioned.current && currentTime >= segment.end) {
      hasAutoTransitioned.current = true
      onAutoTransitionRef.current()
    }
  }, [currentTime, segment.end])

  // Keyboard: Space = replay
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (
        e.key === ' '
        && !(e.target instanceof HTMLInputElement)
        && !(e.target instanceof HTMLTextAreaElement)
      ) {
        e.preventDefault()
        player?.seekTo(segment.start)
        player?.play()
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [player, segment.start])

  function handleReplay() {
    player?.seekTo(segment.start)
    player?.play()
  }

  return (
    <div
      className="flex h-full flex-col p-4 gap-3"
      role="region"
      aria-label="Shadowing mode"
      tabIndex={0}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-widest text-foreground/70">{segmentLabel}</span>
        <button
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          onClick={onExit}
          aria-label="Exit shadowing mode"
        >
          ✕ exit
        </button>
      </div>

      {/* Progress bar */}
      <div className="h-px bg-border">
        <div
          className="h-full bg-foreground/40 transition-all duration-300"
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col items-center justify-center gap-5">
        <span className="text-xs uppercase tracking-widest text-muted-foreground">Listen</span>

        {/* Decorative waveform — heights applied from WAVE_HEIGHTS for visual variety */}
        <div className="flex items-center gap-0.5" style={{ height: 48 }} aria-hidden>
          {WAVE_HEIGHTS.map((h, i) => (
            <div
              key={i}
              className="w-1 rounded-full bg-foreground/40 animate-[wave_1.3s_ease-in-out_infinite]"
              style={{ animationDelay: `${i * 0.08}s`, height: `${h}%` }}
            />
          ))}
        </div>

        <span className="text-xs text-muted-foreground">Playing segment…</span>

        <button
          ref={replayBtnRef}
          className="rounded-md border border-border bg-accent/60 px-3 py-1.5 text-xs transition-colors hover:bg-accent"
          onClick={handleReplay}
        >
          ↺ Replay
        </button>
      </div>

      <button
        className="self-end text-xs text-muted-foreground/50 transition-colors hover:text-muted-foreground"
        onClick={onSkip}
        aria-label="Skip this segment"
      >
        skip →
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/shadowing/ShadowingListenPhase.tsx
git commit -m "feat: add ShadowingListenPhase with hasAutoTransitioned ref and keyboard replay"
```

---

### Task 6: Add `shake` keyframe to `index.css`

**Files:**
- Modify: `frontend/src/styles/index.css`

The empty-input shake animation is needed by `ShadowingDictationPhase`. Add it after the existing `@keyframes wave { ... }` block.

- [ ] **Step 1: Add the keyframe**

Find the `@keyframes wave` block (line ~222) and add immediately after it:

```css
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  20%, 60% { transform: translateX(-6px); }
  40%, 80% { transform: translateX(6px); }
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/styles/index.css
git commit -m "feat: add shake keyframe animation for empty-input feedback"
```

---

### Task 7: `ShadowingDictationPhase`

**Files:**
- Create: `frontend/src/components/shadowing/ShadowingDictationPhase.tsx`

Key behaviours:
- Text input auto-focused on mount
- Replay is fire-and-forget (does not block typing)
- Empty submit triggers shake animation, no transition
- Enter key submits; Space replays only when focus is outside the input
- `onSubmit(answer, inputMode)` passes both answer and the active mode

- [ ] **Step 1: Write the component**

```typescript
import type { Segment } from '@/types'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { usePlayer } from '@/contexts/PlayerContext'
import { cn } from '@/lib/utils'

interface ShadowingDictationPhaseProps {
  segment: Segment
  segmentLabel: string
  progress: number
  onSubmit: (answer: string, inputMode: 'hanzi' | 'pinyin') => void
  onSkip: () => void
  onExit: () => void
}

export function ShadowingDictationPhase({
  segment,
  segmentLabel,
  progress,
  onSubmit,
  onSkip,
  onExit,
}: ShadowingDictationPhaseProps) {
  const { player } = usePlayer()
  const [value, setValue] = useState('')
  const [inputMode, setInputMode] = useState<'hanzi' | 'pinyin'>('hanzi')
  const [shake, setShake] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Space = replay when not in input
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const inInput = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement
      if (e.key === ' ' && !inInput) {
        e.preventDefault()
        player?.seekTo(segment.start)
        player?.play()
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [player, segment.start])

  function handleReplay() {
    player?.seekTo(segment.start)
    player?.play()
  }

  function handleSubmit() {
    if (!value.trim()) {
      setShake(true)
      setTimeout(() => setShake(false), 500)
      return
    }
    onSubmit(value.trim(), inputMode)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div
      className="flex h-full flex-col p-4 gap-3"
      role="region"
      aria-label="Shadowing mode"
      tabIndex={0}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-widest text-foreground/70">{segmentLabel}</span>
        <button
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          onClick={onExit}
          aria-label="Exit shadowing mode"
        >
          ✕ exit
        </button>
      </div>

      {/* Progress bar */}
      <div className="h-px bg-border">
        <div
          className="h-full bg-foreground/40 transition-all duration-300"
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col items-center justify-center gap-4">
        <span className="text-xs uppercase tracking-widest text-muted-foreground">
          Type what you heard
        </span>

        <button
          className="rounded-md border border-border bg-accent/60 px-3 py-1.5 text-xs transition-colors hover:bg-accent"
          onClick={handleReplay}
        >
          ↺ Replay
        </button>

        <input
          ref={inputRef}
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={inputMode === 'hanzi' ? '输入汉字…' : 'Type pinyin…'}
          className={cn(
            'w-4/5 rounded-md border border-border bg-background/50 px-3 py-2 text-center text-base outline-none transition-colors focus:border-foreground/30',
            shake && 'animate-[shake_0.4s_ease-in-out]',
          )}
          aria-label="Your answer"
        />

        {/* Toggle */}
        <div className="flex gap-1">
          {(['hanzi', 'pinyin'] as const).map(m => (
            <button
              key={m}
              className={cn(
                'rounded border px-2.5 py-0.5 text-xs transition-colors',
                inputMode === m
                  ? 'border-foreground/25 bg-foreground/10 text-foreground'
                  : 'border-border text-muted-foreground hover:text-foreground',
              )}
              onClick={() => setInputMode(m)}
            >
              {m === 'hanzi' ? '汉字' : 'pinyin'}
            </button>
          ))}
        </div>

        <Button onClick={handleSubmit}>Submit</Button>
      </div>

      <button
        className="self-end text-xs text-muted-foreground/50 transition-colors hover:text-muted-foreground"
        onClick={onSkip}
        aria-label="Skip this segment"
      >
        skip →
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/shadowing/ShadowingDictationPhase.tsx
git commit -m "feat: add ShadowingDictationPhase with hanzi/pinyin toggle and shake feedback"
```

---

## Chunk 4: Speaking + Reveal Phases

### Task 8: `ShadowingSpeakingPhase`

**Files:**
- Create: `frontend/src/components/shadowing/ShadowingSpeakingPhase.tsx`

Sub-states: `initial` → `recording` → `processing` → `recorded`

Key behaviours:
- `initial`: mic button + Replay button visible
- `recording`: decorative red waveform, Stop button; Replay hidden
- `processing`: brief "Processing…" indicator (< 200 ms typically)
- `recorded`: Re-record + Submit buttons; Replay NOT re-shown
- Minimum recording duration: if Stop < 0.5s after Start → discard, reset to initial, show brief error
- Tab hidden during recording → stop, discard, reset, show error
- Space = start/stop recording; Enter = submit if in `recorded` state
- Skip while recording: stop MediaRecorder, discard, then skip

- [ ] **Step 1: Write the component**

```typescript
import type { Segment } from '@/types'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { usePlayer } from '@/contexts/PlayerContext'
import { cn } from '@/lib/utils'

type SpeakingSubState = 'initial' | 'recording' | 'processing' | 'recorded'

interface ShadowingSpeakingPhaseProps {
  segment: Segment
  segmentLabel: string
  progress: number
  onSubmit: (blob: Blob) => void
  onSkip: () => void
  onExit: () => void
}

export function ShadowingSpeakingPhase({
  segment,
  segmentLabel,
  progress,
  onSubmit,
  onSkip,
  onExit,
}: ShadowingSpeakingPhaseProps) {
  const { player } = usePlayer()
  const [subState, setSubState] = useState<SpeakingSubState>('initial')
  const [blob, setBlob] = useState<Blob | null>(null)
  const [shortError, setShortError] = useState(false)
  const [interruptedError, setInterruptedError] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const recordingStartRef = useRef<number>(0)
  const micBtnRef = useRef<HTMLButtonElement>(null)
  // Stable ref for blob so keyboard handler always has current value
  const blobRef = useRef<Blob | null>(null)
  blobRef.current = blob
  // Cancellation flag: set to true in tab-hidden handler so onstop ignores the blob
  const cancelledRef = useRef(false)

  useEffect(() => {
    micBtnRef.current?.focus()
  }, [])

  // Tab-hidden guard
  useEffect(() => {
    function handleVisibility() {
      if (document.hidden && subState === 'recording') {
        // Set cancelled BEFORE calling stop() so onstop ignores the blob
        cancelledRef.current = true
        mediaRecorderRef.current?.stop()
        mediaRecorderRef.current = null
        setBlob(null)
        setSubState('initial')
        setInterruptedError(true)
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [subState])

  // Keyboard shortcuts
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === ' ') {
        e.preventDefault()
        if (subState === 'initial') void startRecording()
        else if (subState === 'recording') stopRecording()
      }
      if (e.key === 'Enter' && subState === 'recorded' && blobRef.current) {
        e.preventDefault()
        onSubmit(blobRef.current)
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subState])

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      chunksRef.current = []
      recorder.ondataavailable = e => chunksRef.current.push(e.data)
      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop())
        // If cancelled (e.g. tab-hidden interruption), ignore this blob entirely
        if (cancelledRef.current) {
          cancelledRef.current = false
          return
        }
        const duration = Date.now() - recordingStartRef.current
        if (duration < 500) {
          setBlob(null)
          setSubState('initial')
          setShortError(true)
          setTimeout(() => setShortError(false), 3000)
          return
        }
        const b = new Blob(chunksRef.current, { type: 'audio/webm' })
        setBlob(b)
        setSubState('recorded')
      }
      recorder.start()
      mediaRecorderRef.current = recorder
      recordingStartRef.current = Date.now()
      setSubState('recording')
      setShortError(false)
      setInterruptedError(false)
    }
    catch {
      // Mic access denied — stay in initial
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop()
    mediaRecorderRef.current = null
    setSubState('processing')
  }

  function handleRerecord() {
    setBlob(null)
    setSubState('initial')
  }

  function handleSkip() {
    // Cancel any in-flight recording or onstop callback before handing off
    if (subState === 'recording' || subState === 'processing') {
      cancelledRef.current = true
      mediaRecorderRef.current?.stop()
      mediaRecorderRef.current = null
    }
    onSkip()
  }

  const WAVE_COUNT = 8

  return (
    <div
      className="flex h-full flex-col p-4 gap-3"
      role="region"
      aria-label="Shadowing mode"
      tabIndex={0}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-widest text-foreground/70">{segmentLabel}</span>
        <button
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          onClick={onExit}
          aria-label="Exit shadowing mode"
        >
          ✕ exit
        </button>
      </div>

      {/* Progress bar */}
      <div className="h-px bg-border">
        <div
          className="h-full bg-foreground/40 transition-all duration-300"
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col items-center justify-center gap-4">
        <span className="text-xs uppercase tracking-widest text-muted-foreground">
          Speak what you heard
        </span>

        {/* Replay — initial only */}
        {subState === 'initial' && (
          <button
            className="rounded-md border border-border bg-accent/60 px-3 py-1.5 text-xs transition-colors hover:bg-accent"
            onClick={() => { player?.seekTo(segment.start); player?.play() }}
          >
            ↺ Replay
          </button>
        )}

        {/* Mic button (initial + recording) */}
        {(subState === 'initial' || subState === 'recording') && (
          <button
            ref={micBtnRef}
            className={cn(
              'size-16 rounded-full flex items-center justify-center text-2xl transition-all',
              subState === 'recording'
                ? 'bg-destructive shadow-[0_0_0_10px_oklch(0.60_0.20_25/0.12)]'
                : 'bg-destructive/80 hover:bg-destructive',
            )}
            onClick={subState === 'initial' ? () => void startRecording() : stopRecording}
            aria-label={subState === 'recording' ? 'Stop recording' : 'Start recording'}
          >
            🎤
          </button>
        )}

        {/* Recording waveform */}
        {subState === 'recording' && (
          <>
            <span className="text-xs text-destructive">Recording…</span>
            <div className="flex items-center gap-0.5" style={{ height: 20 }} aria-hidden>
              {Array.from({ length: WAVE_COUNT }, (_, i) => (
                <div
                  key={i}
                  className="w-0.5 rounded-full bg-destructive animate-[wave_1.3s_ease-in-out_infinite]"
                  style={{ animationDelay: `${i * 0.1}s` }}
                />
              ))}
            </div>
            <button
              className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
              onClick={stopRecording}
            >
              Stop & Submit
            </button>
          </>
        )}

        {subState === 'processing' && (
          <span className="text-xs text-muted-foreground">Processing…</span>
        )}

        {subState === 'recorded' && blob && (
          <div className="flex gap-2">
            <button
              className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
              onClick={handleRerecord}
            >
              ↺ Re-record
            </button>
            <Button size="sm" onClick={() => onSubmit(blob)}>Submit</Button>
          </div>
        )}

        {shortError && (
          <p className="text-xs text-destructive">Recording too short — try again.</p>
        )}
        {interruptedError && (
          <p className="text-xs text-destructive">Recording interrupted.</p>
        )}
      </div>

      <button
        className="self-end text-xs text-muted-foreground/50 transition-colors hover:text-muted-foreground"
        onClick={handleSkip}
        aria-label="Skip this segment"
      >
        skip →
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/shadowing/ShadowingSpeakingPhase.tsx
git commit -m "feat: add ShadowingSpeakingPhase with MediaRecorder sub-states and guards"
```

---

### Task 9: `ShadowingRevealPhase`

**Files:**
- Create: `frontend/src/components/shadowing/ShadowingRevealPhase.tsx`

Key behaviours:
- Focuses Next button on mount
- Keyboard: Enter = Next, `r` = Retry (scoped to ShadowingPanel region)
- Dictation path: compute diff + accuracy score synchronously, pass score via `onNext(score)`
- Speaking path: `SpeakingScores` sub-component handles Azure call with 10s timeout; stores score via ref, passes it to `onNext(score)` when user clicks Next
- On Azure failure: show error, reveal correct text, Retry + Next still work (score = null)

- [ ] **Step 1: Write the component**

```typescript
import type { Segment } from '@/types'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  computeAccuracyScore,
  computeCharDiff,
  computePinyinDiff,
} from '@/lib/shadowing-utils'
import type { DiffToken } from '@/lib/shadowing-utils'
import { cn } from '@/lib/utils'

interface WordScore {
  word: string
  accuracy: number
  error_type: string | null
  error_detail: string | null
}
interface AssessResult {
  overall: { accuracy: number; fluency: number; completeness: number; prosody: number }
  words: WordScore[]
}

// ── Dictation props ───────────────────────────────────────────────────────

interface DictationRevealProps {
  mode: 'dictation'
  segment: Segment
  userAnswer: string
  inputMode: 'hanzi' | 'pinyin'
}

// ── Speaking props ────────────────────────────────────────────────────────

interface SpeakingRevealProps {
  mode: 'speaking'
  segment: Segment
  blob: Blob
  azureKey: string
  azureRegion: string
}

// ── Combined ──────────────────────────────────────────────────────────────

type ShadowingRevealPhaseProps = (DictationRevealProps | SpeakingRevealProps) & {
  segmentLabel: string
  progress: number
  onRetry: () => void
  onNext: (score: number | null) => void
  onExit: () => void
}

export function ShadowingRevealPhase(props: ShadowingRevealPhaseProps) {
  const { segment, segmentLabel, progress, onRetry, onNext, onExit } = props
  const nextBtnRef = useRef<HTMLButtonElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  // For speaking: store score from async Azure call
  const speakingScoreRef = useRef<number | null>(null)

  // Compute dictation diff once and store in a ref so keyboard handler is never stale
  const dictationDiff = useMemo<DiffToken[] | null>(() => {
    if (props.mode !== 'dictation') return null
    return props.inputMode === 'hanzi'
      ? computeCharDiff(props.userAnswer, segment.chinese)
      : computePinyinDiff(props.userAnswer, segment.pinyin)
  // Props are fixed after mount (segment, userAnswer, inputMode never change for a given reveal)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const dictationDiffRef = useRef(dictationDiff)
  dictationDiffRef.current = dictationDiff

  useEffect(() => {
    nextBtnRef.current?.focus()
  }, [])

  // Keyboard: Enter = next, r = retry
  // Scoped: only fires when focus is within the ShadowingPanel container
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      // Scope: ignore if focus is outside the panel region
      if (!containerRef.current?.contains(document.activeElement)) return
      if (e.key === 'Enter') {
        e.preventDefault()
        const score = props.mode === 'dictation'
          ? (dictationDiffRef.current ? computeAccuracyScore(dictationDiffRef.current) : null)
          : speakingScoreRef.current
        onNext(score)
      }
      if (e.key === 'r') {
        e.preventDefault()
        onRetry()
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const dictationScore = dictationDiff ? computeAccuracyScore(dictationDiff) : null

  return (
    <div
      ref={containerRef}
      className="flex h-full flex-col p-4 gap-3"
      role="region"
      aria-label="Shadowing mode"
      tabIndex={0}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-widest text-foreground/70">{segmentLabel}</span>
        <button
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          onClick={onExit}
          aria-label="Exit shadowing mode"
        >
          ✕ exit
        </button>
      </div>

      {/* Progress bar */}
      <div className="h-px bg-border">
        <div
          className="h-full bg-foreground/40 transition-all duration-300"
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
      </div>

      {/* Correct text reveal */}
      <div className="rounded-lg border border-border glass-surface p-3 text-center">
        <div className="text-xl tracking-widest">{segment.chinese}</div>
        <div className="mt-1 text-xs text-muted-foreground">{segment.pinyin}</div>
        <div className="mt-0.5 text-xs text-muted-foreground/60">
          {segment.translations?.en ?? ''}
        </div>
      </div>

      {/* Dictation diff */}
      {props.mode === 'dictation' && dictationDiff && (
        <div className="space-y-1">
          <div className="flex flex-wrap justify-center gap-0.5">
            {dictationDiff.map((tok, i) => (
              <span
                key={i}
                className={cn('text-base', tok.correct ? 'text-foreground' : 'text-destructive')}
              >
                {tok.text || '□'}
              </span>
            ))}
          </div>
          {dictationScore !== null && (
            <div className="text-center text-xs text-muted-foreground">
              Accuracy: {dictationScore}%
            </div>
          )}
        </div>
      )}

      {/* Speaking scores */}
      {props.mode === 'speaking' && (
        <SpeakingScores
          blob={props.blob}
          segment={segment}
          azureKey={props.azureKey}
          azureRegion={props.azureRegion}
          onScore={(score) => { speakingScoreRef.current = score }}
        />
      )}

      {/* Actions */}
      <div className="mt-auto flex gap-2">
        <button
          className="flex-1 rounded-md border border-border py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          onClick={onRetry}
        >
          ↺ Retry
        </button>
        <Button
          ref={nextBtnRef}
          className="flex-1 py-1.5 text-xs"
          onClick={() => onNext(props.mode === 'dictation' ? dictationScore : speakingScoreRef.current)}
        >
          Next →
        </Button>
      </div>
    </div>
  )
}

// ── SpeakingScores sub-component ──────────────────────────────────────────

interface SpeakingScoresProps {
  blob: Blob
  segment: Segment
  azureKey: string
  azureRegion: string
  onScore: (score: number | null) => void
}

function SpeakingScores({ blob, segment, azureKey, azureRegion, onScore }: SpeakingScoresProps) {
  const [result, setResult] = useState<AssessResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const onScoreRef = useRef(onScore)
  onScoreRef.current = onScore

  useEffect(() => {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10_000)

    async function assess() {
      try {
        const form = new FormData()
        form.append('audio', blob, 'recording.webm')
        form.append('reference_text', segment.chinese)
        form.append('language', 'zh-CN')
        form.append('azure_key', azureKey)
        form.append('azure_region', azureRegion)
        const resp = await fetch('/api/pronunciation/assess', {
          method: 'POST',
          body: form,
          signal: controller.signal,
        })
        if (!resp.ok)
          throw new Error(await resp.text())
        const data: AssessResult = await resp.json()
        setResult(data)
        onScoreRef.current(Math.round(data.overall.accuracy))
      }
      catch (e) {
        setError((e as Error).name === 'AbortError' ? 'Scoring timed out' : 'Scoring unavailable')
        onScoreRef.current(null)
      }
      finally {
        clearTimeout(timeout)
        setLoading(false)
      }
    }

    void assess()
    return () => { controller.abort(); clearTimeout(timeout) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // run once on mount

  if (loading) {
    return <div className="py-2 text-center text-xs text-muted-foreground">Scoring…</div>
  }

  if (error) {
    return <div className="py-2 text-center text-xs text-destructive">{error}</div>
  }

  if (!result) return null

  return (
    <div className="space-y-2">
      <div className="flex gap-1.5">
        {(['accuracy', 'fluency', 'prosody'] as const).map(k => (
          <div key={k} className="flex-1 rounded-md border border-border glass-surface p-2 text-center">
            <div className="text-sm font-semibold">{Math.round(result.overall[k])}</div>
            <div className="text-xs capitalize text-muted-foreground">{k}</div>
          </div>
        ))}
      </div>
      <div className="flex items-end justify-center gap-1" style={{ height: 44 }}>
        {result.words.map((w, i) => (
          <div key={i} className="flex flex-col items-center gap-0.5">
            <div
              className="w-5 overflow-hidden rounded-sm bg-border"
              style={{ height: 28, position: 'relative' }}
            >
              <div
                className={cn(
                  'absolute bottom-0 left-0 right-0 rounded-sm',
                  w.accuracy >= 80 ? 'bg-foreground/60' : 'bg-destructive/70',
                )}
                style={{ height: `${w.accuracy}%` }}
              />
            </div>
            <span className="text-[9px] text-muted-foreground">{w.word}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/shadowing/ShadowingRevealPhase.tsx
git commit -m "feat: add ShadowingRevealPhase with char diff (dictation) and Azure scores (speaking)"
```

---

## Chunk 5: ShadowingPanel (State Machine)

### Task 10: `ShadowingPanel`

**Files:**
- Create: `frontend/src/components/shadowing/ShadowingPanel.tsx`

Key behaviours:
- Starts at `segmentIndex = 0`, `phase = 'listen'`
- Auto-skip check runs whenever `segmentIndex` changes (via `useEffect`)
- `handleRetry`: sets `phase = 'listen'` for same segment — no result recorded yet; the next `handleNext` records the result
- `handleNext(score)`: records `SegmentResult` with the score, then advances
- `handleSkip`: records skipped result, advances
- Exit confirmation threshold: `attemptedCount() >= 3` (de-duplicated by segment index)
- Session summary shown when `segmentIndex >= segments.length` after advancing

- [ ] **Step 1: Write the component**

```typescript
import type { Segment } from '@/types'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { SegmentResult } from '@/lib/shadowing-utils'
import { computeSessionSummary, isAutoSkipSegment } from '@/lib/shadowing-utils'
import { ShadowingDictationPhase } from './ShadowingDictationPhase'
import { ShadowingListenPhase } from './ShadowingListenPhase'
import { ShadowingRevealPhase } from './ShadowingRevealPhase'
import { ShadowingSessionSummary } from './ShadowingSessionSummary'
import { ShadowingSpeakingPhase } from './ShadowingSpeakingPhase'

type Phase = 'listen' | 'attempt' | 'reveal'

interface ShadowingPanelProps {
  segments: Segment[]
  mode: 'dictation' | 'speaking'
  azureKey: string
  azureRegion: string
  onExit: () => void
}

export function ShadowingPanel({ segments, mode, azureKey, azureRegion, onExit }: ShadowingPanelProps) {
  const [segmentIndex, setSegmentIndex] = useState(0)
  const [phase, setPhase] = useState<Phase>('listen')
  const [results, setResults] = useState<SegmentResult[]>([])
  const [showSummary, setShowSummary] = useState(false)
  const [showExitConfirm, setShowExitConfirm] = useState(false)

  // State carried from Attempt phase → Reveal phase
  const [dictationAnswer, setDictationAnswer] = useState<string | null>(null)
  const [dictationInputMode, setDictationInputMode] = useState<'hanzi' | 'pinyin'>('hanzi')
  const [speakingBlob, setSpeakingBlob] = useState<Blob | null>(null)

  const segment = segments[segmentIndex] ?? null

  // Auto-skip: runs when segmentIndex changes
  useEffect(() => {
    if (segmentIndex >= segments.length) {
      setShowSummary(true)
      return
    }
    const seg = segments[segmentIndex]
    if (seg && isAutoSkipSegment(seg)) {
      setResults(prev => [...prev, {
        segmentIndex,
        attempted: false,
        skipped: false,
        autoSkipped: true,
        score: null,
      }])
      setSegmentIndex(si => si + 1)
    }
  }, [segmentIndex, segments])

  // Count attempted segments (de-duplicated, same definition as session summary)
  function attemptedCount(): number {
    const byIndex = new Map<number, SegmentResult>()
    for (const r of results) byIndex.set(r.segmentIndex, r)
    return [...byIndex.values()].filter(r => r.attempted).length
  }

  function handleExitRequest() {
    if (attemptedCount() >= 3) {
      setShowExitConfirm(true)
    }
    else {
      onExit()
    }
  }

  function handleAutoTransition() {
    setPhase('attempt')
  }

  function handleDictationSubmit(answer: string, inputMode: 'hanzi' | 'pinyin') {
    setDictationAnswer(answer)
    setDictationInputMode(inputMode)
    setPhase('reveal')
  }

  function handleSpeakingSubmit(blob: Blob) {
    setSpeakingBlob(blob)
    setPhase('reveal')
  }

  function handleRetry() {
    // Go back to listen phase for the same segment — no result recorded
    setPhase('listen')
  }

  function handleNext(score: number | null) {
    setResults(prev => [...prev, {
      segmentIndex,
      attempted: true,
      skipped: false,
      autoSkipped: false,
      score,
    }])
    advanceToNextSegment()
  }

  function handleSkip() {
    setResults(prev => [...prev, {
      segmentIndex,
      attempted: false,
      skipped: true,
      autoSkipped: false,
      score: null,
    }])
    advanceToNextSegment()
  }

  function advanceToNextSegment() {
    const next = segmentIndex + 1
    if (next >= segments.length) {
      setShowSummary(true)
    }
    else {
      setSegmentIndex(next)
      setPhase('listen')
    }
  }

  const segmentLabel = `${segmentIndex + 1} / ${segments.length}`
  const progress = segments.length > 0 ? (segmentIndex + 1) / segments.length : 0

  if (showSummary) {
    return (
      <ShadowingSessionSummary
        summary={computeSessionSummary(results, segments.length)}
        segments={segments}
        onDone={onExit}
      />
    )
  }

  if (!segment) return null

  return (
    <div className="flex h-full flex-col glass-card">
      {phase === 'listen' && (
        <ShadowingListenPhase
          key={`listen-${segmentIndex}`}
          segment={segment}
          segmentLabel={segmentLabel}
          progress={progress}
          onAutoTransition={handleAutoTransition}
          onSkip={handleSkip}
          onExit={handleExitRequest}
        />
      )}

      {phase === 'attempt' && mode === 'dictation' && (
        <ShadowingDictationPhase
          segment={segment}
          segmentLabel={segmentLabel}
          progress={progress}
          onSubmit={handleDictationSubmit}
          onSkip={handleSkip}
          onExit={handleExitRequest}
        />
      )}

      {phase === 'attempt' && mode === 'speaking' && (
        <ShadowingSpeakingPhase
          segment={segment}
          segmentLabel={segmentLabel}
          progress={progress}
          onSubmit={handleSpeakingSubmit}
          onSkip={handleSkip}
          onExit={handleExitRequest}
        />
      )}

      {phase === 'reveal' && mode === 'dictation' && dictationAnswer !== null && (
        <ShadowingRevealPhase
          mode="dictation"
          segment={segment}
          userAnswer={dictationAnswer}
          inputMode={dictationInputMode}
          segmentLabel={segmentLabel}
          progress={progress}
          onRetry={handleRetry}
          onNext={handleNext}
          onExit={handleExitRequest}
        />
      )}

      {phase === 'reveal' && mode === 'speaking' && speakingBlob !== null && (
        <ShadowingRevealPhase
          mode="speaking"
          segment={segment}
          blob={speakingBlob}
          azureKey={azureKey}
          azureRegion={azureRegion}
          segmentLabel={segmentLabel}
          progress={progress}
          onRetry={handleRetry}
          onNext={handleNext}
          onExit={handleExitRequest}
        />
      )}

      {/* Exit confirmation */}
      <Dialog open={showExitConfirm} onOpenChange={open => { if (!open) setShowExitConfirm(false) }}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Exit shadowing mode?</DialogTitle>
            <DialogDescription>Your progress will be lost.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 sm:justify-end">
            <Button variant="outline" onClick={() => setShowExitConfirm(false)}>Keep going</Button>
            <Button variant="destructive" onClick={() => { setShowExitConfirm(false); onExit() }}>Exit</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
```

Note on the `key` prop: `key={\`listen-${segmentIndex}\`}` on `ShadowingListenPhase` ensures it fully unmounts and remounts when `segmentIndex` changes (natural reset of `hasAutoTransitioned`). When the user retries from the same segment, `phase` changes `'reveal' → 'listen'` with the same `segmentIndex`, causing unmount/remount and a clean `hasAutoTransitioned = false`.

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/shadowing/ShadowingPanel.tsx
git commit -m "feat: add ShadowingPanel state machine"
```

---

### Task 11: Integration tests for `ShadowingPanel`

**Files:**
- Create: `frontend/tests/ShadowingPanel.test.tsx`

- [ ] **Step 1: Write the tests**

```typescript
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ShadowingPanel } from '@/components/shadowing/ShadowingPanel'
import type { Segment } from '@/types'

// ── Mock PlayerContext ─────────────────────────────────────────────────────

let endedCallbacks: Array<() => void> = []

const mockPlayer = {
  play: vi.fn(),
  pause: vi.fn(),
  seekTo: vi.fn(),
  getCurrentTime: vi.fn(() => 0),
  getDuration: vi.fn(() => 60),
  setPlaybackRate: vi.fn(),
  setVolume: vi.fn(),
  onTimeUpdate: vi.fn(() => vi.fn()),
  onEnded: vi.fn((cb: () => void) => {
    endedCallbacks.push(cb)
    return () => { endedCallbacks = endedCallbacks.filter(c => c !== cb) }
  }),
  onPlay: vi.fn(() => vi.fn()),
  onPause: vi.fn(() => vi.fn()),
  destroy: vi.fn(),
}

vi.mock('@/contexts/PlayerContext', () => ({
  usePlayer: () => ({ player: mockPlayer, currentTime: 0 }),
}))

// ── Helpers ───────────────────────────────────────────────────────────────

function makeSegment(i: number, duration = 3): Segment {
  return {
    id: `seg-${i}`,
    start: i * 5,
    end: i * 5 + duration,
    chinese: `中文${i}`,
    pinyin: `zhongwen${i}`,
    translations: { en: `English ${i}` },
    words: [],
  }
}

const DEFAULT_PROPS = {
  segments: [makeSegment(0), makeSegment(1)],
  mode: 'dictation' as const,
  azureKey: '',
  azureRegion: '',
  onExit: vi.fn(),
}

function fireEnded() {
  endedCallbacks.forEach(cb => cb())
}

async function advanceThroughDictation(answer: string) {
  fireEnded()
  await waitFor(() => { expect(screen.getByRole('textbox')).toBeTruthy() })
  fireEvent.change(screen.getByRole('textbox'), { target: { value: answer } })
  fireEvent.click(screen.getByRole('button', { name: /submit/i }))
  await waitFor(() => { expect(screen.getByRole('button', { name: /next/i })).toBeTruthy() })
  fireEvent.click(screen.getByRole('button', { name: /next/i }))
}

beforeEach(() => {
  vi.clearAllMocks()
  endedCallbacks = []
})

// ── Tests ─────────────────────────────────────────────────────────────────

describe('shadowingPanel', () => {
  it('starts in Listen phase, seeks to segment 0, plays', () => {
    render(<ShadowingPanel {...DEFAULT_PROPS} />)
    expect(screen.getByText(/listen/i)).toBeTruthy()
    expect(mockPlayer.seekTo).toHaveBeenCalledWith(0) // segment 0 start
    expect(mockPlayer.play).toHaveBeenCalled()
  })

  it('transitions to dictation attempt after ended event fires', async () => {
    render(<ShadowingPanel {...DEFAULT_PROPS} />)
    fireEnded()
    await waitFor(() => {
      expect(screen.getByText(/type what you heard/i)).toBeTruthy()
    })
  })

  it('does not transition twice on double ended event', async () => {
    render(<ShadowingPanel {...DEFAULT_PROPS} />)
    fireEnded()
    fireEnded()
    await waitFor(() => {
      expect(screen.getByText(/type what you heard/i)).toBeTruthy()
    })
    // Still in dictation, not skipped forward
    expect(screen.getByText(/1 \/ 2/)).toBeTruthy()
  })

  it('shows Reveal phase after dictation submit', async () => {
    render(<ShadowingPanel {...DEFAULT_PROPS} />)
    fireEnded()
    await waitFor(() => screen.getByRole('textbox'))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '中文0' } })
    fireEvent.click(screen.getByRole('button', { name: /submit/i }))
    await waitFor(() => {
      expect(screen.getByText('中文0')).toBeTruthy() // correct chinese shown
      expect(screen.getByRole('button', { name: /next/i })).toBeTruthy()
    })
  })

  it('returns to Listen on Retry (same segment)', async () => {
    render(<ShadowingPanel {...DEFAULT_PROPS} />)
    fireEnded()
    await waitFor(() => screen.getByRole('textbox'))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'x' } })
    fireEvent.click(screen.getByRole('button', { name: /submit/i }))
    await waitFor(() => screen.getByRole('button', { name: /retry/i }))
    fireEvent.click(screen.getByRole('button', { name: /retry/i }))
    await waitFor(() => {
      expect(screen.getByText(/listen/i)).toBeTruthy()
      expect(screen.getByText(/1 \/ 2/)).toBeTruthy() // still segment 1
    })
  })

  it('advances to segment 2 after Next', async () => {
    render(<ShadowingPanel {...DEFAULT_PROPS} />)
    await advanceThroughDictation('中文0')
    await waitFor(() => {
      expect(screen.getByText(/2 \/ 2/)).toBeTruthy()
    })
  })

  it('shows session summary after all segments completed', async () => {
    render(<ShadowingPanel {...DEFAULT_PROPS} segments={[makeSegment(0)]} />)
    await advanceThroughDictation('中文0')
    await waitFor(() => {
      expect(screen.getByText(/session complete/i)).toBeTruthy()
    })
  })

  it('exits silently when < 3 attempts', () => {
    const onExit = vi.fn()
    render(<ShadowingPanel {...DEFAULT_PROPS} onExit={onExit} />)
    fireEvent.click(screen.getByLabelText(/exit shadowing mode/i))
    expect(onExit).toHaveBeenCalledOnce()
    expect(screen.queryByText(/exit shadowing mode\?/i)).toBeNull()
  })

  it('shows confirmation dialog when >= 3 attempts', async () => {
    const segments = [0, 1, 2, 3].map(i => makeSegment(i))
    render(<ShadowingPanel {...DEFAULT_PROPS} segments={segments} />)

    await advanceThroughDictation('中文0')
    await advanceThroughDictation('中文1')
    await advanceThroughDictation('中文2')

    fireEvent.click(screen.getByLabelText(/exit shadowing mode/i))
    await waitFor(() => {
      expect(screen.getByText(/exit shadowing mode\?/i)).toBeTruthy()
    })
  })

  it('auto-skips segments with duration < 0.5 s', async () => {
    const segments = [
      { ...makeSegment(0), start: 0, end: 0.3 }, // short
      makeSegment(1),
    ]
    render(<ShadowingPanel {...DEFAULT_PROPS} segments={segments} />)
    // Should auto-skip to segment 1 — seekTo called with segment 1's start
    await waitFor(() => {
      expect(mockPlayer.seekTo).toHaveBeenCalledWith(segments[1].start)
    })
  })

  it('does not submit empty dictation answer (shake only)', async () => {
    render(<ShadowingPanel {...DEFAULT_PROPS} />)
    fireEnded()
    await waitFor(() => screen.getByRole('textbox'))
    // Leave input empty, click Submit
    fireEvent.click(screen.getByRole('button', { name: /submit/i }))
    // Should still be in dictation phase
    expect(screen.getByRole('textbox')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run the tests**

```bash
cd /home/ross-geller/Projects/personal/shadowing-companion/frontend && npx vitest run tests/ShadowingPanel.test.tsx
```
Expected: All PASS

- [ ] **Step 3: Commit**

```bash
git add frontend/tests/ShadowingPanel.test.tsx
git commit -m "test: add integration tests for ShadowingPanel state machine"
```

---

## Chunk 6: LessonView + VideoPanel Integration

### Task 12: Add Shadow button to `VideoPanel`

**Files:**
- Modify: `frontend/src/components/lesson/VideoPanel.tsx`

Changes: Add `onShadowingClick?: () => void` and `hasSegments?: boolean` to `VideoPanelProps`, add Shadow button in the metadata bar.

- [ ] **Step 1: Update the interface**

In `VideoPanelProps`, add two optional props:
```typescript
onShadowingClick?: () => void
hasSegments?: boolean
```

- [ ] **Step 2: Destructure the new props**

Change the function signature from:
```typescript
export function VideoPanel({ lesson, videoBlob, onRename }: VideoPanelProps) {
```
to:
```typescript
export function VideoPanel({ lesson, videoBlob, onRename, onShadowingClick, hasSegments = false }: VideoPanelProps) {
```

- [ ] **Step 3: Add the Shadow button in the metadata bar**

In the metadata bar `<div>` (the last div before the closing `</div>` of the component), add after the existing Badge elements:

```tsx
{onShadowingClick && (
  <Button
    variant="ghost"
    size="xs"
    className="ml-auto shrink-0 text-xs"
    onClick={onShadowingClick}
    disabled={!hasSegments}
    title={hasSegments ? 'Start shadowing mode' : 'No segments yet'}
  >
    🎯 Shadow
  </Button>
)}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/lesson/VideoPanel.tsx
git commit -m "feat: add Shadow button to VideoPanel metadata bar"
```

---

### Task 13: Wire `ShadowingPanel` into `LessonView`

**Files:**
- Modify: `frontend/src/components/lesson/LessonView.tsx`

- [ ] **Step 1: Add imports**

```typescript
import { ShadowingModePicker } from '@/components/shadowing/ShadowingModePicker'
import { ShadowingPanel } from '@/components/shadowing/ShadowingPanel'
```

- [ ] **Step 2: Add state (after existing `useState` declarations)**

```typescript
type ShadowingActiveMode = null | { mode: 'dictation' | 'speaking' }
const [shadowingMode, setShadowingMode] = useState<ShadowingActiveMode>(null)
const [pickerOpen, setPickerOpen] = useState(false)
```

- [ ] **Step 3: Add handlers (after existing `useCallback` handlers)**

```typescript
const handleShadowingClick = useCallback(() => {
  setPickerOpen(true)
}, [])

const handleShadowingStart = useCallback((mode: 'dictation' | 'speaking') => {
  setShadowingMode({ mode })
  setPickerOpen(false)
}, [])

const handleShadowingExit = useCallback(() => {
  setShadowingMode(null)
}, [])
```

- [ ] **Step 4: Compute speaking availability (after handlers)**

```typescript
const speakingAvailable
  = Boolean(keys?.azureSpeechKey && keys?.azureSpeechRegion)
    && typeof MediaRecorder !== 'undefined'
```

- [ ] **Step 5: Pass `onShadowingClick` to `VideoPanel`**

Add two props to the existing `<VideoPanel ...>` call:
```tsx
onShadowingClick={handleShadowingClick}
hasSegments={segments.length > 0}
```

- [ ] **Step 6: Replace `<TranscriptPanel>` with conditional rendering**

Replace the current center panel (the `<div>` containing `<TranscriptPanel>`) with:

```tsx
{/* Transcript / Shadowing Panel — 34% */}
<div className="h-full overflow-hidden border-r border-border" style={{ width: '34%' }}>
  {shadowingMode
    ? (
        <ShadowingPanel
          segments={segments}
          mode={shadowingMode.mode}
          azureKey={keys?.azureSpeechKey ?? ''}
          azureRegion={keys?.azureSpeechRegion ?? ''}
          onExit={handleShadowingExit}
        />
      )
    : (
        <TranscriptPanel
          segments={segments}
          activeSegment={activeSegment}
          lesson={meta}
          onSegmentClick={handleSegmentClick}
          onProgressUpdate={handleProgressUpdate}
        />
      )}
</div>
```

- [ ] **Step 7: Add `ShadowingModePicker` dialog (inside the return, at the end of the root div)**

```tsx
<ShadowingModePicker
  open={pickerOpen}
  speakingAvailable={speakingAvailable}
  onStart={handleShadowingStart}
  onCancel={() => setPickerOpen(false)}
/>
```

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/lesson/LessonView.tsx
git commit -m "feat: wire ShadowingPanel and ShadowingModePicker into LessonView"
```

---

### Task 14: Final verification

- [ ] **Step 1: Run all tests**

```bash
cd /home/ross-geller/Projects/personal/shadowing-companion/frontend && npx vitest run
```
Expected: All PASS

- [ ] **Step 2: TypeScript check**

```bash
cd /home/ross-geller/Projects/personal/shadowing-companion/frontend && npx tsc --noEmit
```
Expected: No errors

- [ ] **Step 3: Lint shadowing components**

```bash
cd /home/ross-geller/Projects/personal/shadowing-companion/frontend && npx eslint src/components/shadowing/ src/lib/shadowing-utils.ts
```
Expected: No errors (ignore known `eslint-disable` comments in effects)

- [ ] **Step 4: Commit any lint fixes**

```bash
git add -p
git commit -m "chore: lint fixes for shadowing components"
```
