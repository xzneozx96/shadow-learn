# LessonView Performance Fix — Design Spec

**Date:** 2026-03-16
**Scope:** Fix 5 performance issues (2 critical, 1 high, 2 medium) in the LessonView panel tree.

---

## Problem Summary

During video/audio playback, `HTML5Player` fires `onTimeUpdate` via `requestAnimationFrame` at ~60fps. `PlayerContext` handles this by calling `setCurrentTime(time)` — React state — which triggers a re-render cascade across every subscriber at 60fps:

- `LessonView` → `useActiveSegment` (two O(n) linear scans)
- `VideoPanel` (scrubber, timestamp)
- `TranscriptPanel` → `SegmentText` per visible segment (karaoke coloring, `buildWordSpans`, `buildPositionMap`)
- `ShadowingListenPhase`, `ShadowingSpeakingPhase`, `ShadowingDictationPhase`

Additionally, `memo(SegmentText)` is defeated by unstable inline props, `videoBlob` reloads on any `meta` object change, and per-segment `onKeyDown` closures are allocated on every render.

### Risk Table

| Risk | Issue | Location |
|---|---|---|
| 🔴 CRITICAL | `currentTime` in React state → full tree re-renders at 60fps | `PlayerContext.tsx:36` |
| 🔴 CRITICAL | `memo(SegmentText)` broken by inline `onSaveWord`/`isSaved` | `TranscriptPanel.tsx:173-178` |
| 🟠 HIGH | Two O(n) segment scans on every tick | `useActiveSegment.ts:8` |
| 🟡 MEDIUM | `videoBlob` effect re-fires on any `meta` object change | `LessonView.tsx:44` |
| 🟡 MEDIUM | Per-segment `onKeyDown` closures allocated per render | `TranscriptPanel.tsx:147` |

---

## Design

### 1. PlayerContext — remove `currentTime` from React state

**Files:** `frontend/src/contexts/PlayerContext.tsx`

Remove `currentTime: number` from the context value and from React state. Replace with:

```ts
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
```

**Implementation:**

- Store time in `timeRef = useRef(0)` — never call any state setter for time
- Store subscribers in `subscribersRef = useRef<Set<(t: number) => void>>(new Set())` — stable across renders
- `subscribeTime` adds the callback to `subscribersRef.current` and returns a cleanup function that removes it. Wrap in `useCallback` with empty deps so its reference is stable across all renders:

```ts
const subscribeTime = useCallback((cb: (t: number) => void) => {
  subscribersRef.current.add(cb)
  return () => subscribersRef.current.delete(cb)
}, [])
```

- `getTime` returns `timeRef.current` synchronously. Also wrapped in `useCallback` with empty deps:

```ts
const getTime = useCallback(() => timeRef.current, [])
```

- Inside `PlayerProvider`, a `useEffect` wires up the player's `onTimeUpdate` to `timeRef` and the subscriber set:

```ts
useEffect(() => {
  if (!player) return
  return player.onTimeUpdate((time) => {
    timeRef.current = time
    for (const cb of subscribersRef.current) cb(time)
  })
}, [player])
```

This means `subscribeTime` does NOT directly call `player.onTimeUpdate`. Subscribers register into `subscribersRef`; the provider's internal effect fans out time ticks to all of them. When `setPlayer` is called and the `player` changes, the internal effect re-runs, tearing down the old player subscription and establishing a new one — but all external subscribers remain in `subscribersRef` and automatically receive ticks from the new player. Subscribers that register before `setPlayer` is called are stored in `subscribersRef` and will receive ticks once a player is available; they do not need to re-subscribe.

---

### 2. `useActiveSegment` — subscription-gated setState

**Files:** `frontend/src/hooks/useActiveSegment.ts`

Remove the `currentTime` parameter. Subscribe internally.

```ts
export function useActiveSegment(segments: Segment[]): Segment | null {
  const { subscribeTime } = usePlayer()
  const [activeSegment, setActiveSegment] = useState<Segment | null>(null)
  const segmentsRef = useRef(segments)
  useEffect(() => { segmentsRef.current = segments }, [segments])

  useEffect(() => {
    return subscribeTime((time) => {
      const found = findActiveSegment(segmentsRef.current, time)
      setActiveSegment(prev => prev?.id === found?.id ? prev : found)
    })
  }, [subscribeTime])

  return activeSegment
}
```

`subscribeTime` is stable (empty `useCallback` deps) so the subscription effect runs once on mount and cleans up on unmount.

**Segment lookup — binary search:** Extract a `findActiveSegment(segments, time)` helper that replaces the two O(n) linear passes. Segments are time-ordered by `start`. Use binary search to find the last segment where `start <= time`, then verify `end > time`. If that check fails, step backwards to find `lastBefore` (the last segment that has fully passed). O(log n) instead of O(2n).

