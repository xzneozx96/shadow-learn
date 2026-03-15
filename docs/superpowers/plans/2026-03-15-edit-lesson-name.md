# Edit Lesson Name Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dropdown action menu to each `LessonCard` in the Library with "Rename" and "Delete" actions, where "Rename" triggers inline title editing.

**Architecture:** A new `menu.tsx` UI primitive wraps `@base-ui/react/menu`; `LessonCard` gains local rename state and the dropdown; `Library` gains a stable `handleRename` callback that writes to IndexedDB and updates local state.

**Tech Stack:** React 19, TypeScript, `@base-ui/react/menu`, Tailwind CSS, IndexedDB via `idb`

---

## Chunk 1: menu.tsx primitive + LessonCard dropdown + Library wiring

### File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `frontend/src/components/ui/menu.tsx` | Thin styled wrapper around `@base-ui/react/menu` |
| Modify | `frontend/src/components/library/LessonCard.tsx` | Replace Trash button with `MoreHorizontal` menu; inline rename state |
| Modify | `frontend/src/components/library/Library.tsx` | Add `handleRename` callback; pass `onRename` to `LessonCard` |

---

### Task 1: Create `menu.tsx` UI primitive

**Files:**
- Create: `frontend/src/components/ui/menu.tsx`

- [ ] **Step 1: Create the menu wrapper**

  Follow the exact same pattern as `frontend/src/components/ui/dialog.tsx`: import the base-ui namespace, wrap each sub-component, forward props and classNames via `cn()`.

  ```tsx
  import { Menu as MenuPrimitive } from '@base-ui/react/menu'
  import * as React from 'react'
  import { cn } from '@/lib/utils'

  function MenuRoot({ ...props }: MenuPrimitive.Root.Props) {
    return <MenuPrimitive.Root data-slot="menu" {...props} />
  }

  function MenuTrigger({ ...props }: MenuPrimitive.Trigger.Props) {
    return <MenuPrimitive.Trigger data-slot="menu-trigger" {...props} />
  }

  function MenuPortal({ ...props }: MenuPrimitive.Portal.Props) {
    return <MenuPrimitive.Portal data-slot="menu-portal" {...props} />
  }

  function MenuBackdrop({ className, ...props }: MenuPrimitive.Backdrop.Props) {
    return (
      <MenuPrimitive.Backdrop
        data-slot="menu-backdrop"
        className={cn('fixed inset-0 z-40', className)}
        {...props}
      />
    )
  }

  function MenuPositioner({ className, ...props }: MenuPrimitive.Positioner.Props) {
    return (
      <MenuPrimitive.Positioner
        data-slot="menu-positioner"
        className={cn('z-50', className)}
        {...props}
      />
    )
  }

  function MenuPopup({ className, ...props }: MenuPrimitive.Popup.Props) {
    return (
      <MenuPrimitive.Popup
        data-slot="menu-popup"
        className={cn(
          'min-w-[10rem] overflow-hidden rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
          className,
        )}
        {...props}
      />
    )
  }

  function MenuItem({ className, ...props }: MenuPrimitive.Item.Props) {
    return (
      <MenuPrimitive.Item
        data-slot="menu-item"
        className={cn(
          'relative flex cursor-default select-none items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*=\'size-\'])]:size-4',
          className,
        )}
        {...props}
      />
    )
  }

  export { MenuRoot, MenuTrigger, MenuPortal, MenuBackdrop, MenuPositioner, MenuPopup, MenuItem }
  ```

- [ ] **Step 2: Verify TypeScript compiles**

  Run from `frontend/`:
  ```bash
  npx tsc --noEmit
  ```
  Expected: no errors related to `menu.tsx`.

- [ ] **Step 3: Commit**

  ```bash
  git add frontend/src/components/ui/menu.tsx
  git commit -m "feat: add Menu UI primitive wrapping @base-ui/react/menu"
  ```

---

### Task 2: Update `LessonCard` with dropdown menu and inline rename

