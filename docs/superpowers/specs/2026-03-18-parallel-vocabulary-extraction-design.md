# Parallel Vocabulary Extraction with Rate Limit Handling

**Date:** 2026-03-18
**Status:** Approved
**Scope:** `backend/app/services/vocabulary.py` only

## Problem

The current vocabulary extraction is sequential: segments are batched in groups of 8 and sent to OpenRouter one batch at a time. For 200 segments this means 25 sequential requests, each waiting for the previous to complete. This is unnecessarily slow when all batches are independent.

## Goal

Fire all batches concurrently while respecting OpenRouter rate limits. If any batch fails after exhausting retries, raise an error and cancel the entire pipeline — no partial vocabulary results are acceptable.

## Design

### Batching & Concurrency

- **Batch size:** 5 segments per request (down from 8)
- **Max concurrency:** `asyncio.Semaphore(20)` created inside `extract_vocabulary` (not at module level — asyncio primitives must be created within a running event loop)
- For 200 segments → 40 batch tasks created; at most 20 execute concurrently at any time
- `asyncio.gather(*tasks)` preserves input order — segment-to-result mapping is deterministic
- `extract_vocabulary` is an `async def` coroutine, so `asyncio.create_task` and semaphore creation are always called within a running event loop

### Retry Logic

Each batch is wrapped in a retry loop inside `_extract_batch_with_retry`:

- **Total attempts:** 5 (initial attempt + 4 retries)
- **Retryable:** HTTP 429 only; all other `httpx.HTTPStatusError`, network errors, and timeouts raise `VocabularyExtractionError` immediately
- **Backoff:** `2 ** attempt + random.uniform(0, 1)` seconds, where `attempt` is the 0-indexed number of the attempt that just failed
  - After attempt 0 fails → wait ~1s (`2^0 = 1`)
  - After attempt 1 fails → wait ~2s (`2^1 = 2`)
  - After attempt 2 fails → wait ~4s (`2^2 = 4`)
  - After attempt 3 fails → wait ~8s (`2^3 = 8`)
  - After attempt 4 fails → raises `VocabularyExtractionError`
- **`CancelledError` must not be caught** — the retry loop must use `except Exception` (not `except BaseException`) so that `asyncio.CancelledError` propagates correctly when a task is cancelled
- **Do not sleep after the final attempt** — `asyncio.sleep` is only called when there is a next attempt to make (i.e. when `attempt < max_attempts - 1`); sleeping after the last failure adds unnecessary delay before raising

### Error Handling & Pipeline Cancellation

- `extract_vocabulary` creates all tasks via `asyncio.create_task`, then calls `asyncio.gather(*tasks)`
- When any batch raises, `gather` re-raises to the caller; the `except` block then calls `t.cancel()` on all tasks, followed by `await asyncio.gather(*tasks, return_exceptions=True)` to drain them cleanly and avoid dangling OpenRouter requests
- All non-retryable failures (non-429 HTTP errors, network errors, parse failures, exhausted retries) raise `VocabularyExtractionError` with the failed segment IDs included in the message
- The exception bubbles up through `lessons.py`'s `asyncio.gather` (vocabulary + translation run concurrently), causing the pipeline background task to mark the job as `failed`
- No change to `lessons.py` is required. Any `VocabularyExtractionError` raised by `extract_vocabulary` propagates through `_shared_pipeline`'s `asyncio.gather` and is caught by the outer `except Exception` handlers in `_process_youtube_lesson` and `_process_upload_lesson`, which set job status to `"error"`

### Consistency Guarantee

Either all segments have vocabulary, or none do. Partial vocabulary is not possible under this design because any failure raises before results are assembled and saved.

## Implementation Scope

All changes are confined to `backend/app/services/vocabulary.py`:

1. Add `VocabularyExtractionError(Exception)` class
2. Change `_VOCAB_BATCH_SIZE` from `8` → `5`
3. Rewrite `_extract_batch` into `_extract_batch_with_retry(segments, api_key, semaphore)`:
   - Acquires semaphore via `async with semaphore`
   - Calls OpenRouter; on HTTP 429 waits with exponential backoff and retries
   - On non-429 HTTP error, network error, or parse failure: raises `VocabularyExtractionError` immediately
   - On exhausted attempts: raises `VocabularyExtractionError`
   - Retry loop uses `except Exception` to ensure `CancelledError` is not swallowed
4. Rewrite `extract_vocabulary` to:
   - Create `semaphore = asyncio.Semaphore(20)` locally
   - Build all batch tasks with `asyncio.create_task`
   - Call `asyncio.gather(*tasks)` in a `try/except`; on exception cancel all tasks and drain with `await asyncio.gather(*tasks, return_exceptions=True)`, then re-raise
   - Merge ordered results into the final `dict[int, list[dict]]`

`lessons.py` likely requires no changes, but the implementer must verify the existing job error-handling path catches `VocabularyExtractionError` correctly.

## Trade-offs Considered

| Approach | Decision |
|---|---|
| Token bucket rate limiter | Rejected — proactively slow, unnecessary for pay-as-you-go keys |
| Adaptive concurrency (AIMD) | Rejected — too complex for marginal benefit |
| Partial results on failure | Rejected — consistency is priority; user retries instead |
| 1 segment per request | Rejected — 5 per request reduces total requests while keeping high parallelism |
| `asyncio.TaskGroup` (Python 3.11+) | Rejected — project may support Python 3.10; manual cancellation is equivalent |