**LessonView caller change:** Remove `currentTime` from the `useActiveSegment` call site. The hook no longer accepts it as an argument.

---

### 3. Visual consumers — DOM ref writes for scrubber, timestamp, and karaoke

#### VideoPanel

**Files:** `frontend/src/components/lesson/VideoPanel.tsx`

The `<input type="range">` scrubber and the timestamp `<span>` switch from React-controlled to ref-driven:

- Add `scrubberRef = useRef<HTMLInputElement>(null)` and `timestampRef = useRef<HTMLSpanElement>(null)`
- Remove `value={currentTime}` from the scrubber input; use `defaultValue={0}` (uncontrolled)
- In a `useEffect`, call `subscribeTime` and imperatively write:

```ts
useEffect(() => {
  return subscribeTime((time) => {
    if (scrubberRef.current) scrubberRef.current.value = String(time)
    if (timestampRef.current) timestampRef.current.textContent = formatTime(time)
  })
}, [subscribeTime])
```

- The scrubber's `onChange` handler (`handleScrub`) is unchanged — it calls `player.seekTo()`
- Remove `currentTime` from the `usePlayer()` destructure in `VideoPanel`

#### SegmentText

**Files:** `frontend/src/components/lesson/SegmentText.tsx`

The karaoke per-character coloring switches from React-managed class state to imperative class toggling:

- `posMap` is computed from `wordTimings` and stored in a `posMapRef`. Recomputed whenever `wordTimings` changes (via a `useEffect`).
- Build `charSpanRefs`: a stable `useRef<(HTMLSpanElement | null)[]>([])`. Populated via ref callbacks during render — each character `<span>` calls `el => { charSpanRefs.current[i] = el }` where `i` is the absolute character index across all spans.
- Remove `currentTime` from the component's props interface.
- Remove `wordTimings` from the props that participate in re-render diffing — they now only feed `posMapRef` via an effect. `SegmentText` remains `memo`-wrapped and will only re-render when `text`, `words`, `playTTS`, `loadingText`, `onSaveWord`, or `isSaved` changes.
- Subscribe to time in a `useEffect`:

```ts
useEffect(() => {
  return subscribeTime((time) => {
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
  })
}, [subscribeTime])
```

- **Keying requirement:** `SegmentText` must be keyed by `segment.id` in `TranscriptPanel` to ensure a fresh instance is mounted when the segment changes. This prevents stale `charSpanRefs` and `posMapRef` from a previous segment being used.

**TranscriptPanel changes:** Remove the `segmentTime()` helper and the `currentTime` destructure from `usePlayer()`. Stop passing `currentTime` into `SegmentText`. Add `key={segment.id}` to the `<SegmentText>` element.

---

### 4. `useTimeEffect` hook — shadowing phase boundary detection

**Files:** `frontend/src/hooks/useTimeEffect.ts` (new), `ShadowingListenPhase.tsx`, `ShadowingSpeakingPhase.tsx`, `ShadowingDictationPhase.tsx`

New shared hook. To avoid spreading a runtime array into a dep array (which violates Rules of Hooks), the hook accepts a single `key` dependency that triggers re-subscription when it changes:

```ts
export function useTimeEffect(
  cb: (t: number) => void,
  key: unknown,
): void {
  const { subscribeTime } = usePlayer()
  const cbRef = useRef(cb)
  useEffect(() => { cbRef.current = cb })
  useEffect(() => {
    return subscribeTime(t => cbRef.current(t))
  }, [subscribeTime, key])
}
```

The callback is always-fresh via `cbRef`, so `key` only needs to change when the subscription itself must be torn down and re-established (e.g., when the segment changes). Shadowing phases pass `segment.id` as the key.

**Seek-guard compatibility:** The existing `seekConfirmedRef` and `hasAutoTransitionedRef` patterns in the shadowing phases are ref-based and will work correctly under `useTimeEffect`. The callback fires every tick and reads those refs synchronously — there is no batching or scheduling difference. The seek-guard (`seekConfirmedRef.current`) is set when `t >= segment.start && t < segment.end` (the player has seeked into position), and the transition guard (`hasAutoTransitionedRef.current`) prevents double-firing. Both guards operate on raw time values, not React state, so the migration is transparent. No redesign is needed.

Each shadowing phase replaces its `useEffect` that had `currentTime` in the dep array:

