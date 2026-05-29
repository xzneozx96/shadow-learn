# Continue Where Left Off — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Continue where left off" item to the Smart Study queue that resurfaces the most recently abandoned (<80% watched) grammar tip from Collection/Discover and links straight back to the exact page + timestamp.

**Architecture:** Persist the video `title` and exact page `resumeRoute` onto each `TipProgress` record as the user watches. A new derivation in `useStudyQueue` scans all tip-progress records, picks the most recently abandoned one, and exposes it as `continueItem`. `DailyQueuePopup` renders one row (same shape as the existing Shadowing row) that navigates to the stored route; the tip page already seeks the player to `watchedSec`.

**Tech Stack:** React 19, TypeScript, IndexedDB (`idb`), vitest + Testing Library + fake-indexeddb.

**Spec:** `docs/superpowers/specs/2026-05-29-continue-where-left-off-design.md`

---

## File Structure

- `frontend/src/features/learning-materials/domain/tips.ts` — add optional `title` / `resumeRoute` to `TipProgress`.
- `frontend/src/db/index.ts` — add read-only `getAllTipProgress` accessor.
- `frontend/src/features/learning-materials/application/useTipProgress.ts` — persist `title`/`resumeRoute` in `recordPosition`; preserve them in `markComplete`/`markIncomplete`.
- `frontend/src/features/learning-materials/ui/TipCoursePage.tsx` — pass `{ title, route }` at the `recordPosition` call site.
- `frontend/src/features/study/application/useStudyQueue.ts` — `ContinueItem` type, derivation, `continueItem`/`continueDone` state, count integration.
- `frontend/src/features/study/ui/queue/DailyQueuePopup.tsx` — render the Continue row.
- `frontend/src/shared/lib/i18n.ts` — `queue.continue` key (en + vi).
- Tests (co-located `*.test.ts`): `useStudyQueue.test.ts` (extend), `useTipProgress.test.ts` (new).

---

## Task 1: Extend `TipProgress` type + add `getAllTipProgress` accessor

**Files:**
- Modify: `frontend/src/features/learning-materials/domain/tips.ts:32-44`
- Modify: `frontend/src/db/index.ts` (after `listTipProgressForCourse`, ~line 954)
- Test: `frontend/src/features/study/application/useStudyQueue.test.ts` (round-trip assertion added in Task 3; this task’s accessor is exercised there)

- [ ] **Step 1: Add the two optional fields to `TipProgress`**

In `frontend/src/features/learning-materials/domain/tips.ts`, change the interface:

```ts
export interface TipProgress {
  // Composite key: `${courseId}:${videoId}` to scope progress per course.
  // A standalone video referenced by multiple discovery paths still uses
  // its own course namespace.
  key: string
  courseId: string
  videoId: string
  watchedSec: number
  totalSec: number
  completed: boolean
  completedAt: string | null
  lastSeenAt: string
  // Optional for backward compatibility: records written before the
  // "continue where left off" feature lack these. New writes always set them.
  title?: string        // resolved video title, for the queue row label
  resumeRoute?: string  // exact page link, e.g. /tips/video/abc?lesson=abc
}
```

- [ ] **Step 2: Add the `getAllTipProgress` accessor**

In `frontend/src/db/index.ts`, immediately after the existing `listTipProgressForCourse` function (~line 956):

```ts
export async function getAllTipProgress(db: ShadowLearnDB): Promise<TipProgress[]> {
  return db.getAll('tip-progress')
}
```

`TipProgress` is already imported at the top of `db/index.ts` (line 4). The `tip-progress` store already exists — this is a pure read accessor, so **no `DB_VERSION` bump**.

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS (no errors).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/learning-materials/domain/tips.ts frontend/src/db/index.ts
git commit -m "feat: add optional title/resumeRoute to TipProgress and getAllTipProgress accessor"
```

---

## Task 2: Persist `title`/`resumeRoute` in `useTipProgress`

**Files:**
- Modify: `frontend/src/features/learning-materials/application/useTipProgress.ts`
- Modify: `frontend/src/features/learning-materials/ui/TipCoursePage.tsx:191`
- Test: `frontend/src/features/learning-materials/application/useTipProgress.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `frontend/src/features/learning-materials/application/useTipProgress.test.ts`:

