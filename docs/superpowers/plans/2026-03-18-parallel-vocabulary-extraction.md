# Parallel Vocabulary Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the sequential per-batch vocabulary extraction loop with fully parallel `asyncio.gather`-based execution, gated by a semaphore and backed by per-batch exponential backoff retry, raising on unrecoverable failure to guarantee all-or-nothing consistency.

**Architecture:** All 40 batch tasks (for 200 segments at batch size 5) are created simultaneously via `asyncio.create_task` and executed concurrently, with at most 20 in-flight at any time via a locally-scoped `asyncio.Semaphore`. Each batch retries on HTTP 429 up to 5 total attempts with exponential backoff + jitter. Any unrecoverable failure raises `VocabularyExtractionError`, which cancels and drains remaining tasks before propagating to the lesson pipeline.

**Tech Stack:** Python asyncio, httpx, pytest-asyncio, unittest.mock

---

## File Map

- **Modify:** `backend/app/services/vocabulary.py` — all changes live here
- **Create:** `backend/tests/test_vocabulary.py` — new test file (no existing vocab tests)

---

### Task 1: Add `VocabularyExtractionError` and update batch size

**Files:**
- Modify: `backend/app/services/vocabulary.py`

- [ ] **Step 1: Write the failing test**

In `backend/tests/test_vocabulary.py`, create the file with this initial test:

```python
import pytest
from app.services.vocabulary import VocabularyExtractionError, _VOCAB_BATCH_SIZE


def test_vocabulary_extraction_error_is_exception():
    err = VocabularyExtractionError("segments [1, 2] failed")
    assert isinstance(err, Exception)
    assert "segments [1, 2] failed" in str(err)


def test_vocab_batch_size_is_five():
    assert _VOCAB_BATCH_SIZE == 5
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && pytest tests/test_vocabulary.py -v
```

Expected: `ImportError` — `VocabularyExtractionError` does not exist yet.

- [ ] **Step 3: Add `VocabularyExtractionError` and update batch size in `vocabulary.py`**

At the top of `vocabulary.py`, after the `logger` line, add:

```python
class VocabularyExtractionError(Exception):
    """Raised when vocabulary extraction fails for one or more segment batches."""
```

Find `_VOCAB_BATCH_SIZE = 8` and change it to:
```python
_VOCAB_BATCH_SIZE = 5
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && pytest tests/test_vocabulary.py -v
```

Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/vocabulary.py backend/tests/test_vocabulary.py
git commit -m "feat(vocab): add VocabularyExtractionError, reduce batch size to 5"
```

---

### Task 2: Rewrite `_extract_batch` with semaphore + retry

**Files:**
- Modify: `backend/app/services/vocabulary.py`

The existing `_extract_batch` is a plain async function that does one HTTP call with no retry. We replace it with `_extract_batch_with_retry` that:
- Acquires the semaphore before calling OpenRouter
- Retries only on HTTP 429, up to 5 total attempts
- Uses `2 ** attempt + random.uniform(0, 1)` backoff (where `attempt` is 0-indexed)
- Does NOT sleep after the final (4th) attempt — raises immediately
- Uses `except Exception` in the retry loop so `CancelledError` propagates
- Raises `VocabularyExtractionError` for non-retryable errors and exhausted retries

- [ ] **Step 1: Write failing tests**

Add to `backend/tests/test_vocabulary.py`:

```python
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest


def _make_mock_response(status_code: int, content: str = "") -> MagicMock:
    mock = MagicMock()
    mock.status_code = status_code
    mock.text = content
    mock.json.return_value = {
        "choices": [{"message": {"content": content}}]
    }
    if status_code >= 400:
        mock.raise_for_status.side_effect = httpx.HTTPStatusError(
            message=f"HTTP {status_code}",
            request=MagicMock(),
            response=MagicMock(status_code=status_code),
        )
    else:
        mock.raise_for_status = MagicMock()
    return mock


def _valid_vocab_content(seg_ids: list[int]) -> str:
    import json
    return json.dumps({
        "segments": [
            {"id": i, "words": [{"word": "你好", "pinyin": "nǐ hǎo", "meaning": "hello", "usage": "你好世界"}]}
            for i in seg_ids
        ]
    })