```ts
// Before (ShadowingListenPhase)
const { player, currentTime } = usePlayer()
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
const { player } = usePlayer()
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

`currentTime` is removed from the `usePlayer()` destructure entirely in all three components.

---

### 5. Stable props, event delegation, and `videoBlob` dep fix

#### `memo(SegmentText)` — stable `onSaveWord` and `isSaved`

**Files:** `frontend/src/components/lesson/TranscriptPanel.tsx`

Wrap both inline functions in `useCallback`:

```ts
const handleSaveWord = useCallback(async (word: Word, seg: Segment) => {
  await save(word, seg, lesson, activeLang)
  toast.success('Saved to Workbook')
}, [save, lesson, activeLang])

const handleIsSaved = useCallback(
  (wordText: string) => isSaved(wordText, lesson.id),
  [isSaved, lesson.id],
)
```

`save` and `isSaved` are already `useCallback`-stable from `VocabularyContext`. `lesson.id` is a primitive string. `activeLang` is a string state value. `handleSaveWord` only changes when the lesson, language, or vocabulary functions change — not on every render. `memo(SegmentText)` will now function correctly.

#### Per-segment `onKeyDown` closures — event delegation

**Files:** `frontend/src/components/lesson/TranscriptPanel.tsx`

Remove the inline `onKeyDown` from each segment `<div>`. Add a single `onKeyDown` on the `ScrollArea` wrapper via `useCallback`:

```ts
const handleListKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
  if (e.key !== 'Enter' && e.key !== ' ') return
  const target = (e.target as HTMLElement).closest('[data-segment-id]')
  const segId = (target as HTMLElement | null)?.dataset.segmentId
  if (!segId) return
  const seg = filteredSegments.find(s => s.id === segId)
  if (seg) onSegmentClick(seg)
}, [filteredSegments, onSegmentClick])
```

Each segment `<div>` retains `tabIndex={0}` and `data-segment-id` (already present for deep-link scrolling). Since `keydown` events are dispatched on the focused element and bubble up, this delegation works correctly. Child interactive elements (word tooltip triggers, copy/TTS buttons) must not call `stopPropagation` on `keydown` events — only `onClick` stop-propagation calls exist today, so this constraint is already satisfied.

#### `videoBlob` effect dep

**Files:** `frontend/src/components/lesson/LessonView.tsx`

Change the effect dependency from the full `meta` object to `meta?.id`:

```ts
useEffect(() => {
  if (!db || !id || !meta) return
  getVideo(db, id).then(blob => { if (blob) setVideoBlob(blob) })
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [db, id, meta?.id])
```

`meta?.id` is a stable string (`undefined` when meta hasn't loaded, a UUID once loaded). The blob only needs to load once when meta transitions from `null` → loaded. Subsequent `meta` mutations (rename, progress update) share the same `id` and do not re-trigger the IndexedDB read. The `exhaustive-deps` lint suppression is intentional: `meta` itself is not needed as a dep since we only use it as a null-guard inside the effect.

---

## Files Changed

| File | Change |
|---|---|
| `frontend/src/contexts/PlayerContext.tsx` | Remove `currentTime` state; add `subscribeTime`, `getTime`, `timeRef`, `subscribersRef`; internal fan-out effect |
| `frontend/src/hooks/useActiveSegment.ts` | Subscription-gated setState; binary search; remove `currentTime` param |
| `frontend/src/hooks/useTimeEffect.ts` | New hook |
| `frontend/src/components/lesson/VideoPanel.tsx` | Remove `currentTime` from `usePlayer()`; scrubber + timestamp → DOM ref writes |
| `frontend/src/components/lesson/TranscriptPanel.tsx` | Remove `currentTime`; stable `onSaveWord`/`isSaved`; event delegation; key `SegmentText` by `segment.id` |
| `frontend/src/components/lesson/SegmentText.tsx` | Remove `currentTime` prop; `charSpanRefs` + `posMapRef` + subscription for karaoke |
| `frontend/src/components/lesson/LessonView.tsx` | Remove `currentTime` from `usePlayer()`; fix `videoBlob` dep to `meta?.id` |
| `frontend/src/components/shadowing/ShadowingListenPhase.tsx` | Use `useTimeEffect(cb, segment.id)` |
| `frontend/src/components/shadowing/ShadowingSpeakingPhase.tsx` | Use `useTimeEffect(cb, segment.id)` |
| `frontend/src/components/shadowing/ShadowingDictationPhase.tsx` | Use `useTimeEffect(cb, segment.id)` |

---

## Testing

- Existing tests for `useActiveSegment`, `useVocabulary`, and shadowing components must continue to pass
- Manual verification: scrubber moves smoothly at 60fps, karaoke highlights correctly, shadowing phases auto-advance at segment end, segment auto-scroll works, deep-link seek works, rename does not reload video
- No visual regressions in karaoke coloring, active segment highlighting, or transport controls
