# Continue Where Left Off — Smart Study Item

**Date:** 2026-05-29
**Status:** Approved design, pending implementation plan

## Goal

Add a "Continue where left off" item to the Smart Study queue that resurfaces the
most recently **abandoned grammar tip** from Collection/Discover, nudging the user to
finish it. One row, the single most relevant tip.

## Scope decisions (resolved during brainstorming)

- **Tips only — not own-lessons.** The user's own YouTube lessons (LessonView + AI
  Companion) are already surfaced by the existing **Shadowing** row. Adding a second
  row for the same lesson would be redundant and confusing. This feature targets the
  grammar **tips**, which currently have no presence in the Smart Study queue.
- **Both Collection tabs covered.** Tips appear in two tabs — **Mẹo học tập** (Tips)
  and **Tài liệu của tôi** (My materials). Both open through `TipCoursePage`
  (`/tips/:source/:id`) and write to the same `TipProgress` store, so a single scan of
  that store covers both with no per-tab logic.

## Definition of "abandoned" (incomplete)

A tip is abandoned when started but `<80%` watched: `!completed && watchedSec > 0`.
`TipProgress.completed` already auto-flips at 80% (`WATCHED_THRESHOLD = 0.8` in
`useTipProgress.ts`). No new threshold logic needed.

## What already exists (no work)

- `tip-progress` IDB store (`db/index.ts:245`).
- `useTipProgress.recordPosition` runs on every video time tick, writing
  `watchedSec`/`totalSec`/`lastSeenAt` and auto-completing at 80%
  (`useTipProgress.ts:45-59`).
- Resume route `/tips/{source}/{id}?lesson={videoId}` already seeks the tip player to
  the exact timestamp: `LessonPlayer` sets YouTube `playerVars.start = resumeSec`
  (`LessonPlayer.tsx:59`), fed `resumeSec={progress.watchedSec}` (`TipCoursePage.tsx:190`).
  So `watchedSec` (already persisted) is the source of truth for the resume point — no
  timestamp URL param is needed.
- The video title and the page route are both known on the frontend at watch time
  (`TipCoursePage`: `activeLesson.title`, `safeSource`, `safeId`, `activeVideoId`).

## Persisting title + resume link onto TipProgress

The title and the page link exist on the frontend at watch time but are never written
to IDB, so the queue scan can't see them. Fix: persist them when recording progress.

- Extend the `TipProgress` value with two optional fields:

  ```ts
  interface TipProgress {
    // ...existing fields...
    title?: string        // resolved video title, for the queue row label
    resumeRoute?: string  // exact page link, e.g. /tips/video/abc?lesson=abc
  }
  ```

  These are optional fields on an existing object store. IndexedDB stores values
  schemalessly (only keyPath/indexes require migration), so **no DB_VERSION bump**.
  Records written before this change simply lack the fields (see fallbacks).

- Extend `recordPosition` to accept and persist them:

  ```ts
  recordPosition: (watchedSec: number, totalSec: number,
                   meta?: { title?: string, route?: string }) => Promise<void>
  ```

  At the call site (`TipCoursePage.tsx:191`), pass
  `{ title: activeLesson?.title, route: \`/tips/${safeSource}/${safeId}?lesson=${activeVideoId}\` }`.
  `markComplete`/`markIncomplete` preserve any existing `title`/`resumeRoute` on the
  record.

  Clicking the queue item navigates to `resumeRoute`; the tip page then seeks the
  player to `watchedSec` automatically. Exact page + exact timestamp.

  **Tradeoff:** storing the link denormalizes the route. If the `/tips` route scheme
  changes later, legacy records' links go stale — recovered by the heuristic fallback
  below and overwritten on the next watch. Low risk, accepted.

## Architecture

Selection logic lives in `useStudyQueue` (already async). It returns one new field;
the popup renders a row.

### New state field

```ts
interface ContinueItem {
  title: string         // stored TipProgress.title, or generic i18n fallback
  route: string         // ready-to-navigate
  lastSeenAt: string    // ISO; for done-check
}

// added to StudyQueueState
continueItem: ContinueItem | null
```

