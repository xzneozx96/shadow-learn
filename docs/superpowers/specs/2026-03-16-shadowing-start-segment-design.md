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
  - `onClick`: calls `onShadowClick(segment)`, stops propagation

### `ShadowingModePicker`

Updated props:

```ts
interface ShadowingModePickerProps {
  startSegment: Segment        // always required
  totalRemaining: number       // segments.length - startIndex
  speakingAvailable: boolean
  onStart: (mode: 'dictation' | 'speaking', count: number | 'all') => void
  onClose: () => void
}
```

**Internal state added:** `count: number | 'all'`, default `10` (or `'all'` if `totalRemaining <= 10`).

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

- The description line shows: `Starting from segment {N} — "{chinese}" ({timestamp})`
- Timestamp formatted as `HH:MM:SS` from `startSegment.start` (seconds).
- Count chips: `5`, `10`, `20`, `All (N)` where N = `totalRemaining`.
- Chips for 5/10/20 are **disabled** when `totalRemaining < chip value`.
- `All` always enabled.
- `Start →` calls `onStart(selectedMode, count)`.

### `LessonView`

**State:**

```ts
// Before
const [pickerOpen, setPickerOpen] = useState(false)

// After
const [pickerSegment, setPickerSegment] = useState<Segment | null>(null)
```

`pickerOpen` becomes derived: `pickerSegment !== null`.

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

**`ShadowingPanel`** receives `shadowingMode.segments` instead of the full `segments` prop.

**`ShadowingModePicker`** receives:
- `startSegment={pickerSegment!}`
- `totalRemaining={segments.length - segments.findIndex(s => s.id === pickerSegment!.id)}`
- `speakingAvailable={speakingAvailable}`
- `onStart={handleShadowingStart}`
- `onClose={() => setPickerSegment(null)}`

**Dialog `open` condition:** `pickerSegment !== null`.

### `ShadowingPanel`

No changes to props or logic. Receives a pre-sliced `segments` array; session runs exactly as before over that window.

---

## Timestamp Formatting

Utility (inline or extracted):

```ts
function formatTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}
```

---

## What Is NOT Changed

- `ShadowingPanel` internals — all phase components untouched.
- Session summary, results, scoring logic — unchanged.
- `segmentLabel` inside `ShadowingPanel` shows `1 / N` relative to the slice (correct behaviour by default since the panel receives only the slice).

---

## Edge Cases

| Case | Behaviour |
|---|---|
| Start segment is the last segment | `totalRemaining = 1`; chips 5/10/20 disabled, only `All (1)` available |
| `count` exceeds remaining | `slice` naturally caps at end of array — no special handling needed |
| `pickerSegment` not found in `segments` | Guarded by `findIndex` returning `-1`; treat as no-op (don't open) |

