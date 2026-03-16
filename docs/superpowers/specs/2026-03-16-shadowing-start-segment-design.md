# Shadowing Mode: Start Segment & Count Selection — Design Spec

**Date:** 2026-03-16
**Status:** Approved

---

## Overview

Users can currently only shadow all segments from the beginning. This feature lets them choose any starting segment and a count of segments to practice, configured upfront before committing to a session.

---

## User Flow

1. User scrolls the transcript and finds a segment they want to start from.
2. User clicks the **shadow icon** (Swords) on that row — always visible alongside Volume2 and Copy.
3. The **ShadowingModePicker** dialog opens, pre-filled with that segment as the start.
4. User selects:
   - **Mode** — Dictation or Speaking (existing)
   - **Count** — 5 / 10 / 20 / All chips
5. User hits **Start →**. Session runs over the sliced segment window only.

The top-level `🎯 Shadow` button in the transcript header is **removed**. The row icon is the sole entry point.

---

## Component Changes

### `TranscriptPanel`

- **Remove** `onShadowingClick?: () => void` prop.
- **Add** `onShadowClick?: (segment: Segment) => void` prop.
- **Remove** the `🎯 Shadow` button from the search bar row.
- **Add** a third icon button to each segment row's action column (after Copy):
  - Icon: `Swords` from lucide-react
  - Size/style: identical to existing `size-5` ghost icon buttons
  - Always visible (not hover-only)
  - `aria-label="Shadow from this segment"`
  - `onClick`: calls `e.stopPropagation()` then `onShadowClick(segment)` — required to prevent the row's own `onClick={() => onSegmentClick(segment)}` from also firing
  - **Contract:** passes the original `Segment` object reference from the `segments`/`filteredSegments` array — never a spread copy, so that `findIndex` by `s.id` in `LessonView` resolves correctly.

### `ShadowingModePicker`

This component is **substantially rewritten**. The existing `DialogDescription` ("Shadow all segments from the beginning…") and the `onStart(mode)` single-argument signature are both replaced.

Updated props:

```ts
interface ShadowingModePickerProps {
  startSegment: Segment        // always required
  startSegmentNumber: number   // 1-based global index (pickerStartIdx + 1 from LessonView)
  totalRemaining: number       // segments.length - pickerStartIdx (always >= 1)
  speakingAvailable: boolean
  onStart: (mode: 'dictation' | 'speaking', count: number | 'all') => void
  onClose: () => void
}
```

**Internal state added:** `count: number | 'all'`, default:
- `10` if `totalRemaining > 10`
- `'all'` if `totalRemaining <= 10`

(At exactly 10 remaining the `'all'` default is preferred — functionally identical but simpler mental model.)

**Dialog layout:**

```
Shadowing Mode
Starting from segment 12 — "你好吗" (01:03:00)

[ ✍️ Dictation  ]
[ 🎤 Speaking   ]

Segments to practice:
[ 5 ]  [ 10 ]  [ 20 ]  [ All (88) ]

                  [ Cancel ]  [ Start → ]
```

- The description line shows: `Starting from segment {startSegmentNumber} — "{chinese}" ({timestamp})`
  - `{startSegmentNumber}` = the 1-based global index prop — always reflects position in the full segments array, never the filtered/search position
  - `{chinese}` = `startSegment.chinese`
  - `{timestamp}` = `formatTimestamp(startSegment.start)` — `startSegment.start` is in **seconds** (float); format `HH:MM:SS`, truncated (no sub-second component)
- Count chips: `5`, `10`, `20`, `All (N)` where N = `totalRemaining`.
- Chips for 5/10/20 are **disabled** when `totalRemaining < chip value`.
- `All` chip is **never disabled** (`totalRemaining` is always ≥ 1).
- `Start →` calls `onStart(selectedMode, count)`.

### `LessonView`

**State:**

```ts
// Remove entirely:
const [pickerOpen, setPickerOpen] = useState(false)   // ← delete
// And remove: handleShadowingClick, setPickerOpen calls

// Add:
const [pickerSegment, setPickerSegment] = useState<Segment | null>(null)
```

`pickerOpen` and `handleShadowingClick` are removed. The dialog open condition is the sole replacement (see below).

**`totalRemaining` computation** (evaluated when rendering the picker):