### Selection logic (in `useStudyQueue.load`)

1. Scan all tips via new `getAllTipProgress(db)`.
2. Filter `!completed && watchedSec > 0`.
3. Pick the most recent by `lastSeenAt`.
4. Build the row:
   - **label** = `title` if present, else generic i18n (`queue.continue`).
   - **route** = `resumeRoute` if present, else fallback heuristic on
     `courseId`/`videoId`: `courseId === videoId` → `/tips/video/{courseId}`, else
     `/tips/playlist/{courseId}?lesson={videoId}`. (Holds because a standalone video's
     `courseId` equals its `videoId`, while a playlist's `courseId` is the playlist id.)
5. `continueItem = null` if no tip qualifies.

### New DB accessor (read-only, no DB_VERSION bump)

```ts
export async function getAllTipProgress(db: ShadowLearnDB): Promise<TipProgress[]> {
  return db.getAll('tip-progress')
}
```

The `tip-progress` store already exists; a pure read accessor needs no migration.

## Rendering — DailyQueuePopup

New row after the Shadowing row, identical in shape (`DailyQueuePopup.tsx:183-207`):

- `CircleIndicator` + label + `StartButton`.
- Click → `navigate(continueItem.route)` then `onClose()`.
- Hidden when `continueItem == null`.

**Done semantics** — mirror Shadowing: `continueDone = continueItem != null &&
continueItem.lastSeenAt` is today (`todayISO()`). Resuming updates `lastSeenAt` to
today, so the row strikes through once engaged today, and drops out on the next
refresh once it crosses 80%.

## Count integration

Fold into existing derivations (`useStudyQueue.ts:190-198`), matching the
`hasLesson && !shadowingDone` pattern:

```ts
const incompleteCount
  = (hasDailyReview && !dailyReviewDone ? 1 : 0)
  + (hasLesson && !shadowingDone ? 1 : 0)
  + (continueItem && !continueDone ? 1 : 0)
  + customTasks.filter(t => t.completedDate !== today).length
```

## Edge cases

- Legacy `TipProgress` lacking `title`: show generic i18n label.
- Legacy `TipProgress` lacking `resumeRoute`: route via the `courseId === videoId`
  heuristic.
- No abandoned tip: `continueItem = null`, row hidden.
- `totalSec === 0` guards already prevent a record from being mis-flagged (recordPosition
  only completes when `totalSec > 0`); the `watchedSec > 0` filter excludes untouched tips.

## Testing (`tests/`, vitest + fake-indexeddb)

`useStudyQueue` carries logic, so it needs coverage:

- Tip `!completed && watchedSec > 0` → surfaces; completed tip → excluded; untouched
  (`watchedSec === 0`) → excluded.
- Multiple abandoned tips → most recent `lastSeenAt` wins.
- Stored `resumeRoute`/`title` used for route/label; legacy record (no route/title) →
  heuristic route + generic label.
- `continueDone` (lastSeenAt today) folds into `incompleteCount`.

## Out of scope

- No own-lesson candidate (Shadowing row covers it).
- No new progress tracking (recordPosition already runs).
- No new routes (resume routes exist).
- No changes to the Shadowing row.

## Files touched

- `frontend/src/features/learning-materials/domain/tips.ts` — add optional
  `title`/`resumeRoute` to `TipProgress`.
- `frontend/src/features/learning-materials/application/useTipProgress.ts` — persist
  `title`/`resumeRoute` in `recordPosition`; preserve in `markComplete`/`markIncomplete`.
- `frontend/src/features/learning-materials/ui/TipCoursePage.tsx` — pass
  `{ title, route }` to `recordPosition`.
- `frontend/src/db/index.ts` — add `getAllTipProgress` accessor (read-only).
- `frontend/src/features/study/application/useStudyQueue.ts` — derivation, new field,
  count.
- `frontend/src/features/study/ui/queue/DailyQueuePopup.tsx` — new row.
- i18n locale files — `queue.continue` key.
- `frontend/tests/` — `useStudyQueue` continue-item tests.
