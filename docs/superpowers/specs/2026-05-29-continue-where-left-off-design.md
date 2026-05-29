# Continue Where Left Off — Smart Study Item

**Date:** 2026-05-29
**Status:** Approved design, pending implementation plan

## Goal

Add a "Continue where left off" item to the Smart Study queue. It resurfaces the
most recently *abandoned* learnable content — either a Collection/Discover grammar
tip video or one of the user's own YouTube lessons — and nudges the user to finish
it. One row, picking the single most relevant item.

## Definition of "abandoned" (incomplete)

An item is abandoned when it was started but is **less than 80% finished**. The 80%
threshold is shared across both sources, matching the existing tip completion rule.

- **Tip**: `!completed && watchedSec > 0`. `TipProgress.completed` already auto-flips
  at 80% watched (`WATCHED_THRESHOLD = 0.8` in `useTipProgress.ts`).
- **Lesson**: `progressSegmentId != null` and `segmentsDone / segmentCount < 0.8`,
  where `segmentsDone = parseInt(progressSegmentId, 10)` (same calc as
  `CurrentLessonHero.tsx:74-79`). Requires `segmentCount > 0`.

> **Decision (flagged at approval):** "Mirror the Shadowing pattern" means *same UI
> shape*, NOT same selection logic. The Shadowing row surfaces the most-recent lesson
> regardless of completion; copying that literally would (a) be nonsensical for a
> "continue" action on a finished video and (b) duplicate the Shadowing row for
> lessons. Incompleteness is therefore a hard filter — it is the point of the feature
> and what keeps the row distinct.

## Architecture

All selection logic lives in `useStudyQueue` (already async). It returns one new
field; the popup renders a row. No component-local derivation (tip scan needs async
db reads, and `incompleteCount` must see the item).

### New state field

```ts
interface ContinueItem {
  kind: 'lesson' | 'tip'
  title: string
  route: string        // ready-to-navigate
  lastTouchedAt: string // ISO; for done-check and merge
}

// added to StudyQueueState
continueItem: ContinueItem | null
```

### Selection logic (in `useStudyQueue.load`)

1. **Lesson candidate** — most recent `LessonMeta` by `lastOpenedAt`, status
   `complete` (or undefined), where `progressSegmentId != null`, `segmentCount > 0`,
   and `segmentsDone / segmentCount < 0.8`. Route: `/lesson/{id}`.
   Resume position is free — `LessonView` seeks to `progressSegmentId`
   (`LessonView.tsx:214-221`).
2. **Tip candidate** — scan all `TipProgress` via new `getAllTipProgress`, filter
   `!completed && watchedSec > 0`, rank by `lastSeenAt`. For the winner, call
   `getTipCourse(courseId)` to obtain `source`; if undefined (course evicted), skip
   the tip candidate. Route: `/tips/{source}/{courseId}?lesson={videoId}`. The tip
   player resumes at `watchedSec` automatically.
3. **Merge** — pick the candidate with the more recent timestamp (`lastOpenedAt` vs
   `lastSeenAt`, both ISO-comparable). `continueItem = null` if neither qualifies.

### New DB accessor (read-only, no DB_VERSION bump)

```ts
export async function getAllTipProgress(db: ShadowLearnDB): Promise<TipProgress[]> {
  return db.getAll('tip-progress')
}
```

The `tip-progress` store already exists; this is a pure read accessor, so it does not
require a schema migration.

## Rendering — DailyQueuePopup

New row inserted after the Shadowing row, identical in shape
(`DailyQueuePopup.tsx:183-207`):

- `CircleIndicator` + label (i18n `queue.continue`, e.g. "Continue: {title}") +
  `StartButton`.
- Click → `navigate(continueItem.route)` then `onClose()`.
- Hidden when `continueItem == null`.

**Done semantics** — mirror Shadowing: `continueDone = continueItem != null &&
continueItem.lastTouchedAt` is today (`todayISO()`). Resuming updates
`lastSeenAt`/`lastOpenedAt` to today, so the row strikes through once engaged today
(and drops out entirely on the next refresh once it crosses 80%).

## Count integration

Fold into the existing derivations (`useStudyQueue.ts:190-198`), matching the
`hasLesson && !shadowingDone` pattern:

```ts
const incompleteCount
  = (hasDailyReview && !dailyReviewDone ? 1 : 0)
  + (hasLesson && !shadowingDone ? 1 : 0)
  + (continueItem && !continueDone ? 1 : 0)
  + customTasks.filter(t => t.completedDate !== today).length
```

## Edge cases

- TipCourse evicted (`getTipCourse` → undefined): skip tip candidate, no crash.
- `segmentCount` missing or 0: skip lesson candidate (cannot compute %).
- Lesson candidate equals the Shadowing row's `mostRecentLesson`: allowed. Different
  action — resume position vs shadowing practice — both rows may coexist.
- Neither source qualifies: `continueItem = null`, row hidden.

## Testing (`tests/`, vitest + fake-indexeddb)

`useStudyQueue` carries logic, so it needs coverage:

- Lesson < 80% → surfaces; lesson ≥ 80% → excluded.
- Tip `!completed && watchedSec > 0` → surfaces; completed tip → excluded.
- Both present → more-recent timestamp wins.
- Evicted TipCourse (progress exists, course missing) → tip skipped, no throw.
- `continueDone` (touched today) folds into `incompleteCount`.

## Out of scope

- No new progress tracking (both sources already track progress).
- No new routes (both resume routes exist).
- No resume-position storage (handled by existing pages).
- No changes to the Shadowing row.

## Files touched

- `frontend/src/features/study/application/useStudyQueue.ts` — derivation, new field, count.
- `frontend/src/db/index.ts` — add `getAllTipProgress` accessor (read-only).
- `frontend/src/features/study/ui/queue/DailyQueuePopup.tsx` — new row.
- i18n locale files — `queue.continue` key.
- `frontend/tests/` — `useStudyQueue` continue-item tests.