```ts
import type { ShadowLearnDB } from '@/db'
import { act, renderHook, waitFor } from '@testing-library/react'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getTipProgress, initDB } from '@/db'
import 'fake-indexeddb/auto'

let testDb: ShadowLearnDB

// useTipProgress reads `db` from AuthContext; mock it to our test DB.
vi.mock('@/app/providers/AuthContext', () => ({
  useAuth: () => ({ db: testDb, keys: null }),
}))

// Imported after the mock so the hook picks up the mocked AuthContext.
const { useTipProgress } = await import('@/features/learning-materials/application/useTipProgress')

beforeEach(async () => {
  testDb = await initDB()
})

afterEach(() => {
  testDb.close()
  globalThis.indexedDB = new IDBFactory()
})

describe('useTipProgress persistence', () => {
  it('recordPosition persists title and resumeRoute', async () => {
    const { result } = renderHook(() => useTipProgress('vid1', 'vid1'))
    await waitFor(() => expect(result.current.loaded).toBe(true))
    await act(() => result.current.recordPosition(10, 100, {
      title: 'Grammar 101',
      route: '/tips/video/vid1?lesson=vid1',
    }))
    const saved = await getTipProgress(testDb, 'vid1:vid1')
    expect(saved?.title).toBe('Grammar 101')
    expect(saved?.resumeRoute).toBe('/tips/video/vid1?lesson=vid1')
  })

  it('markComplete preserves existing title and resumeRoute', async () => {
    const { result } = renderHook(() => useTipProgress('vid1', 'vid1'))
    await waitFor(() => expect(result.current.loaded).toBe(true))
    await act(() => result.current.recordPosition(10, 100, {
      title: 'Grammar 101',
      route: '/tips/video/vid1?lesson=vid1',
    }))
    await act(() => result.current.markComplete())
    const saved = await getTipProgress(testDb, 'vid1:vid1')
    expect(saved?.completed).toBe(true)
    expect(saved?.title).toBe('Grammar 101')
    expect(saved?.resumeRoute).toBe('/tips/video/vid1?lesson=vid1')
  })
})
```

Add the missing `vi` import at the top: change the vitest import line to
`import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/features/learning-materials/application/useTipProgress.test.ts`
Expected: FAIL — `recordPosition` does not yet accept a `meta` argument, so `saved.title` is `undefined`.

- [ ] **Step 3: Extend the `recordPosition` signature and persist the fields**

In `frontend/src/features/learning-materials/application/useTipProgress.ts`:

Update the result type (lines 8-16):

```ts
export interface UseTipProgressResult {
  loaded: boolean
  watchedSec: number
  totalSec: number
  completed: boolean
  recordPosition: (watchedSec: number, totalSec: number, meta?: { title?: string, route?: string }) => Promise<void>
  markComplete: () => Promise<void>
  markIncomplete: () => Promise<void>
}
```

Replace `recordPosition` (lines 45-59) with:

```ts
  const recordPosition = useCallback(async (watchedSec: number, totalSec: number, meta?: { title?: string, route?: string }) => {
    const wasComplete = state.p?.completed ?? false
    const shouldComplete = wasComplete || (totalSec > 0 && watchedSec / totalSec >= WATCHED_THRESHOLD)
    const next: TipProgress = {
      key,
      courseId,
      videoId,
      watchedSec,
      totalSec,
      completed: shouldComplete,
      completedAt: shouldComplete ? (state.p?.completedAt ?? new Date().toISOString()) : null,
      lastSeenAt: new Date().toISOString(),
      title: meta?.title ?? state.p?.title,
      resumeRoute: meta?.route ?? state.p?.resumeRoute,
    }
    await writeState(next)
  }, [state.p, key, courseId, videoId, writeState])
```

In `markComplete` (lines 61-73), add the two preserved fields to the `next` object, right after `lastSeenAt`:

```ts
      lastSeenAt: new Date().toISOString(),
      title: state.p?.title,
      resumeRoute: state.p?.resumeRoute,
```

In `markIncomplete` (lines 75-87), add the same two lines after `lastSeenAt`:

