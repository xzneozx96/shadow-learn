# Background Lesson Processing — Design Spec

**Date:** 2026-03-15
**Status:** Approved

---

## Problem

Lesson creation takes several minutes (audio extraction, transcription, translation, vocabulary). Currently the user is locked on the processing screen for the entire duration. They cannot navigate to other parts of the app, and they cannot queue a second lesson while one is in flight.

---

## Goal

- User starts lesson creation and can immediately navigate elsewhere
- Multiple lessons can be queued and processed concurrently
- Each in-progress lesson shows a status badge in the library
- Errors surface on the lesson card with a retry action

---

## Architecture

The current SSE streaming model (one long HTTP connection drives the whole pipeline) is replaced with a two-phase job model:

**Phase 1 — Start job:**
Frontend POSTs to create a lesson → backend creates a job entry in an in-memory dict, fires the pipeline as a `BackgroundTask`, returns `{ job_id }` immediately → frontend saves a stub lesson (no segments yet) to IndexedDB with `status: "processing"`, saves the audio file/blob to IndexedDB immediately (see Upload Audio), and navigates to the library.

**Phase 2 — Poll + complete:**
A global `useJobPoller` hook (mounted once inside `LessonsProvider`) wakes every 3 seconds, reads the current lessons from context, finds all with `status: "processing"`, and calls `GET /api/jobs/{job_id}` for each. When a job completes the frontend fetches the full lesson data, writes segments to IndexedDB, and dispatches an update through context so `Library` re-renders with `status: "complete"`. Lesson cards react to context state automatically.

---

## State Architecture

### `LessonsContext` (new)

A new context that owns the canonical list of `LessonMeta[]` in memory, backed by IndexedDB as the persistent store. Both `Library` and `useJobPoller` read from and write to this context.

```typescript
interface LessonsContextValue {
  lessons: LessonMeta[]
  db: IDBDatabase                        // IndexedDB handle, for saveSegments calls
  refreshLessons: () => Promise<void>    // reload all metas from IndexedDB
  updateLesson: (meta: LessonMeta) => Promise<void>  // write to IndexedDB + update state in memory
}
```

`LessonsProvider` mounts above the router in `App.tsx` (alongside `AuthProvider`). On mount it opens the IndexedDB connection and loads all lesson metas into state. `Library` reads from context instead of loading independently. Both `updateLesson` and any other functions exposed by the context must be wrapped in `useCallback` inside `LessonsProvider` so their references are stable and do not cause unnecessary re-renders or interval restarts in consumers.

---

## Backend Changes

### In-memory job store — `backend/app/jobs.py`

```python
import time
from dataclasses import dataclass, field
from typing import Any

@dataclass
class Job:
    status: str          # "processing" | "complete" | "error"
    step: str            # current pipeline step name
    result: Any          # full LessonResponse dict when complete
    error: str | None    # error message if failed
    created_at: float = field(default_factory=time.time)

jobs: dict[str, Job] = {}
```

Module-level dict, lives for the lifetime of the FastAPI process. Server restart loses in-progress tracking; the frontend handles this as an error (404 → mark lesson `status: "error"`).

### Refactored lesson endpoints

Both `POST /api/lessons/generate` and `POST /api/lessons/generate-upload`:

1. Validate input (unchanged)
2. Generate `job_id = str(uuid.uuid4())`
3. Register `jobs[job_id] = Job(status="processing", step="audio_extraction", result=None, error=None)`
4. Add `BackgroundTask` that runs the full pipeline, updating `jobs[job_id].step` as it progresses
5. Return `{ "job_id": job_id }` — HTTP 200, connection closed immediately

> **Breaking change note:** These endpoints previously returned a `StreamingResponse`. Frontend and backend must be updated atomically — do not deploy backend changes without the corresponding frontend changes.

The `_shared_pipeline` function is refactored from an async generator (SSE) to a regular async function that updates the job dict directly instead of yielding events.

### New polling endpoint

```
GET /api/jobs/{job_id}
→ 200: { "status": "processing"|"complete"|"error", "step": str, "result": {...}|null, "error": str|null }
→ 404: job not found (server restarted or already cleaned up)
```

