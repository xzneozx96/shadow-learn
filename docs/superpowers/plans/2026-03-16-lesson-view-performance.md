# LessonView Performance Fix Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate 60fps React re-renders during video playback by moving `currentTime` out of React state into a ref+subscription model, and fix broken memoisation and unstable prop patterns.

**Architecture:** `PlayerContext` exposes `subscribeTime(cb)` and `getTime()` instead of `currentTime` state. Visual consumers (scrubber, timestamp, karaoke) write directly to DOM refs. Semantic consumers (`useActiveSegment`) gate `setState` on segment-identity changes. Shadowing phases use a new `useTimeEffect` hook. Prop stability and event delegation fixes land on `TranscriptPanel`.

**Tech Stack:** React 19, TypeScript, Vitest + @testing-library/react, Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-03-16-lesson-view-performance-design.md`

---

## File Map

| File | Change |
|---|---|
| `frontend/src/contexts/PlayerContext.tsx` | Remove `currentTime` state; add `subscribeTime`, `getTime`, `timeRef`, `subscribersRef`, internal fan-out effect |
| `frontend/tests/PlayerContext.test.tsx` | Add tests for `subscribeTime` and `getTime`; remove any `currentTime` assertions |
| `frontend/src/hooks/useTimeEffect.ts` | New hook — subscribe to time without React state |
| `frontend/tests/useTimeEffect.test.ts` | New test file |
| `frontend/src/hooks/useActiveSegment.ts` | Subscription-gated setState; binary search; remove `currentTime` param |
| `frontend/tests/useActiveSegment.test.ts` | Rewrite to use mock `subscribeTime` + tick helper |
| `frontend/src/components/lesson/SegmentText.tsx` | Remove `currentTime` prop; `charSpanRefs` + `posMapRef` + subscription for karaoke |
| `frontend/src/components/lesson/TranscriptPanel.tsx` | Remove `currentTime` from `usePlayer()`; stable `onSaveWord`/`isSaved`; event delegation; key `SegmentText` by `segment.id` |
| `frontend/src/components/lesson/VideoPanel.tsx` | Remove `currentTime` from `usePlayer()`; scrubber + timestamp → DOM ref writes |
| `frontend/src/components/lesson/LessonView.tsx` | Remove `currentTime` from `usePlayer()`; update `useActiveSegment` call; fix `videoBlob` dep |
| `frontend/src/components/shadowing/ShadowingListenPhase.tsx` | Replace `useEffect([currentTime])` with `useTimeEffect(cb, segment.id)` |
| `frontend/src/components/shadowing/ShadowingSpeakingPhase.tsx` | Same |
| `frontend/src/components/shadowing/ShadowingDictationPhase.tsx` | Same |
| `frontend/tests/ShadowingPanel.test.tsx` | Update `usePlayer` mock: remove `currentTime`, add `subscribeTime`/`getTime` |

**Test command:** `cd frontend && npx vitest run`
**Type-check command:** `cd frontend && npx tsc --noEmit`

---

## Chunk 1: Infrastructure — PlayerContext, useTimeEffect, useActiveSegment

### Task 1: Refactor PlayerContext

**Files:**
- Modify: `frontend/src/contexts/PlayerContext.tsx`
- Modify: `frontend/tests/PlayerContext.test.tsx`

- [ ] **Step 1.1: Write failing tests for `subscribeTime` and `getTime`**

Add to `frontend/tests/PlayerContext.test.tsx` after the existing `describe` block:

```tsx
describe('playerContext subscribeTime / getTime', () => {
  it('getTime returns 0 before any player is set', () => {
    const { result } = renderHook(() => usePlayer(), { wrapper })
    expect(result.current.getTime()).toBe(0)
  })

  it('subscribeTime delivers time ticks fired by the player', () => {
    let fireTime: ((t: number) => void) | null = null
    const player = makePlayer({
      onTimeUpdate: vi.fn((cb) => {
        fireTime = cb
        return () => {}
      }),
    })
    const { result } = renderHook(() => usePlayer(), { wrapper })
    act(() => { result.current.setPlayer(player) })

    const received: number[] = []
    act(() => { result.current.subscribeTime(t => received.push(t)) })

    act(() => { fireTime!(1.5) })
    act(() => { fireTime!(2.0) })

    expect(received).toEqual([1.5, 2.0])
  })

  it('getTime returns the most recent time tick', () => {
    let fireTime: ((t: number) => void) | null = null
    const player = makePlayer({
      onTimeUpdate: vi.fn((cb) => { fireTime = cb; return () => {} }),
    })
    const { result } = renderHook(() => usePlayer(), { wrapper })
    act(() => { result.current.setPlayer(player) })
    act(() => { fireTime!(42.5) })
    expect(result.current.getTime()).toBe(42.5)
  })

  it('subscribeTime cleanup removes the subscriber', () => {
    let fireTime: ((t: number) => void) | null = null
    const player = makePlayer({
      onTimeUpdate: vi.fn((cb) => { fireTime = cb; return () => {} }),
    })
    const { result } = renderHook(() => usePlayer(), { wrapper })
    act(() => { result.current.setPlayer(player) })

    const received: number[] = []
    let unsub!: () => void
    act(() => { unsub = result.current.subscribeTime(t => received.push(t)) })
    act(() => { fireTime!(1.0) })
    act(() => { unsub() })
    act(() => { fireTime!(2.0) })

    expect(received).toEqual([1.0])
  })

  it('survives player swap — subscribers receive ticks from new player', () => {
    let fire1: ((t: number) => void) | null = null
    let fire2: ((t: number) => void) | null = null
    const player1 = makePlayer({ onTimeUpdate: vi.fn(cb => { fire1 = cb; return () => {} }) })
    const player2 = makePlayer({ onTimeUpdate: vi.fn(cb => { fire2 = cb; return () => {} }) })

    const { result } = renderHook(() => usePlayer(), { wrapper })
    act(() => { result.current.setPlayer(player1) })

    const received: number[] = []
    act(() => { result.current.subscribeTime(t => received.push(t)) })

    act(() => { fire1!(1.0) })
    act(() => { result.current.setPlayer(player2) })
    act(() => { fire2!(2.0) })

    expect(received).toEqual([1.0, 2.0])
  })
})
```

- [ ] **Step 1.2: Run the new tests to confirm they fail**

```bash
cd frontend && npx vitest run tests/PlayerContext.test.tsx
```

Expected: the new `subscribeTime / getTime` describe block fails because `subscribeTime` and `getTime` don't exist yet.

- [ ] **Step 1.3: Implement the PlayerContext changes**

Replace `frontend/src/contexts/PlayerContext.tsx` entirely:

```tsx
import type { ReactNode } from 'react'
import type { VideoPlayer } from '../player/types'
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'