```ts
      lastSeenAt: new Date().toISOString(),
      title: state.p?.title,
      resumeRoute: state.p?.resumeRoute,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/features/learning-materials/application/useTipProgress.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Pass title + route at the call site**

In `frontend/src/features/learning-materials/ui/TipCoursePage.tsx`, replace the `onTimeUpdate` prop on `LessonPlayer` (line 191):

```tsx
              onTimeUpdate={(cur, dur) => {
                void progress.recordPosition(cur, dur, {
                  title: activeLesson?.title,
                  route: `/tips/${safeSource}/${safeId}?lesson=${activeVideoId}`,
                })
              }}
```

`safeSource`, `safeId`, `activeVideoId`, and `activeLesson` are already in scope (lines 27-28, 59-66).

- [ ] **Step 6: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/features/learning-materials/application/useTipProgress.ts frontend/src/features/learning-materials/application/useTipProgress.test.ts frontend/src/features/learning-materials/ui/TipCoursePage.tsx
git commit -m "feat: persist video title and resume route onto TipProgress"
```

---

## Task 3: Derive `continueItem` in `useStudyQueue`

**Files:**
- Modify: `frontend/src/features/study/application/useStudyQueue.ts`
- Test: `frontend/src/features/study/application/useStudyQueue.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `frontend/src/features/study/application/useStudyQueue.test.ts`.

First, extend the imports (line 5) to include `putTipProgress`:

```ts
import { initDB, putTipProgress, saveSpacedRepetitionItem, saveVocabEntry } from '@/db'
```

Add a helper near `makeSRItem` (after line 40):

```ts
function makeTipProgress(over: Partial<import('@/features/learning-materials/domain/tips').TipProgress> = {}) {
  const courseId = over.courseId ?? 'vidA'
  const videoId = over.videoId ?? 'vidA'
  return {
    key: `${courseId}:${videoId}`,
    courseId,
    videoId,
    watchedSec: 30,
    totalSec: 100,
    completed: false,
    completedAt: null,
    lastSeenAt: '2026-05-13T09:00:00.000Z',
    ...over,
  }
}
```

Add this `describe` block at the end of the file (before the final closing of the outer `describe`, i.e. inside it as a sibling of the existing `it`s):

```ts
  it('continueItem null when no tip progress exists', async () => {
    const { result } = renderHook(() => useStudyQueue(db, null))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.continueItem).toBeNull()
  })

  it('surfaces an abandoned tip (incomplete, watched > 0)', async () => {
    await putTipProgress(db, makeTipProgress({
      title: 'Grammar 101',
      resumeRoute: '/tips/video/vidA?lesson=vidA',
    }))
    const { result } = renderHook(() => useStudyQueue(db, null))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.continueItem).toEqual({
      title: 'Grammar 101',
      route: '/tips/video/vidA?lesson=vidA',
    })
  })

  it('excludes completed tips', async () => {
    await putTipProgress(db, makeTipProgress({ completed: true, completedAt: '2026-05-12T00:00:00.000Z' }))
    const { result } = renderHook(() => useStudyQueue(db, null))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.continueItem).toBeNull()
  })

  it('excludes untouched tips (watchedSec === 0)', async () => {
    await putTipProgress(db, makeTipProgress({ watchedSec: 0 }))
    const { result } = renderHook(() => useStudyQueue(db, null))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.continueItem).toBeNull()
  })

  it('picks the most recent abandoned tip by lastSeenAt', async () => {
    await putTipProgress(db, makeTipProgress({
      courseId: 'old', videoId: 'old', lastSeenAt: '2026-05-10T00:00:00.000Z',
      title: 'Old', resumeRoute: '/tips/video/old?lesson=old',
    }))
    await putTipProgress(db, makeTipProgress({
      courseId: 'new', videoId: 'new', lastSeenAt: '2026-05-13T08:00:00.000Z',
      title: 'New', resumeRoute: '/tips/video/new?lesson=new',
    }))
    const { result } = renderHook(() => useStudyQueue(db, null))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.continueItem?.title).toBe('New')
  })

  it('falls back to heuristic route and empty title for legacy records', async () => {
    // Standalone video: courseId === videoId → /tips/video/<id>
    await putTipProgress(db, makeTipProgress({ courseId: 'soloVid', videoId: 'soloVid' }))
    const { result } = renderHook(() => useStudyQueue(db, null))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.continueItem).toEqual({
      title: '',
      route: '/tips/video/soloVid',
    })
  })

  it('falls back to playlist heuristic route when courseId !== videoId', async () => {
    await putTipProgress(db, makeTipProgress({ courseId: 'PL123', videoId: 'vidX' }))
    const { result } = renderHook(() => useStudyQueue(db, null))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.continueItem?.route).toBe('/tips/playlist/PL123?lesson=vidX')
  })

  it('continueDone true when tip last seen today; folds out of incompleteCount', async () => {
    await putTipProgress(db, makeTipProgress({ lastSeenAt: '2026-05-13T08:00:00.000Z' }))
    const { result } = renderHook(() => useStudyQueue(db, null))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.continueDone).toBe(true)
    expect(result.current.incompleteCount).toBe(0)
  })

  it('continueDone false when tip last seen before today; counts as incomplete', async () => {
    await putTipProgress(db, makeTipProgress({ lastSeenAt: '2026-05-12T08:00:00.000Z' }))
    const { result } = renderHook(() => useStudyQueue(db, null))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.continueDone).toBe(false)
    expect(result.current.incompleteCount).toBe(1)
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/features/study/application/useStudyQueue.test.ts`
Expected: FAIL — `continueItem` / `continueDone` are not on the returned object (TS error or `undefined`).

- [ ] **Step 3: Implement the derivation**

In `frontend/src/features/study/application/useStudyQueue.ts`:

Add imports. Change the `@/db` import block (lines 4-11) to include `getAllTipProgress`:

```ts
import {
  deleteDailyTask,
  getAllSessionLogs,
  getAllTipProgress,
  getDailyTasks,
  getDueItems,
  getVocabEntryById,
  saveDailyTask,
} from '@/db'
```

Add a type import for `TipProgress` near the top type imports (after line 2):

```ts
import type { TipProgress } from '@/features/learning-materials/domain/tips'
```

Add the `ContinueItem` interface and extend `StudyQueueState` (add the two fields after `shadowingDone` on line 38):

```ts
export interface ContinueItem {
  title: string
  route: string
}
```

```ts
  shadowingDone: boolean
  continueItem: ContinueItem | null
  continueDone: boolean
```

Add a module-level helper (after `MAX_WORDS` on line 21):

```ts
function tipFallbackRoute(t: TipProgress): string {
  return t.courseId === t.videoId
    ? `/tips/video/${t.courseId}`
    : `/tips/playlist/${t.courseId}?lesson=${t.videoId}`
}
```

Add state (after the `shadowingDone` state on line 56):

```ts
  const [continueItem, setContinueItem] = useState<ContinueItem | null>(null)
  const [continueDone, setContinueDone] = useState(false)
```

In `load`, after the Custom tasks block (`setCustomTasks(await getDailyTasks(db))`, line 120), insert:

```ts
    // ── Continue where left off (most recent abandoned grammar tip) ─────────
    const tips = await getAllTipProgress(db)
    const abandoned = tips
      .filter(t => !t.completed && t.watchedSec > 0)
      .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt))[0]
    if (abandoned) {
      setContinueItem({
        title: abandoned.title ?? '',
        route: abandoned.resumeRoute ?? tipFallbackRoute(abandoned),
      })
      setContinueDone(abandoned.lastSeenAt.slice(0, 10) === today)
    }
    else {
      setContinueItem(null)
      setContinueDone(false)
    }