**Files:**
- Modify: `frontend/src/components/library/LessonCard.tsx`

- [ ] **Step 1: Replace the Trash button with a `MoreHorizontal` menu**

  Full replacement of `frontend/src/components/library/LessonCard.tsx`:

  ```tsx
  import type { LessonMeta } from '@/types'
  import { Clock, FileVideo, MoreHorizontal, Trash2, Youtube } from 'lucide-react'
  import { useEffect, useRef, useState } from 'react'
  import { Link } from 'react-router-dom'
  import { Badge } from '@/components/ui/badge'
  import { Button } from '@/components/ui/button'
  import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
  import { MenuBackdrop, MenuItem, MenuPopup, MenuPositioner, MenuPortal, MenuRoot, MenuTrigger } from '@/components/ui/menu'

  interface LessonCardProps {
    lesson: LessonMeta
    onDelete: (id: string) => void
    onRename: (lesson: LessonMeta, newTitle: string) => void
  }

  function formatDuration(seconds: number): string {
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  export function LessonCard({ lesson, onDelete, onRename }: LessonCardProps) {
    const progress = lesson.progressSegmentId
      ? Math.min(100, Math.round((Number.parseInt(lesson.progressSegmentId, 10) / lesson.segmentCount) * 100))
      : 0

    const [isEditing, setIsEditing] = useState(false)
    const [editValue, setEditValue] = useState('')
    const isCancelledRef = useRef(false)
    const inputRef = useRef<HTMLInputElement>(null)

    // Auto-focus + select all text when editing starts
    useEffect(() => {
      if (isEditing)
        inputRef.current?.select()
    }, [isEditing])

    function startEditing() {
      isCancelledRef.current = false
      setEditValue(lesson.title)
      setIsEditing(true)
    }

    function confirmEdit() {
      if (isCancelledRef.current)
        return
      const trimmed = editValue.trim()
      if (trimmed)
        onRename(lesson, trimmed)
      setIsEditing(false)
    }

    function cancelEdit() {
      isCancelledRef.current = true
      setIsEditing(false)
    }

    function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
      if (e.key === 'Enter') {
        e.preventDefault()
        confirmEdit()
      }
      else if (e.key === 'Escape') {
        e.preventDefault()
        cancelEdit()
      }
    }

    return (
      <Card className="group relative flex flex-col transition-shadow hover:ring-2 hover:ring-white/15">
        {/* Card-level navigation link — disabled while editing to allow input interaction */}
        <Link
          to={`/lesson/${lesson.id}`}
          className="absolute inset-0 z-10"
          tabIndex={isEditing ? -1 : undefined}
          style={{ pointerEvents: isEditing ? 'none' : undefined }}
        />

        {/* Action menu — always visible on hover, z-index above the link */}
        <div className="absolute right-2 top-2 z-20 opacity-0 transition-opacity group-hover:opacity-100">
          <MenuRoot>
            <MenuTrigger
              render={(
                <Button variant="ghost" size="icon-sm" aria-label="Lesson actions">
                  <MoreHorizontal className="size-4" />
                </Button>
              )}
            />
            <MenuPortal>
              <MenuBackdrop />
              <MenuPositioner align="end">
                <MenuPopup>
                  <MenuItem
                    onClick={(e) => {
                      e.preventDefault()
                      startEditing()
                    }}
                  >
                    Rename
                  </MenuItem>
                  <MenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={(e) => {
                      e.preventDefault()
                      onDelete(lesson.id)
                    }}
                  >
                    <Trash2 className="size-4" />
                    Delete
                  </MenuItem>
                </MenuPopup>
              </MenuPositioner>
            </MenuPortal>
          </MenuRoot>
        </div>

        <CardHeader>
          <div className="flex items-center gap-2 text-white/40 mb-2">
            {lesson.source === 'youtube'
              ? <Youtube className="size-5 text-red-400" />
              : <FileVideo className="size-5 text-white/50" />}
            <div className="flex items-center gap-1 text-xs">
              <Clock className="size-3" />
              {formatDuration(lesson.duration)}
            </div>
            <span className="text-xs">
              {lesson.segmentCount}
              {' '}
              segments
            </span>
          </div>

          {isEditing
            ? (
                <input
                  ref={inputRef}
                  value={editValue}
                  onChange={e => setEditValue(e.target.value)}
                  onBlur={confirmEdit}
                  onKeyDown={handleKeyDown}
                  className="w-full rounded border border-border bg-transparent px-1 py-0.5 text-sm font-semibold text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/50"
                  aria-label="Rename lesson"
                />
              )
            : (
                <CardTitle className="line-clamp-2">{lesson.title}</CardTitle>
              )}
        </CardHeader>

        <CardContent className="mt-auto flex flex-col gap-3">
          {lesson.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {lesson.tags.map(tag => (
                <Badge key={tag} variant="secondary" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          )}

          <div className="space-y-1">
            <div className="flex justify-between text-xs text-white/40">
              <span>Progress</span>
              <span>
                {progress}
                %
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }
  ```