TTL pruning: on every poll request, entries with `created_at` older than 1 hour are deleted from `jobs`.

### Job cleanup endpoint

```
DELETE /api/jobs/{job_id}
→ 204: deleted (or already gone — idempotent)
```

Frontend calls this after successfully reading a `complete` or `error` result. **Do not call DELETE on a 404 response** — there is nothing to delete and the 404 itself signals cleanup already occurred.

---

## Frontend Changes

### `LessonMeta` type additions (`types.ts`)

```typescript
interface LessonMeta {
  // ... existing fields unchanged ...
  status: 'processing' | 'complete' | 'error'
  jobId?: string          // which backend job to poll; cleared when complete
  errorMessage?: string   // set when status === 'error'
  currentStep?: string    // latest step name from polling, for badge display
  // duration and segmentCount become optional to support stub lessons:
  duration?: number
  segmentCount?: number
}
```

**Backwards compatibility:** Existing lessons in IndexedDB have no `status` field. Any lesson where `status` is missing or undefined is treated as `'complete'`. `duration` and `segmentCount` being optional is backwards-compatible — existing lessons have them populated.

**Lesson card guard:** When `status === 'processing'`, the card must not render the progress bar or duration display (both require `segmentCount` / `duration` to be set). The card link (`/lesson/:id`) is disabled while `status === 'processing'` — the lesson has no segments to display yet.

### Upload audio — save before navigating

For upload-sourced lessons, the frontend saves the audio `File`/`Blob` to IndexedDB (via `saveVideo`) **immediately after the POST returns**, before navigating away. This ensures the audio is persisted even though the component will unmount. The `complete` response from the poller then only needs to save metadata and segments — it does not need to re-save the video.

For YouTube-sourced lessons, the audio URL is included in the `complete` result (as today) and downloaded at completion time.

### `CreateLesson.tsx` new flow

1. User submits form
2. POST to `/api/lessons/generate` or `/api/lessons/generate-upload` → receives `{ job_id }`
3. Generate `lessonId = crypto.randomUUID()` (safe for concurrent submissions)
4. For upload-sourced lessons: save audio blob to IndexedDB via `saveVideo` immediately
5. Save stub `LessonMeta` to IndexedDB: `{ id: lessonId, status: "processing", jobId: job_id, title: <derived (see below)>, duration: undefined, segmentCount: undefined, ...other fields from form }`
   - **Title derivation:** YouTube → `"YouTube Video (${videoId})"` extracted from the URL (same as current SSE flow); Upload → the original filename without extension
6. Dispatch `updateLesson` via `LessonsContext` so Library reflects the new stub immediately
7. Show inline confirmation: "Lesson queued — track progress in the library" + "Go to Library" button
8. Form resets so another lesson can be queued immediately
9. `ProcessingStatus` component is no longer used in this flow

### `useJobPoller` hook (`hooks/useJobPoller.ts`)

Mounted once inside `LessonsProvider`. Reads `lessons` and `updateLesson` from context.