```

Extend `incompleteCount` (lines 190-193) to add the continue term:

```ts
  const incompleteCount
    = (hasDailyReview && !dailyReviewDone ? 1 : 0)
      + (hasLesson && !shadowingDone ? 1 : 0)
      + (continueItem && !continueDone ? 1 : 0)
      + customTasks.filter(t => t.completedDate !== today).length
```

Add both fields to the returned object (after `shadowingDone,` on line 212):

```ts
    shadowingDone,
    continueItem,
    continueDone,
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/features/study/application/useStudyQueue.test.ts`
Expected: PASS (all existing + 9 new tests).

- [ ] **Step 5: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/study/application/useStudyQueue.ts frontend/src/features/study/application/useStudyQueue.test.ts
git commit -m "feat: derive continueItem (abandoned tip) in useStudyQueue"
```

---

## Task 4: Render the Continue row + i18n

**Files:**
- Modify: `frontend/src/shared/lib/i18n.ts:727` (en) and `:1652` (vi)
- Modify: `frontend/src/features/study/ui/queue/DailyQueuePopup.tsx`

- [ ] **Step 1: Add the i18n key (en)**

In `frontend/src/shared/lib/i18n.ts`, after the en `'queue.shadowing'` line (727):

```ts
    'queue.continue': 'Continue where you left off',
```