interface PlayerState {
  player: VideoPlayer | null
  playbackRate: number
  volume: number
  setPlayer: (player: VideoPlayer) => void
  setPlaybackRate: (rate: number) => void
  setVolume: (v: number) => void
  subscribeTime: (cb: (t: number) => void) => () => void
  getTime: () => number
}

const PlayerContext = createContext<PlayerState | null>(null)

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [player, setPlayer_] = useState<VideoPlayer | null>(null)
  const [playbackRate, setPlaybackRate_] = useState(1)
  const [volume, setVolume_] = useState(1)

  const timeRef = useRef(0)
  const subscribersRef = useRef<Set<(t: number) => void>>(new Set())
  const unsubRef = useRef<(() => void) | null>(null)

  // Fan-out: wire current player's onTimeUpdate to all subscribers
  useEffect(() => {
    if (!player) return
    if (unsubRef.current) unsubRef.current()
    unsubRef.current = player.onTimeUpdate((time) => {
      timeRef.current = time
      for (const cb of subscribersRef.current) cb(time)
    })
    return () => {
      unsubRef.current?.()
      unsubRef.current = null
    }
  }, [player])

  const setPlayer = useCallback((newPlayer: VideoPlayer) => {
    setPlayer_(newPlayer)
  }, [])

  const subscribeTime = useCallback((cb: (t: number) => void) => {
    subscribersRef.current.add(cb)
    return () => { subscribersRef.current.delete(cb) }
  }, [])

  const getTime = useCallback(() => timeRef.current, [])

  const setPlaybackRate = useCallback(
    (rate: number) => {
      player?.setPlaybackRate(rate)
      setPlaybackRate_(rate)
    },
    [player],
  )

  const setVolume = useCallback(
    (v: number) => {
      const clamped = Math.max(0, Math.min(1, v))
      player?.setVolume(clamped)
      setVolume_(clamped)
    },
    [player],
  )

  return (
    <PlayerContext
      value={{ player, playbackRate, volume, setPlayer, setPlaybackRate, setVolume, subscribeTime, getTime }}
    >
      {children}
    </PlayerContext>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function usePlayer(): PlayerState {
  const ctx = use(PlayerContext)
  if (!ctx)
    throw new Error('usePlayer must be used within PlayerProvider')
  return ctx
}
```

> **Note:** The `// eslint-disable-next-line react-refresh/only-export-components` comment before `usePlayer` must be preserved — the antfu config flags non-component exports from component files. The current file already has this suppression.
```

- [ ] **Step 1.4: Run tests — PlayerContext tests pass, TypeScript errors expected elsewhere**

```bash
cd frontend && npx vitest run tests/PlayerContext.test.tsx
```

Expected: all PlayerContext tests pass. TypeScript errors in other files referencing `currentTime` are expected — those are fixed in later tasks.

- [ ] **Step 1.5: Commit**

```bash
cd frontend && git add src/contexts/PlayerContext.tsx tests/PlayerContext.test.tsx && git commit -m "refactor: remove currentTime from PlayerContext state; add subscribeTime/getTime"
```

---

### Task 2: Create `useTimeEffect` hook

**Files:**
- Create: `frontend/src/hooks/useTimeEffect.ts`
- Create: `frontend/tests/useTimeEffect.test.ts`

- [ ] **Step 2.1: Write failing tests for `useTimeEffect`**

Create `frontend/tests/useTimeEffect.test.ts`:

```ts
import type { DependencyList } from 'react'
import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useTimeEffect } from '../src/hooks/useTimeEffect'

// ── Mock PlayerContext ────────────────────────────────────────────────────────
let timeSubscribers: Set<(t: number) => void>

vi.mock('../src/contexts/PlayerContext', () => ({
  usePlayer: () => ({
    subscribeTime: (cb: (t: number) => void) => {
      timeSubscribers.add(cb)
      return () => { timeSubscribers.delete(cb) }
    },
  }),
}))

function tick(time: number) {
  timeSubscribers.forEach(cb => cb(time))
}