- [ ] **Step 2: Verify TypeScript compiles**

  ```bash
  npx tsc --noEmit
  ```
  Expected: no errors in `LessonCard.tsx`.

- [ ] **Step 3: Commit**

  ```bash
  git add frontend/src/components/library/LessonCard.tsx
  git commit -m "feat: replace Trash button with action menu and add inline rename to LessonCard"
  ```

---

### Task 3: Wire `handleRename` into `Library`

**Files:**
- Modify: `frontend/src/components/library/Library.tsx`

- [ ] **Step 1: Add `handleRename` and pass `onRename` to `LessonCard`**

  Add the `handleRename` callback after `handleDelete` and pass it to `LessonCard`. The callback only depends on `db`, not `lessons`, so it stays stable across list updates.

  In `Library.tsx`, after the existing `handleDelete` block (around line 46), add:

  ```ts
  const handleRename = useCallback(async (lesson: LessonMeta, newTitle: string) => {
    if (!db)
      return
    await saveLessonMeta(db, { ...lesson, title: newTitle })
    setLessons(prev => prev.map(l => l.id === lesson.id ? { ...l, title: newTitle } : l))
  }, [db])
  ```

  Update the `LessonCard` render call (in the `filtered.map(...)`) to pass `onRename`:

  ```tsx
  <LessonCard key={lesson.id} lesson={lesson} onDelete={handleDelete} onRename={handleRename} />
  ```

  Also add `saveLessonMeta` to the import from `@/db`:

  ```ts
  import { deleteFullLesson, getAllLessonMetas, saveLessonMeta } from '@/db'
  ```

- [ ] **Step 2: Verify TypeScript compiles and lint passes**

  ```bash
  npx tsc --noEmit && npm run lint
  ```
  Expected: no errors or warnings.

- [ ] **Step 3: Commit**

  ```bash
  git add frontend/src/components/library/Library.tsx
  git commit -m "feat: add handleRename to Library and wire onRename to LessonCard"
  ```

---

### Task 4: Smoke test in browser

- [ ] **Step 1: Start dev server**

  ```bash
  npm run dev
  ```
  Navigate to `http://localhost:5173`.

- [ ] **Step 2: Verify dropdown appears**

  Hover a lesson card → `⋯` button appears top-right → click it → menu opens with "Rename" and "Delete".

- [ ] **Step 3: Verify rename flow**

  Click "Rename" → title becomes an input with text selected → type a new name → press Enter → title updates. Repeat, press Escape → title reverts. Repeat, click away → title saves.

- [ ] **Step 4: Verify delete still works**

  Click "⋯" → Delete → card is removed from the library.

- [ ] **Step 5: Final build check**

  ```bash
  npm run build
  ```
  Expected: exits with code 0, no TypeScript or Vite errors.