```ts
const pickerStartIdx = pickerSegment
  ? segments.findIndex(s => s.id === pickerSegment.id)
  : -1
const totalRemaining = pickerStartIdx >= 0 ? segments.length - pickerStartIdx : 0
```

If `pickerStartIdx === -1` (segment no longer in array — stale reference after a reload), the dialog should not render (`pickerSegment !== null` check already guards `handleShadowingStart`; additionally guard the dialog `open` condition: `pickerSegment !== null && pickerStartIdx >= 0`).

**Handlers:**

```ts
// Replaces handleShadowingClick
const handleShadowClick = useCallback((segment: Segment) => {
  setPickerSegment(segment)
}, [])

// Replaces handleShadowingStart(mode)
const handleShadowingStart = useCallback(
  (mode: 'dictation' | 'speaking', count: number | 'all') => {
    const startIdx = segments.findIndex(s => s.id === pickerSegment!.id)
    if (startIdx === -1) return   // stale segment guard
    const slice =
      count === 'all'
        ? segments.slice(startIdx)
        : segments.slice(startIdx, startIdx + count)
    setShadowingMode({ mode, segments: slice })
    setPickerSegment(null)
  },
  [segments, pickerSegment],
)

const handleShadowingExit = useCallback(() => {
  setShadowingMode(null)
}, [])
```

**`shadowingMode` type update:**

```ts
type ShadowingActiveMode = null | { mode: 'dictation' | 'speaking', segments: Segment[] }
```

**`ShadowingPanel`** call site in `LessonView` JSX changes from `segments={segments}` to `segments={shadowingMode.segments}` (the pre-sliced array). All other props (`mode`, `azureKey`, `azureRegion`, `onExit`) are unchanged.

**`ShadowingModePicker`** receives:
- `startSegment={pickerSegment!}`
- `startSegmentNumber={pickerStartIdx + 1}` — 1-based global index for display
- `totalRemaining={totalRemaining}`
- `speakingAvailable={speakingAvailable}`
- `onStart={handleShadowingStart}`
- `onClose={() => setPickerSegment(null)}`

**Dialog `open` condition:** `pickerSegment !== null && pickerStartIdx >= 0`. Replaces the old `open={pickerOpen}` — `pickerOpen` state is removed entirely.

**Dialog `onOpenChange`:** must call `setPickerSegment(null)` so Escape key and outside-click dismiss the dialog correctly:
```tsx
<Dialog
  open={pickerSegment !== null && pickerStartIdx >= 0}
  onOpenChange={(open) => { if (!open) setPickerSegment(null) }}
>
```

**Mount/unmount:** `ShadowingModePicker` is only rendered when `pickerSegment !== null` (not merely hidden), so it is fully unmounted on close. This guarantees the `count` `useState` default recalculates fresh each time the picker is opened.

### `ShadowingPanel`

No changes to props or logic. Receives a pre-sliced `segments` array; `segmentIndex` is always 0-based relative to the slice. The session summary receives `segments.length` (the slice length) as `total` — this is correct; the summary reflects only the practiced window.

---

## Timestamp Formatting

Utility defined **inline in `ShadowingModePicker`** (sole consumer — no need for a shared util):

```ts
function formatTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}
```

Format: `HH:MM:SS` (e.g. `01:03:00`). Always zero-padded to 2 digits per component.

---

## What Is NOT Changed

- `ShadowingPanel` internals — all phase components untouched.
- Session summary, results, scoring logic — unchanged.
- `segmentLabel` inside `ShadowingPanel` shows `1 / N` relative to the slice (correct by default since the panel receives only the slice).
- `segmentIndex` in `ShadowingPanel` is always 0-based into whatever `segments` array is passed; no absolute index tracking needed.

---

## Edge Cases

| Case | Behaviour |
|---|---|
| Start segment is the last segment | `totalRemaining = 1`; chips 5/10/20 disabled, only `All (1)` available |
| `count` exceeds remaining | `slice` naturally caps at end of array — no special handling needed |
| `pickerSegment` stale (not found in `segments`) | `pickerStartIdx === -1`; dialog does not open; `handleShadowingStart` returns early |
| User has active search filter when clicking shadow icon | `onShadowClick` receives the original `Segment` reference from `filteredSegments` (same objects as `segments`); `findIndex` by `s.id` resolves correctly in the full array |
