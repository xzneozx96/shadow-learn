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

// Implementation inside useLesson:
function updateMeta(updates: Partial<LessonMeta>) {
  setMeta(prev => prev ? { ...prev, ...updates } : prev)
}
```

### `frontend/src/components/lesson/VideoPanel.tsx` (modified)

- Add `onRename?: (newTitle: string) => void` to `VideoPanelProps`.
- In the header, wrap the title area in a `group/title` div. On hover, show a `Pencil` icon button (`size-3`, `ghost`, `icon-xs`) to the right of the title span.
- Clicking the pencil sets `isEditing = true` — title span becomes a controlled `<input>`.
- Local state: `isEditing: boolean`, `editValue: string`, `isCancelledRef`, `inputRef` — same pattern as `LessonCard`.
- Auto-focus + select-all via `useEffect(() => { if (isEditing) inputRef.current?.select() }, [isEditing])`.
- Confirm: Enter or `onBlur` — trims, calls `onRename` if non-empty and changed, exits editing.
- Cancel: Escape — sets `isCancelledRef.current = true`, exits editing.
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
const inputRef = useRef<HTMLInputElement>(null)
```

## Error Handling

- Empty/whitespace input → cancel without saving.
- Unchanged title (trimmed === `lesson.title`) → skip `onRename` call, exit editing silently.
- `saveLessonMeta` failure → no special handling (consistent with existing `handleProgressUpdate` pattern).

## Testing

No new test files required.