describe('useTimeEffect', () => {
  beforeEach(() => {
    timeSubscribers = new Set()
  })

  it('calls callback on each time tick', () => {
    const cb = vi.fn()
    renderHook(() => useTimeEffect(cb, 'key1'))
    tick(1.5)
    tick(2.0)
    expect(cb).toHaveBeenCalledTimes(2)
    expect(cb).toHaveBeenNthCalledWith(1, 1.5)
    expect(cb).toHaveBeenNthCalledWith(2, 2.0)
  })

  it('always calls the latest callback without re-subscribing', () => {
    const cb1 = vi.fn()
    const cb2 = vi.fn()
    const { rerender } = renderHook(
      ({ cb }: { cb: (t: number) => void }) => useTimeEffect(cb, 'key1'),
      { initialProps: { cb: cb1 } },
    )
    tick(1.0)
    rerender({ cb: cb2 })
    tick(2.0)
    // cb1 was active for tick 1; cb2 took over for tick 2
    expect(cb1).toHaveBeenCalledTimes(1)
    expect(cb2).toHaveBeenCalledTimes(1)
    expect(cb2).toHaveBeenCalledWith(2.0)
    // Only one subscriber (no duplicate)
    expect(timeSubscribers.size).toBe(1)
  })

  it('re-subscribes when key changes', () => {
    const subscribeCallCount = { value: 0 }
    const originalSubscribe = vi.fn((cb: (t: number) => void) => {
      subscribeCallCount.value++
      timeSubscribers.add(cb)
      return () => { timeSubscribers.delete(cb) }
    })

    // Override mock for this test
    const { subscribeTime } = { subscribeTime: originalSubscribe }
    let currentSubscribeTime = subscribeTime

    vi.doMock('../src/contexts/PlayerContext', () => ({
      usePlayer: () => ({ subscribeTime: currentSubscribeTime }),
    }))

    const cb = vi.fn()
    const { rerender } = renderHook(
      ({ key }: { key: string }) => useTimeEffect(cb, key),
      { initialProps: { key: 'seg_001' } },
    )
    tick(1.0)
    expect(cb).toHaveBeenCalledTimes(1)

    rerender({ key: 'seg_002' })
    // After key change, old subscriber is removed and new one added
    expect(timeSubscribers.size).toBe(1)
    tick(2.0)
    expect(cb).toHaveBeenCalledTimes(2)
  })

  it('cleans up subscription on unmount', () => {
    const cb = vi.fn()
    const { unmount } = renderHook(() => useTimeEffect(cb, 'key1'))
    expect(timeSubscribers.size).toBe(1)
    unmount()
    expect(timeSubscribers.size).toBe(0)
  })
})
```

- [ ] **Step 2.2: Run tests to confirm they fail**

```bash
cd frontend && npx vitest run tests/useTimeEffect.test.ts
```

Expected: FAIL — `useTimeEffect` does not exist yet.

- [ ] **Step 2.3: Implement `useTimeEffect`**

Create `frontend/src/hooks/useTimeEffect.ts`:

```ts
import { useEffect, useRef } from 'react'
import { usePlayer } from '@/contexts/PlayerContext'

/**
 * Subscribe to the player's time stream without going through React state.
 * The callback fires on every RAF tick during playback.
 *
 * @param cb   Time callback — always-fresh via internal ref, safe to capture local state.
 * @param key  Re-subscribes when this value changes (pass segment.id or similar stable identity).
 */
export function useTimeEffect(cb: (t: number) => void, key: unknown): void {
  const { subscribeTime } = usePlayer()
  const cbRef = useRef(cb)
  // Keep cbRef current whenever cb changes — dep array [cb] satisfies exhaustive-deps
  useEffect(() => { cbRef.current = cb }, [cb])
  useEffect(() => {
    return subscribeTime(t => cbRef.current(t))
  // subscribeTime is stable (useCallback with []); key triggers re-subscribe on segment change.
  // cbRef is a stable ref — its .current is accessed at call time, not in the dep array.
  }, [subscribeTime, key])
}
```

- [ ] **Step 2.4: Run tests**

```bash
cd frontend && npx vitest run tests/useTimeEffect.test.ts
```

Expected: all pass.

- [ ] **Step 2.5: Commit**

```bash
cd frontend && git add src/hooks/useTimeEffect.ts tests/useTimeEffect.test.ts && git commit -m "feat: add useTimeEffect hook for RAF-rate callbacks without React state"
```

---

### Task 3: Refactor `useActiveSegment`

**Files:**
- Modify: `frontend/src/hooks/useActiveSegment.ts`
- Modify: `frontend/tests/useActiveSegment.test.ts`

- [ ] **Step 3.1: Rewrite the test file**

**The existing test file calls the old 2-argument signature (`useActiveSegment(segments, currentTime)`) and has no PlayerContext wrapper. It must be replaced in full — do not append to it.**

Replace `frontend/tests/useActiveSegment.test.ts` entirely:

```ts
import type { Segment } from '../src/types'
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useActiveSegment } from '../src/hooks/useActiveSegment'

// ── Mock PlayerContext ────────────────────────────────────────────────────────
let timeSubscribers: Set<(t: number) => void>

vi.mock('../src/contexts/PlayerContext', () => ({
  usePlayer: () => ({
    subscribeTime: (cb: (t: number) => void) => {
      timeSubscribers.add(cb)
      return () => { timeSubscribers.delete(cb) }
    },
    getTime: () => 0,
  }),
}))

function tick(time: number) {
  act(() => { timeSubscribers.forEach(cb => cb(time)) })
}

// ── Fixtures ──────────────────────────────────────────────────────────────────
const segments: Segment[] = [
  { id: 'seg_000', start: 0, end: 2, chinese: 'A', pinyin: 'a', translations: {}, words: [] },
  { id: 'seg_001', start: 3, end: 5, chinese: 'B', pinyin: 'b', translations: {}, words: [] },
  { id: 'seg_002', start: 6, end: 8, chinese: 'C', pinyin: 'c', translations: {}, words: [] },
]

describe('useActiveSegment', () => {
  beforeEach(() => {
    timeSubscribers = new Set()
  })

  it('returns segment when time is within range', () => {
    const { result } = renderHook(() => useActiveSegment(segments))
    tick(3.5)
    expect(result.current?.id).toBe('seg_001')
  })

  it('returns last past segment when time is in a gap', () => {
    const { result } = renderHook(() => useActiveSegment(segments))
    tick(2.5)
    expect(result.current?.id).toBe('seg_000')
  })

  it('returns null when no segments exist', () => {
    const { result } = renderHook(() => useActiveSegment([]))
    tick(1.0)
    expect(result.current).toBeNull()
  })

  it('returns null when time is before the first segment', () => {
    const segs: Segment[] = [
      { id: 'seg_000', start: 5, end: 10, chinese: 'A', pinyin: 'a', translations: {}, words: [] },
    ]
    const { result } = renderHook(() => useActiveSegment(segs))
    tick(2.0)
    expect(result.current).toBeNull()
  })

  it('does not re-render when active segment identity does not change', () => {
    let renderCount = 0
    const { result } = renderHook(() => {
      renderCount++
      return useActiveSegment(segments)
    })
    const initialRenders = renderCount
    tick(3.0) // → seg_001
    tick(3.5) // → seg_001 (same)
    tick(4.0) // → seg_001 (same)
    expect(result.current?.id).toBe('seg_001')
    // Only one additional render after the first tick that changed the segment
    expect(renderCount).toBe(initialRenders + 1)
  })

  it('re-renders when the active segment changes', () => {
    const { result } = renderHook(() => useActiveSegment(segments))
    tick(1.0) // → seg_000
    expect(result.current?.id).toBe('seg_000')
    tick(4.0) // → seg_001
    expect(result.current?.id).toBe('seg_001')
  })
})
```

- [ ] **Step 3.2: Run tests to confirm they fail**

```bash
cd frontend && npx vitest run tests/useActiveSegment.test.ts
```

Expected: FAIL — `useActiveSegment` still takes `currentTime` as second arg and doesn't subscribe.

- [ ] **Step 3.3: Implement the new `useActiveSegment`**

Replace `frontend/src/hooks/useActiveSegment.ts` entirely:

```ts
import type { Segment } from '../types'
import { useEffect, useRef, useState } from 'react'
import { usePlayer } from '@/contexts/PlayerContext'

