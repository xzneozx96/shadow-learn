# Edit Lesson Name — Design Spec

**Date:** 2026-03-15

## Overview

Add the ability to rename a lesson from the Library. A dropdown action menu on each `LessonCard` replaces the standalone delete button, with "Rename" and "Delete" as initial actions. This provides an extensible home for future card-level actions.

## Components

### `frontend/src/components/ui/menu.tsx` (new)

A thin wrapper around `@base-ui/react/menu`, following the same pattern as the existing `button.tsx` and `dialog.tsx` wrappers. Exports: `Menu`, `MenuTrigger`, `MenuPortal`, `MenuBackdrop`, `MenuPositioner`, `MenuPopup`, `MenuItem`.

### `frontend/src/components/library/LessonCard.tsx` (modified)

- Replace the hover-only `Trash2` icon button with a `MoreHorizontal` icon button that opens the dropdown menu.
- Menu items: **Rename** and **Delete**.
- Local state: `isEditing: boolean`, `editValue: string`.
- While `isEditing`, the `CardTitle` text is replaced by a controlled `<input>` pre-filled with the current title. The card's `<Link>` overlay is set to `pointer-events-none` so the input receives clicks.
- Confirm: Enter or `onBlur` — trims value, calls `onRename` if non-empty, exits editing.
- Cancel: Escape — restores original title, exits editing.

### `frontend/src/components/library/Library.tsx` (modified)

- Adds `handleRename(id: string, newTitle: string)` which calls `saveLessonMeta(db, { ...lesson, title: newTitle })` and updates local `lessons` state.
- Passes `onRename={handleRename}` to `LessonCard`.

## Data Flow

```
LessonCard (user confirms rename)
  → onRename(id, newTitle)
    → Library.handleRename
      → saveLessonMeta(db, { ...meta, title: newTitle })  // IndexedDB
      → setLessons(prev => prev.map(...))                 // local state
```

No backend changes required — titles live only in IndexedDB.

## Interface Changes

```ts
// LessonCard props
interface LessonCardProps {
  lesson: LessonMeta
  onDelete: (id: string) => void
  onRename: (id: string, newTitle: string) => void  // new
}
```

## Error Handling

- Empty or whitespace-only input → cancel without saving (no error shown).
- `saveLessonMeta` failure → no specific handling needed; IndexedDB errors are rare and non-critical for this flow.

## Testing

No new test files required. The rename flow is UI state + a single DB call already covered by existing `saveLessonMeta` plumbing.