@pytest.mark.asyncio
async def test_extract_batch_with_retry_success():
    """Happy path: single successful request returns parsed vocab."""
    from app.services.vocabulary import _extract_batch_with_retry

    segments = [{"id": 0, "text": "你好"}, {"id": 1, "text": "世界"}]
    semaphore = asyncio.Semaphore(1)
    content = _valid_vocab_content([0, 1])
    mock_response = _make_mock_response(200, content)

    with patch("app.services.vocabulary.httpx.AsyncClient") as mock_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_cls.return_value = mock_client

        result = await _extract_batch_with_retry(segments, "test_key", semaphore)

    assert result[0][0]["word"] == "你好"
    assert result[1][0]["word"] == "你好"


@pytest.mark.asyncio
async def test_extract_batch_with_retry_retries_on_429():
    """Should retry on 429, succeed on second attempt."""
    from app.services.vocabulary import _extract_batch_with_retry

    segments = [{"id": 0, "text": "你好"}]
    semaphore = asyncio.Semaphore(1)
    content = _valid_vocab_content([0])

    rate_limit_response = _make_mock_response(429)
    ok_response = _make_mock_response(200, content)

    with patch("app.services.vocabulary.httpx.AsyncClient") as mock_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.post = AsyncMock(side_effect=[rate_limit_response, ok_response])
        mock_cls.return_value = mock_client

        with patch("app.services.vocabulary.asyncio.sleep", new_callable=AsyncMock) as mock_sleep:
            result = await _extract_batch_with_retry(segments, "test_key", semaphore)

    mock_sleep.assert_called_once()
    assert result[0][0]["word"] == "你好"


@pytest.mark.asyncio
async def test_extract_batch_with_retry_raises_on_non_429():
    """Non-429 HTTP errors raise VocabularyExtractionError immediately (no retry)."""
    from app.services.vocabulary import _extract_batch_with_retry, VocabularyExtractionError

    segments = [{"id": 0, "text": "你好"}]
    semaphore = asyncio.Semaphore(1)

    with patch("app.services.vocabulary.httpx.AsyncClient") as mock_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.post = AsyncMock(return_value=_make_mock_response(500))
        mock_cls.return_value = mock_client

        with pytest.raises(VocabularyExtractionError):
            await _extract_batch_with_retry(segments, "test_key", semaphore)


@pytest.mark.asyncio
async def test_extract_batch_with_retry_raises_after_exhausted_retries():
    """Should raise VocabularyExtractionError after 5 total 429 failures."""
    from app.services.vocabulary import _extract_batch_with_retry, VocabularyExtractionError

    segments = [{"id": 0, "text": "你好"}]
    semaphore = asyncio.Semaphore(1)

    with patch("app.services.vocabulary.httpx.AsyncClient") as mock_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.post = AsyncMock(return_value=_make_mock_response(429))
        mock_cls.return_value = mock_client

        with patch("app.services.vocabulary.asyncio.sleep", new_callable=AsyncMock) as mock_sleep:
            with pytest.raises(VocabularyExtractionError):
                await _extract_batch_with_retry(segments, "test_key", semaphore)

    # 5 attempts = 4 sleeps (no sleep after final attempt)
    assert mock_sleep.call_count == 4


@pytest.mark.asyncio
async def test_extract_batch_with_retry_cancelled_error_propagates():
    """CancelledError must not be swallowed by the retry loop."""
    from app.services.vocabulary import _extract_batch_with_retry

    segments = [{"id": 0, "text": "你好"}]
    semaphore = asyncio.Semaphore(1)

    with patch("app.services.vocabulary.httpx.AsyncClient") as mock_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.post = AsyncMock(side_effect=asyncio.CancelledError())
        mock_cls.return_value = mock_client

        with pytest.raises(asyncio.CancelledError):
            await _extract_batch_with_retry(segments, "test_key", semaphore)
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && pytest tests/test_vocabulary.py -v -k "retry"
```

Expected: `ImportError` — `_extract_batch_with_retry` does not exist yet.

- [ ] **Step 3: Implement `_extract_batch_with_retry` in `vocabulary.py`**

Add `import asyncio` and `import random` to the imports at the top of the file. Use plain `import asyncio` (not `from asyncio import sleep`) — the tests patch `app.services.vocabulary.asyncio.sleep` which requires the module-level reference.

Replace the existing `_extract_batch` function (search for `async def _extract_batch`) with:

```python
_MAX_ATTEMPTS = 5


