# Lesson View Rename Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a pencil-icon rename action to the VideoPanel header so users can edit the lesson title from the lesson view.

**Architecture:** `useLesson` exposes a stable `updateMeta` setter; `VideoPanel` gains optional `onRename` prop with local inline-edit state (pencil icon on hover, same Enter/Escape/blur/isCancelledRef pattern as LessonCard); `LessonView` wires them together with `handleRename` that persists to IndexedDB then calls `updateMeta`.

**Tech Stack:** React 19, TypeScript, `@base-ui/react`, Tailwind CSS (named groups), IndexedDB via `idb`

---

## Chunk 1: All three file changes

### File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `frontend/src/hooks/useLesson.ts` | Expose stable `updateMeta` callback |
| Modify | `frontend/src/components/lesson/VideoPanel.tsx` | Pencil icon + inline rename state |
| Modify | `frontend/src/components/lesson/LessonView.tsx` | Wire `handleRename` and pass `onRename` |

---

### Task 1: Extend `useLesson` with `updateMeta`

**Files:**
- Modify: `frontend/src/hooks/useLesson.ts`

- [ ] **Step 1: Add `useCallback` to the react import and define `updateMeta`**

  Replace the file content with:

  ```ts
  import type { ShadowLearnDB } from '../db'
  import type { LessonMeta, Segment } from '../types'
  import { useCallback, useEffect, useState } from 'react'
  import { getLessonMeta, getSegments, saveLessonMeta } from '../db'

  interface UseLessonResult {
    meta: LessonMeta | null
    segments: Segment[]
    loading: boolean
    error: string | null
    updateMeta: (updates: Partial<LessonMeta>) => void
  }

  export function useLesson(db: ShadowLearnDB | null, lessonId: string | undefined): UseLessonResult {
    const [meta, setMeta] = useState<LessonMeta | null>(null)
    const [segments, setSegments] = useState<Segment[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
      if (!db || !lessonId)
        return

      async function load() {
        try {
          setLoading(true)
          const [m, s] = await Promise.all([
            getLessonMeta(db!, lessonId!),
            getSegments(db!, lessonId!),
          ])
          if (!m) {
            setError('Lesson not found')
            return
          }
          // Update lastOpenedAt
          m.lastOpenedAt = new Date().toISOString()
          await saveLessonMeta(db!, m)
          setMeta(m)
          setSegments(s || [])
        }
        catch (e) {
          setError(e instanceof Error ? e.message : 'Failed to load lesson')
        }
        finally {
          setLoading(false)
        }
      }

      load()
    }, [db, lessonId])

    // Stable reference (empty deps) — safe to list as a dep in LessonView callbacks
    const updateMeta = useCallback((updates: Partial<LessonMeta>) => {
      setMeta(prev => prev ? { ...prev, ...updates } : prev)
    }, [])

    return { meta, segments, loading, error, updateMeta }
  }
  ```

- [ ] **Step 2: Verify TypeScript compiles**

  ```bash
  cd frontend && npx tsc --noEmit
  ```
  Expected: no errors in `useLesson.ts`. (Pre-existing errors in other files are acceptable.)

- [ ] **Step 3: Commit**

  ```bash
  git add frontend/src/hooks/useLesson.ts
  git commit -m "feat: expose updateMeta from useLesson"
  ```

---

### Task 2: Add pencil icon + inline rename to `VideoPanel`

**Files:**
- Modify: `frontend/src/components/lesson/VideoPanel.tsx`