```typescript
const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
// Stable ref so pollJobs callback can read latest lessons without being a dep
const lessonsRef = useRef(lessons)
useEffect(() => { lessonsRef.current = lessons }, [lessons])

// Primitive dependency: restart interval only when the set of active job IDs changes
const processingJobIds = lessons
  .filter(l => l.status === 'processing')
  .map(l => l.jobId)
  .join(',')

const pollJobs = useCallback(async () => {
  const processing = lessonsRef.current.filter(l => l.status === 'processing')
  for (const lesson of processing) {
    if (!lesson.jobId) continue
    const res = await fetch(`/api/jobs/${lesson.jobId}`)
    if (res.status === 404) {
      // Server restarted — no DELETE, job is already gone
      await updateLesson({ ...lesson, status: 'error', errorMessage: 'Server restarted', jobId: undefined })
      continue
    }
    const job = await res.json()
    if (job.status === 'processing') {
      await updateLesson({ ...lesson, currentStep: job.step })
    } else if (job.status === 'complete') {
      // job.result shape: { title, source, source_url, duration, segments, translation_languages, audio_url? }
      // lesson.jobId is read from the pre-update snapshot here — this is intentional;
      // updateLesson below sets jobId: undefined but that update hasn't happened yet.
      const jobId = lesson.jobId
      await saveSegments(db, lesson.id, job.result.segments)
      // For YouTube lessons: download the audio and save to IndexedDB
      if (lesson.source === 'youtube' && job.result.audio_url) {
        const audioBlob = await fetch(job.result.audio_url).then(r => r.blob())
        await saveVideo(db, lesson.id, audioBlob)
      }
      // For upload lessons: audio was already saved before navigation — no action needed
      await updateLesson({
        ...lesson,
        status: 'complete',
        jobId: undefined,
        duration: job.result.duration,
        segmentCount: job.result.segments.length,
      })
      await fetch(`/api/jobs/${jobId}`, { method: 'DELETE' })
    } else if (job.status === 'error') {
      const jobId = lesson.jobId  // capture before updateLesson clears it
      await updateLesson({ ...lesson, status: 'error', errorMessage: job.error, jobId: undefined })
      await fetch(`/api/jobs/${jobId}`, { method: 'DELETE' })
    }
  }
}, [updateLesson, db])
// updateLesson and db come from LessonsContext — both must be stable references
// (updateLesson wrapped in useCallback inside LessonsProvider)

useEffect(() => {
  if (!processingJobIds) return
  intervalRef.current = setInterval(pollJobs, 3000)
  return () => clearInterval(intervalRef.current!)
}, [processingJobIds, pollJobs])
```

(`pollJobs` is stable via `useCallback` with `useRef`-based lesson access, so it is safe in the dependency array.)

### `LessonCard.tsx` badge

Badge is derived directly from `lesson.status` during render (no extra state/effect):

- `status: 'processing'` → animated spinner + `lesson.currentStep` label (e.g. "Transcribing…") + card link disabled
- `status: 'error'` → red "Failed" badge + Retry button
- `status: 'complete'` or missing → no badge (existing behaviour)
- Hide progress bar and duration when `status === 'processing'` (values not yet known)

Processing lessons are sorted to the top of the library list.

### Retry flow

The Retry button on a failed card re-POSTs the original request parameters. `LessonMeta` already stores `sourceUrl` and `translationLanguages`. For upload-sourced lessons the audio blob is already in IndexedDB — retry only needs to re-run the pipeline with the saved audio (the backend endpoint can accept a reference to an already-extracted audio file, or the frontend re-uploads from the saved blob). If the audio blob was not saved (edge case: failure before save completed), the card shows "Re-upload to retry" instead.

---

## Data Flow Diagram

```
User submits form
       │
       ▼
POST /api/lessons/generate → { job_id }
       │
       ├── [upload] saveVideo to IndexedDB immediately
       │
       ▼
Save stub LessonMeta (status: "processing") → LessonsContext + IndexedDB
       │
       ▼
Navigate to library — stub card appears with spinner badge, link disabled
       │
       ▼
useJobPoller (every 3s): GET /api/jobs/{job_id}
       │
       ├── processing → update currentStep on card
       ├── complete   → write segments + update meta (status: "complete", duration, segmentCount)
       │               DELETE job
       │               [YouTube] download + save audio blob
       └── error/404  → status: "error", errorMessage, no DELETE on 404
```

---

## What Is Not Changed

- Audio serving via `/api/lessons/audio/{filename}` — unchanged
- IndexedDB schema for segments — unchanged
- Lesson view, transcript panel, video panel — unchanged
- Settings, onboarding — unchanged
- The `ProcessingStatus` component — can be deleted or left unused

---

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Server restart mid-job | Frontend detects 404 on poll, marks lesson as error with clear message; no spurious DELETE call |
| Multiple concurrent jobs saturating API keys | No artificial limit; user's responsibility. Future work: configurable concurrency cap |
| Upload audio not available for retry | Retry uses saved IndexedDB blob; if missing, shows "Re-upload to retry" |
| Memory leak if frontend never calls DELETE | Automatic 1-hour TTL pruning (via `created_at`) on every poll request |
| Concurrent lessonId collision | `crypto.randomUUID()` eliminates collision risk |
| Navigating to processing lesson | Card link disabled while `status === 'processing'` |