- [ ] **Step 2: Add the i18n key (vi)**

After the vi `'queue.shadowing'` line (1652):

```ts
    'queue.continue': 'Tiếp tục bài đang học dở',
```

- [ ] **Step 3: Add the Continue row to the popup**

In `frontend/src/features/study/ui/queue/DailyQueuePopup.tsx`:

Extend `hasAnyContent` (line 39) to include the continue item:

```ts
  const hasAnyContent = queue.hasDailyReview || !!mostRecentLesson || queue.customTasks.length > 0 || !!queue.continueItem
```

Add a navigation handler next to `handleStartShadowing` (after line 50):

```ts
  function handleContinue() {
    if (!queue.continueItem)
      return
    onClose()
    navigate(queue.continueItem.route)
  }
```

Insert the row immediately after the Shadowing block (after its closing `)}` on line 207, before the Custom tasks `{queue.customTasks.map(...)}` on line 210):

```tsx
          {/* Continue where left off */}
          {queue.continueItem && (
            <div
              role="button"
              tabIndex={0}
              className="w-full flex items-center gap-3 px-4 py-2.5 pr-3 hover:bg-muted/30 transition-colors text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              onClick={handleContinue}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleContinue() } }}
            >
              <CircleIndicator done={queue.continueDone} partial={false} />
              <span className={cn(
                'flex-1 text-sm font-semibold truncate',
                queue.continueDone ? 'line-through text-muted-foreground' : '',
              )}
              >
                {queue.continueItem.title || t('queue.continue')}
              </span>
              {queue.continueDone
                ? (
                    <Button size="icon-xs" variant="ghost" className="text-emerald-500 pointer-events-none">
                      <Check className="size-3" />
                    </Button>
                  )
                : <StartButton />}
            </div>
          )}
```

`CircleIndicator`, `StartButton`, `Check`, `Button`, `cn`, and `t` are already imported/defined in this file.

- [ ] **Step 4: Typecheck + lint**

Run: `cd frontend && npx tsc --noEmit && npx eslint src/features/study/ui/queue/DailyQueuePopup.tsx src/shared/lib/i18n.ts`
Expected: PASS (no errors).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/shared/lib/i18n.ts frontend/src/features/study/ui/queue/DailyQueuePopup.tsx
git commit -m "feat: render Continue where left off row in study queue"
```

---

## Task 5: Full verification

- [ ] **Step 1: Run the full frontend test suite**

Run: `cd frontend && npx vitest run`
Expected: PASS (all green, including the new useTipProgress and useStudyQueue tests).

- [ ] **Step 2: Typecheck the whole project**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Lint changed files**

Run: `cd frontend && npx eslint src/features/learning-materials/application/useTipProgress.ts src/features/learning-materials/ui/TipCoursePage.tsx src/features/study/application/useStudyQueue.ts src/features/study/ui/queue/DailyQueuePopup.tsx src/db/index.ts src/features/learning-materials/domain/tips.ts`
Expected: PASS.

- [ ] **Step 4: Manual smoke (optional, requires running app)**

1. Open a Collection tip (either tab), watch a few seconds (<80%), navigate away.
2. Open the Smart Study queue popup — a "Continue where you left off" row appears showing the tip title.
3. Click it — lands on the tip page; the player resumes at the watched second.
4. Watch past 80% — on next queue refresh the row disappears.

---

## Self-Review notes

- **Spec coverage:** title/resumeRoute persistence (Tasks 1-2), both-tabs coverage via shared TipProgress (Task 2 call site is the single watch path), 80% abandoned filter (Task 3 `!completed && watchedSec>0`), most-recent-by-lastSeenAt (Task 3), heuristic + generic-label fallbacks (Task 3), row + done semantics (Task 4), count integration (Task 3). All covered.
- **No DB_VERSION bump:** confirmed — optional value fields + read accessor only.
- **Type consistency:** `recordPosition(…, meta?: { title?, route? })`, `TipProgress.title?`/`resumeRoute?`, `ContinueItem { title, route }`, `continueItem`/`continueDone` used identically across hook, tests, and popup.