async def _extract_batch_with_retry(
    segments: list[dict],
    api_key: str,
    semaphore: asyncio.Semaphore,
) -> dict[int, list[dict]]:
    """Extract vocabulary for a batch of segments with semaphore gating and retry on 429."""
    seg_ids = [s["id"] for s in segments]
    prompt = _build_vocab_prompt(segments)
    response_format = {
        "type": "json_schema",
        "json_schema": {
            "name": "vocabulary_extraction",
            "strict": True,
            "schema": VocabularyResponse.model_json_schema(),
        },
    }

    async with semaphore:
        for attempt in range(_MAX_ATTEMPTS):
            try:
                async with httpx.AsyncClient(timeout=180.0) as client:
                    response = await client.post(
                        settings.openrouter_chat_url,
                        headers={
                            "Authorization": f"Bearer {api_key}",
                            "Content-Type": "application/json",
                        },
                        json={
                            "model": settings.openrouter_model,
                            "messages": [{"role": "user", "content": prompt}],
                            "response_format": response_format,
                            "temperature": 0.1,
                            "reasoning": {"effort": "none"},
                        },
                    )
                    if response.status_code == 429:
                        if attempt < _MAX_ATTEMPTS - 1:
                            wait = 2 ** attempt + random.uniform(0, 1)
                            logger.warning(
                                "Vocab batch %s: rate limited (429), retry %d/%d in %.1fs",
                                seg_ids, attempt + 1, _MAX_ATTEMPTS - 1, wait,
                            )
                            await asyncio.sleep(wait)
                            continue
                        raise VocabularyExtractionError(
                            f"Vocab batch {seg_ids}: exhausted {_MAX_ATTEMPTS} attempts on rate limit"
                        )
                    response.raise_for_status()

                content = response.json()["choices"][0]["message"]["content"]
                try:
                    parsed = VocabularyResponse.model_validate_json(content)
                    return {seg.id: [w.model_dump() for w in seg.words] for seg in parsed.segments}
                except Exception as e:
                    raise VocabularyExtractionError(
                        f"Vocab batch {seg_ids}: failed to parse response — {e}"
                    )

            except VocabularyExtractionError:
                raise
            except asyncio.CancelledError:
                raise
            except Exception as e:
                raise VocabularyExtractionError(
                    f"Vocab batch {seg_ids}: unexpected error — {e}"
                ) from e

    # Unreachable, but satisfies type checker
    raise VocabularyExtractionError(f"Vocab batch {seg_ids}: exhausted all attempts")
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && pytest tests/test_vocabulary.py -v -k "retry"
```

Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/vocabulary.py backend/tests/test_vocabulary.py
git commit -m "feat(vocab): add _extract_batch_with_retry with semaphore and exponential backoff"
```

---

### Task 3: Rewrite `extract_vocabulary` to use parallel gather

**Files:**
- Modify: `backend/app/services/vocabulary.py`

Replace the sequential `for` loop in `extract_vocabulary` with `asyncio.gather` across all batch tasks. On any failure, cancel and drain remaining tasks before re-raising.

- [ ] **Step 1: Write failing tests**

Add to `backend/tests/test_vocabulary.py`:

```python
@pytest.mark.asyncio
async def test_extract_vocabulary_returns_all_segments():
    """All 6 segments across 2 batches (batch size 5) are returned in a single call."""
    from app.services.vocabulary import extract_vocabulary

    segments = [{"id": i, "text": f"句子{i}"} for i in range(6)]

    def make_batch_content(ids):
        import json
        return json.dumps({
            "segments": [
                {"id": i, "words": [{"word": "词", "pinyin": "cí", "meaning": "word", "usage": "一个词"}]}
                for i in ids
            ]
        })

    # batch 0: segments 0-4, batch 1: segment 5
    responses = [
        _make_mock_response(200, make_batch_content(list(range(5)))),
        _make_mock_response(200, make_batch_content([5])),
    ]

    with patch("app.services.vocabulary.httpx.AsyncClient") as mock_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.post = AsyncMock(side_effect=responses)
        mock_cls.return_value = mock_client

        result = await extract_vocabulary(segments, "test_key")

    assert set(result.keys()) == set(range(6))


@pytest.mark.asyncio
async def test_extract_vocabulary_raises_on_batch_failure():
    """If any batch fails after retries, extract_vocabulary raises VocabularyExtractionError."""
    from app.services.vocabulary import extract_vocabulary, VocabularyExtractionError

    segments = [{"id": i, "text": f"句子{i}"} for i in range(6)]

    with patch("app.services.vocabulary.httpx.AsyncClient") as mock_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        # All calls return 500 → immediate failure
        mock_client.post = AsyncMock(return_value=_make_mock_response(500))
        mock_cls.return_value = mock_client

        with pytest.raises(VocabularyExtractionError):
            await extract_vocabulary(segments, "test_key")


@pytest.mark.asyncio
async def test_extract_vocabulary_empty_segments():
    """Empty segment list returns empty dict without making any requests."""
    from app.services.vocabulary import extract_vocabulary

    result = await extract_vocabulary([], "test_key")
    assert result == {}


@pytest.mark.asyncio
async def test_extract_vocabulary_result_order_matches_input():
    """Result keys cover all segment IDs regardless of which batch finishes first."""
    from app.services.vocabulary import extract_vocabulary

    segments = [{"id": i, "text": f"句子{i}"} for i in range(10)]

    def make_content(ids):
        import json
        return json.dumps({
            "segments": [
                {"id": i, "words": [{"word": str(i), "pinyin": "pīn", "meaning": "m", "usage": "u"}]}
                for i in ids
            ]
        })

    # Two batches of 5
    responses = [
        _make_mock_response(200, make_content(list(range(5)))),
        _make_mock_response(200, make_content(list(range(5, 10)))),
    ]

    with patch("app.services.vocabulary.httpx.AsyncClient") as mock_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.post = AsyncMock(side_effect=responses)
        mock_cls.return_value = mock_client

        result = await extract_vocabulary(segments, "test_key")

    assert set(result.keys()) == set(range(10))
    for i in range(10):
        assert result[i][0]["word"] == str(i)
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && pytest tests/test_vocabulary.py -v -k "extract_vocabulary"
```

