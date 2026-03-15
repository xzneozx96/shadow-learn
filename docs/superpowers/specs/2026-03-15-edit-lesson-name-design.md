# Edit Lesson Name — Design Spec

**Date:** 2026-03-15

## Overview

Add the ability to rename a lesson from the Library. A dropdown action menu on each `LessonCard` replaces the standalone delete button, with "Rename" and "Delete" as initial actions. This provides an extensible home for future card-level actions.

## Components

### `frontend/src/components/ui/menu.tsx` (new)

A thin wrapper around `@base-ui/react/menu`, following the same pattern as `dialog.tsx` (`import { Menu as MenuPrimitive } from '@base-ui/react/menu'`). Exports wrappers: `MenuRoot`, `MenuTrigger`, `MenuPortal`, `MenuBackdrop`, `MenuPositioner`, `MenuPopup`, `MenuItem`.

### `frontend/src/components/library/LessonCard.tsx` (modified)

- Replace the hover-only `Trash2` icon button with a `MoreHorizontal` icon button that opens the dropdown menu.
- Menu items: **Rename** and **Delete**.
- Local state: `isEditing: boolean`, `editValue: string`.
- While `isEditing`, the `CardTitle` text is replaced by a controlled `<input>` pre-filled with the current title, auto-focused with all text selected (`useEffect(() => ref.current?.select(), [isEditing])`). The card's `<Link>` overlay receives `pointer-events-none` and `tabIndex={-1}` so the input receives both mouse and keyboard interaction.
- Confirm: Enter or `onBlur` — trims value, calls `onRename` if non-empty, exits editing. `onBlur` fires in all focus-loss scenarios (including clicking outside or re-opening the menu); this is treated as confirm.
- Cancel: Escape — sets an `isCancelled` ref to `true` before exiting editing, so the subsequent `onBlur` event is a no-op. Restores the original title.

### `frontend/src/components/library/Library.tsx` (modified)

- Adds `handleRename(lesson: LessonMeta, newTitle: string)` as a `useCallback` with only `[db]` as a dep. `LessonCard` passes the full `lesson` prop directly, so `handleRename` never needs to read from `lessons` state — eliminating the `lessons` dependency and preventing unnecessary callback recreations on every list change (`rerender-functional-setstate`):
  ```ts
  const handleRename = useCallback(async (lesson: LessonMeta, newTitle: string) => {
    if (!db) return
    await saveLessonMeta(db, { ...lesson, title: newTitle })
    setLessons(prev => prev.map(l => l.id === lesson.id ? { ...l, title: newTitle } : l))
  }, [db])
  ```
- Passes `onRename={handleRename}` to `LessonCard`.

## Data Flow

```
LessonCard (user confirms rename)
  → onRename(lesson, newTitle)       // full LessonMeta object passed
    → Library.handleRename
      → saveLessonMeta(db, { ...lesson, title: newTitle })  // IndexedDB
      → setLessons(prev => prev.map(...))                   // local state
```

No backend changes required — titles live only in IndexedDB.

## Interface Changes

```ts
// LessonCard props
interface LessonCardProps {
  lesson: LessonMeta
  onDelete: (id: string) => void
  onRename: (lesson: LessonMeta, newTitle: string) => void  // new; full object avoids lessons-state dep in Library
}

// LessonCard local state
const [isEditing, setIsEditing] = useState(false)
const [editValue, setEditValue] = useState('')
const isCancelledRef = useRef(false)
const inputRef = useRef<HTMLInputElement>(null)

// Auto-focus + select all when editing starts
useEffect(() => {
  if (isEditing) inputRef.current?.select()
}, [isEditing])
```

## Error Handling

- Empty or whitespace-only input → cancel without saving (no error shown).
- `saveLessonMeta` failure → no specific handling needed; IndexedDB errors are rare and non-critical for this flow.

## Testing

No new test files required. The rename flow is UI state + a single DB call already covered by existing `saveLessonMeta` plumbing.