/**
 * Find the active segment for a given time using binary search.
 * Segments must be sorted ascending by `start`.
 *
 * Returns:
 * - The segment where start <= time < end (currently playing)
 * - The last segment where end <= time (most recently passed, if in a gap)
 * - null if time is before the first segment or segments is empty
 */
function findActiveSegment(segments: Segment[], time: number): Segment | null {
  if (segments.length === 0) return null

  // Find rightmost segment with start <= time
  let lo = 0
  let hi = segments.length - 1
  let candidate = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (segments[mid].start <= time) {
      candidate = mid
      lo = mid + 1
    }
    else {
      hi = mid - 1
    }
  }

  if (candidate === -1) return null // time before all segments
  // Both the "active" and "last-before" cases correctly return segments[candidate]:
  // - If end > time:  candidate is the currently-active segment
  // - If end <= time: candidate is the most-recently-passed segment (the original "lastBefore")
  // The binary search gives the right answer in both cases without a separate backwards scan.
  return segments[candidate]
}

export function useActiveSegment(segments: Segment[]): Segment | null {
  const { subscribeTime } = usePlayer()
  const [activeSegment, setActiveSegment] = useState<Segment | null>(null)
  const segmentsRef = useRef(segments)

  useEffect(() => {
    segmentsRef.current = segments
  }, [segments])

  useEffect(() => {
    return subscribeTime((time) => {
      const found = findActiveSegment(segmentsRef.current, time)
      setActiveSegment(prev => (prev?.id === found?.id ? prev : found))
    })
  }, [subscribeTime])

  return activeSegment
}
```

- [ ] **Step 3.4: Run `useActiveSegment` tests**

```bash
cd frontend && npx vitest run tests/useActiveSegment.test.ts
```

Expected: all pass.

- [ ] **Step 3.5: Commit**

```bash
cd frontend && git add src/hooks/useActiveSegment.ts tests/useActiveSegment.test.ts && git commit -m "refactor: useActiveSegment — subscription-gated setState with binary search"
```

---

## Chunk 2: Visual Consumers — SegmentText, TranscriptPanel, VideoPanel

> **Prerequisites:** Chunk 1 must be fully applied and committed before starting Chunk 2. `subscribeTime`, `getTime`, and the new `useActiveSegment` signature all come from Chunk 1. TypeScript will error on any Chunk 2 file until its Chunk 1 dependency is in place.

### Task 4: Refactor `SegmentText`

**Files:**
- Modify: `frontend/src/components/lesson/SegmentText.tsx`

No test changes needed — `SegmentText.save.test.tsx` already renders without `currentTime` and will continue to pass. Karaoke DOM behaviour is verified manually.

- [ ] **Step 4.1: Run the existing save tests as a baseline**

```bash
cd frontend && npx vitest run tests/SegmentText.save.test.tsx
```

Expected: all pass (baseline).

- [ ] **Step 4.2: Implement the SegmentText refactor**

Replace `frontend/src/components/lesson/SegmentText.tsx` entirely:

```tsx
import type { Segment, Word, WordTiming } from '@/types'
import { Bookmark, Copy, Loader2, Volume2 } from 'lucide-react'
import { memo, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { usePlayer } from '@/contexts/PlayerContext'
import { buildPositionMap, buildWordSpans } from '@/lib/segment-text'
import { cn } from '@/lib/utils'

interface SegmentTextProps {
  text: string
  words: Word[]
  wordTimings?: WordTiming[]
  playTTS: (text: string) => Promise<void>
  loadingText: string | null
  onSaveWord?: (word: Word, segment: Segment) => void
  isSaved?: (word: string) => boolean
  segment?: Segment
}

export const SegmentText = memo(({
  text,
  words,
  wordTimings,
  playTTS,
  loadingText,
  onSaveWord,
  isSaved,
  segment,
}: SegmentTextProps) => {
  const { subscribeTime, getTime } = usePlayer()

  // Build spans once per text/words change
  const spans = buildWordSpans(text, words)

  // Precompute absolute char offsets for each span
  const spanStarts: number[] = []
  let offset = 0
  for (const span of spans) {
    spanStarts.push(offset)
    offset += span.text.length
  }

  // Compute posMap synchronously during render so it's available before any useEffect fires.
  // Store in a ref so the subscription callback always reads the latest without being in deps.
  const posMap = wordTimings?.length ? buildPositionMap(text, wordTimings) : null
  const posMapRef = useRef(posMap)
  posMapRef.current = posMap

  // One ref slot per character across all spans
  const totalChars = text.length
  const charSpanRefs = useRef<(HTMLSpanElement | null)[]>([])
  // Ensure array is sized correctly when text changes
  if (charSpanRefs.current.length !== totalChars) {
    charSpanRefs.current = Array.from({ length: totalChars }, () => null)
  }

  // Karaoke: toggle CSS classes on char spans directly — no React re-renders.
  // Run the coloring immediately on mount (with getTime()) to avoid a flash of uncolored chars,
  // then subscribe for ongoing updates.
  useEffect(() => {
    function applyKaraoke(time: number) {
      const pm = posMapRef.current
      if (!pm) return
      charSpanRefs.current.forEach((el, charIdx) => {
        if (!el) return
        const wt = pm.get(charIdx)
        if (wt === undefined) return
        const spoken = wt.end <= time
        el.classList.toggle('text-yellow-400', spoken)
        el.classList.toggle('text-white', !spoken)
      })
    }
    // Apply current time immediately so chars aren't uncolored on first paint
    applyKaraoke(getTime())
    return subscribeTime(applyKaraoke)
  }, [subscribeTime, getTime])

  return (
    <TooltipProvider>
      <span>
        {spans.map((span, spanIdx) => {
          const spanStart = spanStarts[spanIdx]

          const charSpans = span.text.split('').map((char, j) => {
            const charIdx = spanStart + j
            return (
              <span
                key={j}
                ref={el => { charSpanRefs.current[charIdx] = el }}
              >
                {char}
              </span>
            )
          })

          if (!span.word) {
            return <span key={spanIdx}>{charSpans}</span>
          }

          return (
            <Tooltip key={spanIdx}>
              <TooltipTrigger className="cursor-help rounded-sm px-0.5 text-inherit decoration-white/30 decoration-dotted underline-offset-4 transition-colors hover:bg-white/10 hover:underline">
                {charSpans}
              </TooltipTrigger>
              <TooltipContent
                side="top"
                align="center"
                className="relative max-w-none min-w-72 rounded-2xl border border-white/10 bg-[oklch(0.13_0_0)]/95 p-0 shadow-2xl backdrop-blur-xl"
              >
                <div className="flex flex-col gap-1 px-4 py-3 pr-10">
                  <p className="text-base font-bold text-white">
                    {span.word.word}
                    <span className="ml-2 text-sm font-normal text-white/45">{span.word.pinyin}</span>
                  </p>
                  <p className="text-sm text-white/70">{span.word.meaning}</p>
                  {span.word.usage && (
                    <p className="text-sm text-white/45">{span.word.usage}</p>
                  )}
                </div>

                <div className="absolute top-1 right-1 flex gap-0.5">
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="size-7 text-white/30 hover:bg-white/6 hover:text-white"
                    aria-label={loadingText === span.word.word ? 'Loading pronunciation' : `Play pronunciation of ${span.word.word}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      playTTS(span.word!.word)
                    }}
                  >
                    {loadingText === span.word.word
                      ? <Loader2 className="size-4 animate-spin" />
                      : <Volume2 className="size-4" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="size-7 text-white/30 hover:bg-white/6 hover:text-white"
                    aria-label={`Copy ${span.word.word}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      navigator.clipboard.writeText(span.word!.word)
                      toast.success(`Copied "${span.word!.word}" to clipboard`)
                    }}
                  >
                    <Copy className="size-4" />
                  </Button>
                  {onSaveWord && segment && (
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className={cn(
                        'size-7 hover:bg-white/6',
                        isSaved?.(span.word.word)
                          ? 'text-yellow-400 disabled:opacity-100'
                          : 'text-white/30 hover:text-white',
                      )}
                      title={isSaved?.(span.word.word) ? 'Already in Workbook' : 'Save to Workbook'}
                      aria-label={isSaved?.(span.word.word) ? 'Already in Workbook' : 'Save to Workbook'}
                      disabled={isSaved?.(span.word.word)}
                      onClick={(e) => {
                        e.stopPropagation()
                        onSaveWord(span.word!, segment)
                      }}
                    >
                      <Bookmark className={cn('size-4', isSaved?.(span.word.word) && 'fill-current')} />
                    </Button>
                  )}
                </div>
              </TooltipContent>
            </Tooltip>
          )
        })}
      </span>
    </TooltipProvider>
  )
})
```

Note: the `copiedWord` state that previously tracked the copy button icon has been removed — the copy button now fires `toast.success` and returns to its default state (consistent with the TTS button pattern). This simplifies the component and avoids another piece of state.

- [ ] **Step 4.3: Run the save tests**

```bash
cd frontend && npx vitest run tests/SegmentText.save.test.tsx
```

Expected: all 5 tests pass.

- [ ] **Step 4.4: Commit**

```bash
cd frontend && git add src/components/lesson/SegmentText.tsx && git commit -m "refactor: SegmentText — DOM ref karaoke, remove currentTime prop"
```

---

### Task 5: Refactor `TranscriptPanel`

**Files:**
- Modify: `frontend/src/components/lesson/TranscriptPanel.tsx`

- [ ] **Step 5.1: Implement TranscriptPanel changes**

Replace `frontend/src/components/lesson/TranscriptPanel.tsx` entirely:

```tsx
import type { LessonMeta, Segment, Word } from '@/types'
import { Check, Copy, Loader2, Search, Volume2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useAuth } from '@/contexts/AuthContext'
import { useTTS } from '@/hooks/useTTS'
import { useVocabulary } from '@/hooks/useVocabulary'
import { cn } from '@/lib/utils'
import { SegmentText } from './SegmentText'