Expected: failures because `extract_vocabulary` still uses the old sequential loop and `_extract_batch`.

- [ ] **Step 3: Rewrite `extract_vocabulary` in `vocabulary.py`**

Replace the existing `extract_vocabulary` function (search for `async def extract_vocabulary`) with:

```python
async def extract_vocabulary(
    segments: list[dict],
    api_key: str,
) -> dict[int, list[dict]]:
    """Extract vocabulary for all segments in parallel batches.

    Fires all batch tasks concurrently (max 20 in-flight via semaphore).
    Raises VocabularyExtractionError if any batch fails after retries —
    guaranteeing all-or-nothing consistency.
    """
    if not segments:
        return {}

    semaphore = asyncio.Semaphore(20)
    batches = [
        segments[i : i + _VOCAB_BATCH_SIZE]
        for i in range(0, len(segments), _VOCAB_BATCH_SIZE)
    ]
    tasks = [
        asyncio.create_task(_extract_batch_with_retry(batch, api_key, semaphore))
        for batch in batches
    ]
    logger.info("Vocabulary: dispatching %d parallel batches for %d segments", len(tasks), len(segments))

    try:
        results: list[dict[int, list[dict]]] = await asyncio.gather(*tasks)
    except VocabularyExtractionError:
        for t in tasks:
            t.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        raise
    except Exception as e:
        for t in tasks:
            t.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        raise VocabularyExtractionError(f"Vocabulary extraction failed: {e}") from e

    merged: dict[int, list[dict]] = {}
    for batch_result in results:
        merged.update(batch_result)

    logger.info("Vocabulary: complete — %d segments with words", len(merged))
    return merged
```

- [ ] **Step 4: Run all vocabulary tests**

```bash
cd backend && pytest tests/test_vocabulary.py -v
```

Expected: all tests pass.

- [ ] **Step 5: Run the full backend test suite to check for regressions**

```bash
cd backend && pytest -v
```

Expected: all tests pass. If `test_lessons_router.py` has any vocabulary-related assertions, verify they still hold.

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/vocabulary.py backend/tests/test_vocabulary.py
git commit -m "feat(vocab): parallel extraction with asyncio.gather, semaphore, and fail-fast error handling"
```

---

### Task 4: Clean up dead code

**Files:**
- Modify: `backend/app/services/vocabulary.py`

The old `_extract_batch` function and its `json` fallback parsing are no longer used. Remove them.

- [ ] **Step 1: Delete the old `_extract_batch` function**

Remove the entire `_extract_batch` function (the old one that returns `{}` on parse failure silently). Also remove `import json` from the top of the file — the new code uses Pydantic validation only. This step depends on Task 3 being complete first (the old function must be gone before removing the import).

- [ ] **Step 2: Run tests to confirm nothing broke**

```bash
cd backend && pytest tests/test_vocabulary.py -v
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add backend/app/services/vocabulary.py
git commit -m "chore(vocab): remove dead _extract_batch and json fallback parsing"
```
