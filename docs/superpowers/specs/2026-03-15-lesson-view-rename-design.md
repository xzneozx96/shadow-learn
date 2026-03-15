# Lesson View Rename — Design Spec

**Date:** 2026-03-15

## Overview

Extend the existing lesson rename capability into the LessonView. A `Pencil` icon button appears on hover next to the lesson title in the VideoPanel header. Clicking it activates an inline input with the same keyboard semantics as the LessonCard rename (Enter confirms, Escape cancels, blur confirms).

## Components

### `frontend/src/hooks/useLesson.ts` (modified)

Expose `updateMeta: (updates: Partial<LessonMeta>) => void` in the return value. This is a pure local-state merge — no DB write. Callers are responsible for persistence.

```ts
interface UseLessonResult {
  meta: LessonMeta | null
  segments: Segment[]
  loading: boolean
  error: string | null
  updateMeta: (updates: Partial<LessonMeta>) => void  // new
}

// Implementation inside useLesson — MUST be useCallback with empty deps so its
// reference is stable and safe to list as a dependency in LessonView callbacks:
const updateMeta = useCallback((updates: Partial<LessonMeta>) => {
  setMeta(prev => prev ? { ...prev, ...updates } : prev)
}, [])
```

### `frontend/src/components/lesson/VideoPanel.tsx` (modified)

- Add `onRename?: (newTitle: string) => void` to `VideoPanelProps`.
- In the header, wrap the title area in a `group/title` div. On hover, show a `Pencil` icon button (`size-4`, `ghost`, `icon-xs`) to the right of the title span.
- Clicking the pencil calls `startEditing()`: resets `isCancelledRef.current = false`, stores `lesson.title` into `titleSnapshotRef.current`, seeds `editValue` with that snapshot, sets `isEditing = true`.
- Local state: `isEditing: boolean`, `editValue: string`, `isCancelledRef: useRef(false)`, `inputRef: useRef<HTMLInputElement>(null)`, `titleSnapshotRef: useRef('')` — same pattern as `LessonCard` plus the snapshot ref.
- Auto-focus + select-all via `useEffect(() => { if (isEditing) inputRef.current?.select() }, [isEditing])`.
- Confirm via `confirmEdit()`: checks `if (isCancelledRef.current) return` first; trims `editValue`; calls `onRename` only if non-empty AND trimmed value differs from `titleSnapshotRef.current` (the seeded snapshot, not the live prop); exits editing. Both the Enter handler and `onBlur` handler call the same `confirmEdit` function — there is no separate `onBlur` handler.
- Cancel: Escape — sets `isCancelledRef.current = true`, then exits editing. The subsequent `onBlur` fires but `confirmEdit` returns early because of the ref guard.
- If `onRename` is not provided, the pencil button is not rendered (optional prop).

### `frontend/src/components/lesson/LessonView.tsx` (modified)

- Destructure `updateMeta` from `useLesson`.
- Add `handleRename`:
  ```ts
  const handleRename = useCallback(async (newTitle: string) => {
    if (!db || !meta) return
    await saveLessonMeta(db, { ...meta, title: newTitle })
    updateMeta({ title: newTitle })
  }, [db, meta, updateMeta])
  ```
- Pass `onRename={handleRename}` to `VideoPanel`.

## Data Flow

```
VideoPanel (user confirms rename)
  → onRename(newTitle)
    → LessonView.handleRename
      → saveLessonMeta(db, { ...meta, title: newTitle })   // IndexedDB
      → updateMeta({ title: newTitle })                    // local state in useLesson
```

No backend changes required.

## Interface Changes

```ts
// useLesson return type
interface UseLessonResult {
  meta: LessonMeta | null
  segments: Segment[]
  loading: boolean
  error: string | null
  updateMeta: (updates: Partial<LessonMeta>) => void
}

// VideoPanel props
interface VideoPanelProps {
  lesson: LessonMeta
  segments: Segment[]
  activeSegment: Segment | null
  videoBlob?: Blob
  onRename?: (newTitle: string) => void  // new, optional
}

// VideoPanel local state (when onRename is provided)
const [isEditing, setIsEditing] = useState(false)
const [editValue, setEditValue] = useState('')
const isCancelledRef = useRef(false)
const titleSnapshotRef = useRef('')        // captures lesson.title at startEditing time
const inputRef = useRef<HTMLInputElement>(null)
```

## Error Handling

- Empty/whitespace input → cancel without saving.
- Unchanged title (trimmed value equals the snapshot seeded at `startEditing` time) → skip `onRename` call, exit editing silently.
- `saveLessonMeta` failure → no special handling (consistent with existing `handleProgressUpdate` pattern).
- Stale `meta` spread in `handleRename`: `{ ...meta, title: newTitle }` uses the `meta` snapshot at callback-creation time. Any concurrent `handleProgressUpdate` writes that change `progressSegmentId` between pencil-click and Enter could be overwritten. This is a known, accepted limitation — the same race exists in `handleProgressUpdate` itself and is considered acceptable given the low frequency of simultaneous title-edit + progress-update.

## Testing

No new test files required — consistent with the existing `handleProgressUpdate` pattern which also performs an async DB write without dedicated unit tests.