interface TranscriptPanelProps {
  segments: Segment[]
  activeSegment: Segment | null
  lesson: LessonMeta
  onSegmentClick: (segment: Segment) => void
  onProgressUpdate: (segmentId: string) => void
  onShadowingClick?: () => void
}

export function TranscriptPanel({
  segments,
  activeSegment,
  lesson,
  onSegmentClick,
  onProgressUpdate,
  onShadowingClick,
}: TranscriptPanelProps) {
  const { db, keys } = useAuth()
  const { playTTS, loadingText } = useTTS(db, keys)
  const { save, isSaved } = useVocabulary()
  const [search, setSearch] = useState('')
  const [activeLang, setActiveLang] = useState(
    lesson.translationLanguages[0] ?? 'en',
  )
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const activeRef = useRef<HTMLDivElement>(null)
  const prevActiveIdRef = useRef<string | null>(null)

  // Auto-scroll to active segment
  useEffect(() => {
    if (activeSegment && activeSegment.id !== prevActiveIdRef.current) {
      prevActiveIdRef.current = activeSegment.id
      activeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [activeSegment])

  // Notify progress update when active segment changes
  useEffect(() => {
    if (activeSegment) {
      onProgressUpdate(activeSegment.id)
    }
  }, [activeSegment, onProgressUpdate])

  const filteredSegments = useMemo(() => {
    if (!search.trim())
      return segments
    const q = search.trim().toLowerCase()
    return segments.filter((seg) => {
      if (seg.chinese.toLowerCase().includes(q))
        return true
      for (const val of Object.values(seg.translations)) {
        if (val.toLowerCase().includes(q))
          return true
      }
      return false
    })
  }, [segments, search])

  // Stable callbacks so memo(SegmentText) is not invalidated on every render
  const handleSaveWord = useCallback(
    async (word: Word, seg: Segment) => {
      await save(word, seg, lesson, activeLang)
      toast.success('Saved to Workbook')
    },
    [save, lesson, activeLang],
  )

  const handleIsSaved = useCallback(
    (wordText: string) => isSaved(wordText, lesson.id),
    [isSaved, lesson.id],
  )

  // Event delegation for keyboard activation — one handler instead of N closures.
  // Guard: only fire if the focused element IS the segment div itself, not a child widget
  // (buttons, inputs). Without this guard, pressing Enter on a Copy/TTS button would also
  // trigger onSegmentClick in addition to the button's own click handler.
  const handleListKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key !== 'Enter' && e.key !== ' ')
        return
      const segmentEl = (e.target as HTMLElement).closest('[data-segment-id]')
      // Only act when the segment container itself is the focused element
      if (!segmentEl || segmentEl !== e.target)
        return
      const segId = (segmentEl as HTMLElement).dataset.segmentId
      if (!segId)
        return
      const seg = filteredSegments.find(s => s.id === segId)
      if (seg)
        onSegmentClick(seg)
    },
    [filteredSegments, onSegmentClick],
  )

  const hasMultipleLangs = lesson.translationLanguages.length > 1

  function handleCopy(e: React.MouseEvent, segment: Segment) {
    e.stopPropagation()
    navigator.clipboard.writeText(segment.chinese)
    setCopiedId(segment.id)
    setTimeout(setCopiedId, 1500, null)
  }

  return (
    <div className="flex h-full flex-col bg-background/20 backdrop-blur-md">
      {/* Search bar */}
      <div className="space-y-2 border-b border-border p-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search segments..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
          {onShadowingClick && (
            <Button
              size="sm"
              onClick={onShadowingClick}
              disabled={segments.length === 0}
              title={segments.length > 0 ? 'Start shadowing mode' : 'No segments yet'}
            >
              🎯 Shadow
            </Button>
          )}
        </div>

        {/* Language toggle */}
        {hasMultipleLangs && (
          <div className="flex gap-1">
            {lesson.translationLanguages.map(lang => (
              <Button
                key={lang}
                variant={activeLang === lang ? 'secondary' : 'ghost'}
                size="xs"
                onClick={() => setActiveLang(lang)}
              >
                {lang.toUpperCase()}
              </Button>
            ))}
          </div>
        )}
      </div>

      {/* Segment list — single onKeyDown via event delegation */}
      <ScrollArea className="h-0 flex-1">
        <div className="divide-y divide-border/50" onKeyDown={handleListKeyDown}>
          {filteredSegments.map(segment => (
            <div
              key={segment.id}
              ref={activeSegment?.id === segment.id ? activeRef : undefined}
              role="button"
              tabIndex={0}
              data-segment-id={segment.id}
              onClick={() => onSegmentClick(segment)}
              className={cn(
                'cursor-pointer px-3 py-2.5 transition-colors hover:bg-accent/60',
                activeSegment?.id === segment.id
                && 'border-l-2 border-l-primary bg-primary/10',
              )}
            >
              <div className="flex items-start gap-2">
                {/* Text content */}
                <div className="min-w-0 flex-1">
                  <p className="mb-1 text-muted-foreground">{segment.pinyin}</p>
                  <p className="text-lg text-foreground">
                    {/* key={segment.id} ensures fresh charSpanRefs when segment changes */}
                    <SegmentText
                      key={segment.id}
                      text={segment.chinese}
                      words={segment.words}
                      wordTimings={segment.wordTimings}
                      playTTS={playTTS}
                      loadingText={loadingText}
                      segment={segment}
                      onSaveWord={handleSaveWord}
                      isSaved={handleIsSaved}
                    />
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    {segment.translations[activeLang] ?? Object.values(segment.translations)[0]}
                  </p>
                </div>

                {/* Action buttons */}
                <div className="flex shrink-0 flex-col items-center gap-1 pt-0.5">
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="size-5 text-muted-foreground hover:text-foreground"
                    aria-label={loadingText === segment.chinese ? 'Loading pronunciation' : 'Play sentence pronunciation'}
                    onClick={(e) => {
                      e.stopPropagation()
                      playTTS(segment.chinese)
                    }}
                  >
                    {loadingText === segment.chinese
                      ? <Loader2 className="size-4 animate-spin" />
                      : <Volume2 className="size-4" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="size-5 text-muted-foreground hover:text-foreground"
                    aria-label="Copy transcription"
                    onClick={e => handleCopy(e, segment)}
                  >
                    {copiedId === segment.id
                      ? <Check className="size-4 text-green-500" />
                      : <Copy className="size-4" />}
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}
```

- [ ] **Step 5.2: Run tests**

```bash
cd frontend && npx vitest run
```

Expected: all existing tests pass. TypeScript errors in `VideoPanel` and `LessonView` (still reference old `useActiveSegment` signature or `currentTime`) are expected and will be fixed next.

- [ ] **Step 5.3: Commit**

```bash
cd frontend && git add src/components/lesson/TranscriptPanel.tsx && git commit -m "refactor: TranscriptPanel — stable memo props, event delegation, no currentTime"
```

---

### Task 6: Refactor `VideoPanel`

**Files:**
- Modify: `frontend/src/components/lesson/VideoPanel.tsx`

- [ ] **Step 6.1: Apply the VideoPanel changes**

In `frontend/src/components/lesson/VideoPanel.tsx`:

**a)** Update the `usePlayer` destructure — remove `currentTime`, add `subscribeTime`:

```tsx
// Before
const { player, currentTime, playbackRate, volume, setPlayer, setPlaybackRate, setVolume } = usePlayer()

// After
const { player, subscribeTime, playbackRate, volume, setPlayer, setPlaybackRate, setVolume } = usePlayer()
```

**b)** Add refs for scrubber, timestamp, and duration below the existing refs:

```tsx
const scrubberRef = useRef<HTMLInputElement>(null)
const timestampRef = useRef<HTMLSpanElement>(null)
// durationRef avoids putting `duration` in the subscribeTime effect deps, preventing
// an unnecessary unsubscribe/resubscribe whenever duration state updates.
const durationRef = useRef(0)
```

**c)** Keep the existing `duration` state in the `useState` call. Add a sync line after the existing `setDuration` calls to keep `durationRef` current:

```tsx
// After the existing setDuration call inside the interval:
setDuration(d)
durationRef.current = d
```

Or more cleanly, update the duration-tracking `useEffect` to also write to `durationRef`:

```tsx
useEffect(() => {
  if (!player) return
  const interval = setInterval(() => {
    const d = player.getDuration()
    if (d > 0) {
      durationRef.current = d
      setDuration(d)
    }
  }, 500)
  return () => clearInterval(interval)
}, [player])
```

**d)** Add `subscribeTime` and `getTime` to the `usePlayer()` destructure, then add a subscription effect after the existing `useEffect` blocks:

```tsx
// Drive scrubber and timestamp display directly — no React state for currentTime.
// `max` on the scrubber is a JSX prop — React updates it normally as `duration` state changes.
// The timestamp span has no JSX children so React never overwrites our imperatively-set textContent.
useEffect(() => {
  function applyTime(time: number) {
    if (scrubberRef.current)
      scrubberRef.current.value = String(time)
    if (timestampRef.current)
      timestampRef.current.textContent = `${formatTime(time)} / ${formatTime(durationRef.current)}`
  }
  applyTime(getTime()) // populate immediately on mount — no blank-flash
  return subscribeTime(applyTime)
}, [subscribeTime, getTime])
```

**d)** Change the scrubber `<input>` — replace `value={currentTime}` with `defaultValue={0}` and add `ref`:

```tsx
// Before
<input
  type="range"
  min={0}
  max={duration || 0}
  step={0.1}
  value={currentTime}
  onChange={handleScrub}
  className="h-1 w-full cursor-pointer accent-primary"
/>

// After
<input
  ref={scrubberRef}
  type="range"
  min={0}
  max={duration || 0}
  step={0.1}
  defaultValue={0}
  onChange={handleScrub}
  className="h-1 w-full cursor-pointer accent-primary"
/>
```

**e)** Change the timestamp `<span>` — render with **no children**, fully driven by the subscription:

```tsx
// Before
<span className="font-mono text-sm text-muted-foreground">
  {formatTime(currentTime)}
  {' / '}
  {formatTime(duration)}
</span>

// After — empty children so React reconciliation never overwrites the subscription-managed textContent
<span ref={timestampRef} className="font-mono text-sm text-muted-foreground" />
```

The subscription effect will populate `textContent` immediately via `getTime()` on mount (see step **d** above), so there is no blank-flash on first render.

- [ ] **Step 6.2: Run tests**

```bash
cd frontend && npx vitest run tests/VideoPanel.volume.test.tsx tests/VideoPanel.helpers.test.ts
```

Expected: all pass.

- [ ] **Step 6.3: Commit**

```bash
cd frontend && git add src/components/lesson/VideoPanel.tsx && git commit -m "refactor: VideoPanel — scrubber and timestamp via DOM refs, no currentTime"
```

---

## Chunk 3: LessonView + Shadowing Phases + Final Verification

> **Prerequisites:** Chunks 1 and 2 must be fully applied before starting Chunk 3.

### Task 7: Refactor `LessonView`

**Files:**
- Modify: `frontend/src/components/lesson/LessonView.tsx`

- [ ] **Step 7.1: Apply LessonView changes**

In `frontend/src/components/lesson/LessonView.tsx`:

**a)** Remove `currentTime` from the `usePlayer()` destructure:

```tsx
// Before
const { player, currentTime } = usePlayer()

// After
const { player } = usePlayer()
```

**b)** Update the `useActiveSegment` call — remove `currentTime` argument:

```tsx
// Before
const activeSegment = useActiveSegment(segments, currentTime)

// After
const activeSegment = useActiveSegment(segments)
```

**c)** Fix the `videoBlob` effect dependency — change `meta` to `meta?.id`:

```tsx
// Before
useEffect(() => {
  if (!db || !id || !meta)
    return
  getVideo(db, id).then((blob) => {
    if (blob)
      setVideoBlob(blob)
  })
}, [db, id, meta])

// After
useEffect(() => {
  if (!db || !id || !meta)
    return
  getVideo(db, id).then((blob) => {
    if (blob)
      setVideoBlob(blob)
  })
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [db, id, meta?.id])
```

- [ ] **Step 7.2: Run full type-check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors. If errors remain, they are in the shadowing phase components which are addressed in Task 8.

- [ ] **Step 7.3: Run tests**

```bash
cd frontend && npx vitest run
```

Expected: all tests pass. The only remaining issue is the shadowing phase mock in `ShadowingPanel.test.tsx` still referencing `currentTime`.

- [ ] **Step 7.4: Commit**

```bash
cd frontend && git add src/components/lesson/LessonView.tsx && git commit -m "refactor: LessonView — remove currentTime, fix videoBlob dep to meta?.id"
```

---

### Task 8: Refactor Shadowing Phases

**Files:**
- Modify: `frontend/src/components/shadowing/ShadowingListenPhase.tsx`
- Modify: `frontend/src/components/shadowing/ShadowingSpeakingPhase.tsx`
- Modify: `frontend/src/components/shadowing/ShadowingDictationPhase.tsx`
- Modify: `frontend/tests/ShadowingPanel.test.tsx`

**Stale closure note:** `useTimeEffect` keeps the callback always-fresh via `cbRef` (see Task 2). When the shadowing phase component re-renders (e.g., because `player` changes), the new callback is passed to `useTimeEffect`, the first `useEffect([cb])` syncs `cbRef.current` to the new closure, and the subscription continues calling the latest version. Props like `player` and `onEnd`/`onReplayEnd` are never stale inside the callback.

- [ ] **Step 8.1: Refactor `ShadowingListenPhase`**

In `frontend/src/components/shadowing/ShadowingListenPhase.tsx`:

**a)** Add the `useTimeEffect` import:
```tsx
import { useTimeEffect } from '@/hooks/useTimeEffect'
```

**b)** Remove `currentTime` from the `usePlayer()` destructure:
```tsx
// Before
const { player, currentTime } = usePlayer()

// After
const { player } = usePlayer()
```

**c)** Replace the `useEffect` that depends on `currentTime` with `useTimeEffect`:
```tsx
// Before
useEffect(() => {
  if (currentTime >= segment.start && currentTime < segment.end)
    seekConfirmedRef.current = true
  if (!hasAutoTransitionedRef.current && currentTime >= segment.end) {
    hasAutoTransitionedRef.current = true
    player?.pause()
    onEnd()
  }
}, [currentTime, segment.start, segment.end, player])

// After
useTimeEffect((t) => {
  if (t >= segment.start && t < segment.end)
    seekConfirmedRef.current = true
  if (!hasAutoTransitionedRef.current && t >= segment.end) {
    hasAutoTransitionedRef.current = true
    player?.pause()
    onEnd()
  }
}, segment.id)
```

- [ ] **Step 8.2: Refactor `ShadowingSpeakingPhase`**

In `frontend/src/components/shadowing/ShadowingSpeakingPhase.tsx`:

**a)** Add import:
```tsx
import { useTimeEffect } from '@/hooks/useTimeEffect'
```

**b)** Remove `currentTime` from `usePlayer()` destructure:
```tsx
const { player } = usePlayer()
```

**c)** Replace the `useEffect` that depends on `currentTime`:
```tsx
// Before
useEffect(() => {
  if (isReplayingRef.current && currentTime >= segment.end) {
    isReplayingRef.current = false
    player?.pause()
    onReplayEnd()
  }
}, [currentTime, segment.end, player])

// After
useTimeEffect((t) => {
  if (isReplayingRef.current && t >= segment.end) {
    isReplayingRef.current = false
    player?.pause()
    onReplayEnd()
  }
}, segment.id)
```

- [ ] **Step 8.3: Refactor `ShadowingDictationPhase`**

In `frontend/src/components/shadowing/ShadowingDictationPhase.tsx`:

**a)** Add import:
```tsx
import { useTimeEffect } from '@/hooks/useTimeEffect'
```

**b)** Remove `currentTime` from `usePlayer()` destructure:
```tsx
const { player } = usePlayer()
```

**c)** Replace the `useEffect` that depends on `currentTime`:
```tsx
// Before
useEffect(() => {
  if (isReplayingRef.current && currentTime >= segment.end) {
    isReplayingRef.current = false
    player?.pause()
    onReplayEnd()
  }
}, [currentTime, segment.end, player])

// After
useTimeEffect((t) => {
  if (isReplayingRef.current && t >= segment.end) {
    isReplayingRef.current = false
    player?.pause()
    onReplayEnd()
  }
}, segment.id)
```

- [ ] **Step 8.4: Update `ShadowingPanel.test.tsx` mock**

In `frontend/tests/ShadowingPanel.test.tsx`, find the `vi.mock('@/contexts/PlayerContext', ...)` block and update it:

```tsx
// Before
vi.mock('@/contexts/PlayerContext', () => ({
  usePlayer: () => ({
    player: mockPlayer,
    currentTime: 0,
    playbackRate: 1,
    volume: 1,
    setPlayer: vi.fn(),
    setPlaybackRate: vi.fn(),
    setVolume: vi.fn(),
  }),
}))

// After
vi.mock('@/contexts/PlayerContext', () => ({
  usePlayer: () => ({
    player: mockPlayer,
    subscribeTime: vi.fn(() => () => {}),
    getTime: vi.fn(() => 0),
    playbackRate: 1,
    volume: 1,
    setPlayer: vi.fn(),
    setPlaybackRate: vi.fn(),
    setVolume: vi.fn(),
  }),
}))
```

- [ ] **Step 8.5: Run all tests**

```bash
cd frontend && npx vitest run
```

Expected: all tests pass.

- [ ] **Step 8.6: Run full type-check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 8.7: Commit**

```bash
cd frontend && git add \
  src/components/shadowing/ShadowingListenPhase.tsx \
  src/components/shadowing/ShadowingSpeakingPhase.tsx \
  src/components/shadowing/ShadowingDictationPhase.tsx \
  tests/ShadowingPanel.test.tsx \
  && git commit -m "refactor: shadowing phases — useTimeEffect replaces currentTime useEffect"
```

---

### Task 9: Final Verification

- [ ] **Step 9.1: Run the full test suite one more time**

```bash
cd frontend && npx vitest run
```

Expected: all tests green.

- [ ] **Step 9.2: Type-check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 9.3: Manual smoke test**

Open the app in the browser and verify:
- Scrubber moves smoothly during playback (60fps, no jank)
- Timestamp updates continuously during playback
- Karaoke highlighting advances character by character during playback
- Active segment auto-scrolls in the transcript
- Clicking a segment in the transcript seeks the player
- Keyboard Enter/Space on a segment in the transcript triggers seek
- Rename does not reload the video
- Shadowing mode listen phase auto-advances at segment end
- Saving a word to the Workbook works

- [ ] **Step 9.4: Final commit if any cleanup was needed**

```bash
cd frontend && git add -p && git commit -m "chore: post-refactor cleanup"
```