- [ ] **Step 1: Update props, add state, and update the header section**

  Make the following targeted changes to `frontend/src/components/lesson/VideoPanel.tsx`:

  **1a. Add `Pencil` to the lucide-react import (line 2):**
  ```ts
  import { ExternalLink, Home, Pause, Pencil, Play, SkipBack, SkipForward } from 'lucide-react'
  ```

  **1b. Add `useRef` to the react import (line 3) — `useState` and `useEffect` are already there:**
  ```ts
  import { useEffect, useMemo, useRef, useState } from 'react'
  ```

  **1c. Add `onRename` to `VideoPanelProps` (after `videoBlob?`):**
  ```ts
  interface VideoPanelProps {
    lesson: LessonMeta
    segments: Segment[]
    activeSegment: Segment | null
    videoBlob?: Blob
    onRename?: (newTitle: string) => void
  }
  ```

  **1d. Destructure `onRename` in the function signature:**
  ```ts
  export function VideoPanel({ lesson, segments, activeSegment, videoBlob, onRename }: VideoPanelProps) {
  ```

  **1e. Add rename state and logic immediately after the existing state declarations (after `const [duration, setDuration] = useState(0)`):**
  ```ts
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState('')
  const isCancelledRef = useRef(false)
  const titleSnapshotRef = useRef('')
  const inputRef = useRef<HTMLInputElement>(null)

  // Auto-focus + select all when rename input appears
  useEffect(() => {
    if (isEditing)
      inputRef.current?.select()
  }, [isEditing])

  function startEditing() {
    isCancelledRef.current = false
    titleSnapshotRef.current = lesson.title
    setEditValue(lesson.title)
    setIsEditing(true)
  }

  function confirmEdit() {
    if (isCancelledRef.current)
      return
    const trimmed = editValue.trim()
    if (trimmed && trimmed !== titleSnapshotRef.current)
      onRename?.(trimmed)
    setIsEditing(false)
  }

  function cancelEdit() {
    isCancelledRef.current = true
    setIsEditing(false)
  }

  function handleRenameKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      confirmEdit()
    }
    else if (e.key === 'Escape') {
      e.preventDefault()
      cancelEdit()
    }
  }
  ```

  **1f. Replace the header title section** (the `<span>` showing `lesson.title`) with the group/pencil pattern. The current header is:
  ```tsx
  {/* Header */}
  <div className="flex items-center gap-2 border-b border-border px-3 py-2">
    <Button variant="ghost" size="icon-sm" render={<Link to="/" />}>
      <Home className="size-4" />
    </Button>
    <div className="h-4 w-px bg-border" />
    <span className="truncate text-sm font-medium text-foreground">
      {lesson.title}
    </span>
  </div>
  ```

  Replace with:
  ```tsx
  {/* Header */}
  <div className="flex items-center gap-2 border-b border-border px-3 py-2">
    <Button variant="ghost" size="icon-sm" render={<Link to="/" />}>
      <Home className="size-4" />
    </Button>
    <div className="h-4 w-px bg-border" />
    <div className="group/title flex min-w-0 flex-1 items-center gap-1">
      {isEditing
        ? (
            <input
              ref={inputRef}
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              onBlur={confirmEdit}
              onKeyDown={handleRenameKeyDown}
              className="min-w-0 flex-1 truncate rounded border border-border bg-transparent px-1 py-0.5 text-sm font-medium text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/50"
              aria-label="Rename lesson"
            />
          )
        : (
            <span className="truncate text-sm font-medium text-foreground">
              {lesson.title}
            </span>
          )}
      {onRename && !isEditing && (
        <Button
          variant="ghost"
          size="icon-xs"
          className="shrink-0 opacity-0 transition-opacity group-hover/title:opacity-100"
          onClick={startEditing}
          aria-label="Rename lesson"
        >
          <Pencil className="size-3" />
        </Button>
      )}
    </div>
  </div>
  ```

- [ ] **Step 2: Verify TypeScript compiles**

  ```bash
  npx tsc --noEmit
  ```
  Expected: no errors in `VideoPanel.tsx`.

- [ ] **Step 3: Commit**

  ```bash
  git add frontend/src/components/lesson/VideoPanel.tsx
  git commit -m "feat: add pencil icon rename to VideoPanel header"
  ```

---

### Task 3: Wire `handleRename` in `LessonView`

**Files:**
- Modify: `frontend/src/components/lesson/LessonView.tsx`

- [ ] **Step 1: Destructure `updateMeta`, add `handleRename`, pass `onRename` to `VideoPanel`**

  **3a. Add `updateMeta` to the `useLesson` destructure (line 19):**
  ```ts
  const { meta, segments, loading, error, updateMeta } = useLesson(db, id)
  ```

  **3b. Add `handleRename` after `handleProgressUpdate` (around line 77):**
  ```ts
  const handleRename = useCallback(async (newTitle: string) => {
    if (!db || !meta)
      return
    await saveLessonMeta(db, { ...meta, title: newTitle })
    updateMeta({ title: newTitle })
  }, [db, meta, updateMeta])
  ```

  **3c. Pass `onRename` to `VideoPanel` (around line 104-109):**
  ```tsx
  <VideoPanel
    lesson={meta}
    segments={segments}
    activeSegment={activeSegment}
    videoBlob={videoBlob}
    onRename={handleRename}
  />
  ```

- [ ] **Step 2: Verify TypeScript and lint**

  ```bash
  npx tsc --noEmit && npm run lint
  ```
  Expected: no errors introduced by our changes. Pre-existing errors in other files are acceptable.

- [ ] **Step 3: Commit**

  ```bash
  git add frontend/src/components/lesson/LessonView.tsx
  git commit -m "feat: wire handleRename into LessonView and pass onRename to VideoPanel"
  ```

---

### Task 4: Build verification

- [ ] **Step 1: Run final build**

  ```bash
  npm run build 2>&1 | grep -E "VideoPanel|LessonView|useLesson"
  ```
  Expected: no errors referencing our three modified files.

- [ ] **Step 2: Manual smoke test**

  Start the dev server (`npm run dev`) and navigate to any lesson:
  - Hover the lesson title in the VideoPanel header → pencil icon appears
  - Click pencil → title becomes input, text selected
  - Type a new title, press Enter → title updates in the header
  - Hover again, click pencil → type something, press Escape → title reverts
  - Click pencil → type something, click elsewhere → title saves
  - Open the Library (`/`) → card shows the updated title
