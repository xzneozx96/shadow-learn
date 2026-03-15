# Background Lesson Processing — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace SSE-streaming lesson creation with a background-job model so users can navigate freely while lessons process and queue multiple lessons concurrently.

**Architecture:** Frontend POSTs to start a lesson and receives a `job_id` immediately; backend runs the pipeline as a `BackgroundTask` updating an in-memory `jobs` dict. A global `useJobPoller` hook (mounted in `LessonsProvider`) polls `/api/jobs/{job_id}` every 3 seconds and writes to IndexedDB + context on completion.

**Tech Stack:** FastAPI BackgroundTasks, Python dataclass in-memory store, React context + hooks, IndexedDB (idb), Vitest + @testing-library/react, pytest-asyncio + httpx

---

## Chunk 1: Backend — Job Store + Polling Router

**Files:**
- Create: `backend/app/jobs.py`
- Create: `backend/app/routers/jobs.py`
- Modify: `backend/app/main.py`
- Create: `backend/tests/test_jobs_router.py`

---

- [ ] **Step 1.1: Write failing tests for the job endpoints**

Create `backend/tests/test_jobs_router.py`:

```python
import time

import pytest
from httpx import ASGITransport, AsyncClient

import app.jobs as jobs_module
from app.main import app


@pytest.fixture(autouse=True)
def clear_jobs():
    jobs_module.jobs.clear()
    yield
    jobs_module.jobs.clear()


@pytest.mark.asyncio
async def test_get_job_not_found():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/jobs/nonexistent")
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_get_job_processing():
    from app.jobs import Job

    jobs_module.jobs["abc"] = Job(
        status="processing", step="transcription", result=None, error=None
    )
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/jobs/abc")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "processing"
    assert data["step"] == "transcription"
    assert data["result"] is None
    assert data["error"] is None


@pytest.mark.asyncio
async def test_get_job_complete():
    from app.jobs import Job

    result = {"lesson": {"title": "Test", "segments": [], "duration": 60.0}}
    jobs_module.jobs["xyz"] = Job(
        status="complete", step="assembling", result=result, error=None
    )
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/jobs/xyz")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "complete"
    assert data["result"]["lesson"]["title"] == "Test"


@pytest.mark.asyncio
async def test_get_job_error():
    from app.jobs import Job

    jobs_module.jobs["err"] = Job(
        status="error", step="transcription", result=None, error="API timeout"
    )
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/jobs/err")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "error"
    assert data["error"] == "API timeout"


@pytest.mark.asyncio
async def test_delete_job():
    from app.jobs import Job

    jobs_module.jobs["del"] = Job(
        status="processing", step="transcription", result=None, error=None
    )
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.delete("/api/jobs/del")
    assert response.status_code == 204
    assert "del" not in jobs_module.jobs


@pytest.mark.asyncio
async def test_delete_job_idempotent():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.delete("/api/jobs/nonexistent")
    assert response.status_code == 204


@pytest.mark.asyncio
async def test_get_job_prunes_expired():
    from app.jobs import Job

    jobs_module.jobs["old"] = Job(
        status="processing",
        step="transcription",
        result=None,
        error=None,
        created_at=time.time() - 7200,  # 2 hours ago
    )
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/jobs/other")
    assert response.status_code == 404
    assert "old" not in jobs_module.jobs
```

- [ ] **Step 1.2: Run tests to verify they fail**

```bash
cd backend && python -m pytest tests/test_jobs_router.py -v
```

Expected: all tests FAIL with `ModuleNotFoundError: No module named 'app.jobs'`

- [ ] **Step 1.3: Create `backend/app/jobs.py`**

```python
"""In-memory job store for background lesson processing."""

import time
from dataclasses import dataclass, field
from typing import Any


@dataclass
class Job:
    status: str          # "processing" | "complete" | "error"
    step: str            # current pipeline step name
    result: Any          # full result dict when complete; None otherwise
    error: str | None    # error message if failed; None otherwise
    created_at: float = field(default_factory=time.time)


jobs: dict[str, Job] = {}


def prune_expired_jobs(max_age_seconds: float = 3600.0) -> None:
    """Remove jobs older than max_age_seconds. Called on every poll request."""
    now = time.time()
    expired = [jid for jid, job in jobs.items() if now - job.created_at > max_age_seconds]
    for jid in expired:
        del jobs[jid]
```

- [ ] **Step 1.4: Create `backend/app/routers/jobs.py`**

```python
"""Job status polling and cleanup endpoints."""

from fastapi import APIRouter
from fastapi.responses import JSONResponse, Response

from app.jobs import jobs, prune_expired_jobs

router = APIRouter(prefix="/api/jobs")


@router.get("/{job_id}")
async def get_job(job_id: str):
    """Return current job status. Prunes expired jobs on every call."""
    prune_expired_jobs()
    job = jobs.get(job_id)
    if job is None:
        return JSONResponse(status_code=404, content={"detail": "Job not found"})
    return {
        "status": job.status,
        "step": job.step,
        "result": job.result,
        "error": job.error,
    }


@router.delete("/{job_id}", status_code=204)
async def delete_job(job_id: str):
    """Remove a job from the store. Idempotent — no error if already gone."""
    jobs.pop(job_id, None)
    return Response(status_code=204)
```

- [ ] **Step 1.5: Register jobs router in `backend/app/main.py`**

```python
from app.routers import chat, jobs, lessons, tts

# add alongside existing routers:
app.include_router(jobs.router)
```

- [ ] **Step 1.6: Run tests to verify they pass**

```bash
cd backend && python -m pytest tests/test_jobs_router.py -v
```

Expected: all 7 tests PASS

- [ ] **Step 1.7: Run full backend test suite**

```bash
cd backend && python -m pytest -v
```

Expected: all existing tests still PASS, new tests PASS

- [ ] **Step 1.8: Commit**

```bash
git add backend/app/jobs.py backend/app/routers/jobs.py backend/app/main.py backend/tests/test_jobs_router.py
git commit -m "feat: add in-memory job store and polling endpoints"
```

---

## Chunk 2: Backend — Refactor Pipeline to Background Tasks

**Files:**
- Modify: `backend/app/routers/lessons.py`
- Modify: `backend/tests/test_lessons_router.py`

---

- [ ] **Step 2.1: Update `test_lessons_router.py` to expect `{ job_id }` response**

Replace the full content of `backend/tests/test_lessons_router.py`:

```python
import io

import pytest
from httpx import ASGITransport, AsyncClient

import app.jobs as jobs_module
from app.main import app


@pytest.fixture(autouse=True)
def clear_jobs():
    jobs_module.jobs.clear()
    yield
    jobs_module.jobs.clear()


@pytest.mark.asyncio
async def test_generate_lesson_rejects_missing_url():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/lessons/generate",
            json={
                "source": "youtube",
                "youtube_url": None,
                "translation_languages": ["en"],
                "openai_api_key": "key",
                "model": "gpt-4o-mini",
            },
        )
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_generate_lesson_rejects_invalid_source():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/lessons/generate",
            json={
                "source": "invalid",
                "translation_languages": ["en"],
                "openai_api_key": "key",
                "model": "gpt-4o-mini",
            },
        )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_generate_lesson_accepts_deepgram_key_in_body():
    from app.models import LessonRequest

    req = LessonRequest(
        source="youtube",
        youtube_url="https://www.youtube.com/watch?v=test",
        translation_languages=["en"],
        openai_api_key="sk-test",
        deepgram_api_key="dg-test",
    )
    assert req.deepgram_api_key == "dg-test"


@pytest.mark.asyncio
async def test_generate_lesson_youtube_returns_job_id():
    """Valid YouTube request returns a job_id immediately; pipeline runs in background."""
    from unittest.mock import AsyncMock, patch

    with (
        patch("app.routers.lessons.validate_youtube_url", return_value="abc123"),
        patch("app.routers.lessons._process_youtube_lesson", new=AsyncMock()),
    ):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/lessons/generate",
                json={
                    "source": "youtube",
                    "youtube_url": "https://www.youtube.com/watch?v=abc123",
                    "translation_languages": ["en"],
                    "openai_api_key": "sk-test",
                    "deepgram_api_key": "dg-test",
                    "model": "gpt-4o-mini",
                },
            )
    assert response.status_code == 200
    data = response.json()
    assert "job_id" in data
    assert isinstance(data["job_id"], str)
    assert len(data["job_id"]) > 0


@pytest.mark.asyncio
async def test_generate_lesson_upload_returns_job_id():
    """Valid upload request returns a job_id immediately."""
    from unittest.mock import AsyncMock, patch

    with patch("app.routers.lessons._process_upload_lesson", new=AsyncMock()):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/lessons/generate-upload",
                files={"file": ("test.mp4", io.BytesIO(b"fake"), "video/mp4")},
                data={
                    "translation_languages": "en",
                    "openai_api_key": "sk-test",
                    "deepgram_api_key": "dg-test",
                    "model": "gpt-4o-mini",
                },
            )
    assert response.status_code == 200
    data = response.json()
    assert "job_id" in data
```

- [ ] **Step 2.2: Run updated tests to verify they fail**

```bash
cd backend && python -m pytest tests/test_lessons_router.py -v
```

Expected: `test_generate_lesson_youtube_returns_job_id` and `test_generate_lesson_upload_returns_job_id` FAIL (endpoints still return `StreamingResponse`)

- [ ] **Step 2.3: Replace `backend/app/routers/lessons.py`**

```python
"""Lesson generation router — background job model."""

import asyncio
import logging
import time
import uuid
from pathlib import Path

logger = logging.getLogger(__name__)

from fastapi import APIRouter, BackgroundTasks, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse

from app.config import settings
from app.jobs import Job, jobs
from app.models import LessonRequest
from app.services.audio import (
    extract_audio_from_upload,
    extract_audio_from_youtube,
    get_youtube_duration,
    probe_upload_duration,
)
from app.services.pinyin import generate_pinyin
from app.services.transcription import transcribe_audio_deepgram
from app.services.translation import translate_segments
from app.services.validation import ValidationError, validate_upload_file, validate_youtube_url
from app.services.vocabulary import extract_vocabulary

router = APIRouter(prefix="/api/lessons")

_TEMP_DIR = Path("/tmp/shadowlearn")
_CHUNK_SIZE = 1024 * 1024  # 1 MB


async def _shared_pipeline(
    job_id: str,
    segments: list[dict],
    translation_languages: list[str],
    api_key: str,
    model: str,
    title: str,
    source: str,
    source_url: str | None,
    duration: float,
    audio_filename: str | None = None,
) -> None:
    """Background pipeline: pinyin → translate + vocab → assemble → mark job complete."""
    t_pipeline = time.monotonic()
    logger.info("[pipeline] shared_pipeline: start segments=%d source=%s", len(segments), source)

    jobs[job_id].step = "pinyin"
    t0 = time.monotonic()
    enriched_segments = []
    for seg in segments:
        seg_pinyin = generate_pinyin(seg["text"])
        enriched_segments.append({**seg, "pinyin": seg_pinyin})
    logger.info("[pipeline] pinyin: done in %.1fs", time.monotonic() - t0)

    jobs[job_id].step = "translation"
    t0 = time.monotonic()
    translated_segments, vocab_map = await asyncio.gather(
        translate_segments(enriched_segments, translation_languages, api_key, model),
        extract_vocabulary(enriched_segments, api_key, model),
    )
    logger.info(
        "[pipeline] translation+vocabulary: done in %.1fs, %d segments, %d vocab entries",
        time.monotonic() - t0,
        len(translated_segments),
        len(vocab_map),
    )

    jobs[job_id].step = "assembling"

    lesson_segments = []
    for seg in translated_segments:
        lesson_segments.append({
            "id": str(seg["id"]),
            "start": seg["start"],
            "end": seg["end"],
            "chinese": seg["text"],
            "pinyin": seg.get("pinyin", ""),
            "translations": seg.get("translations", {}),
            "words": vocab_map.get(seg["id"]) or vocab_map.get(str(seg["id"])) or [],
        })

    result: dict = {
        "lesson": {
            "title": title,
            "source": source,
            "source_url": source_url,
            "duration": duration,
            "segments": lesson_segments,
            "translation_languages": translation_languages,
        }
    }
    if audio_filename:
        result["audio_url"] = f"/api/lessons/audio/{audio_filename}"

    jobs[job_id].status = "complete"
    jobs[job_id].step = "complete"
    jobs[job_id].result = result
    logger.info("[pipeline] shared_pipeline: complete in %.1fs total", time.monotonic() - t_pipeline)


async def _process_youtube_lesson(
    request: LessonRequest,
    video_id: str,
    job_id: str,
) -> None:
    """Background task: validate duration → download audio → transcribe → shared pipeline."""
    audio_path: Path | None = None
    try:
        jobs[job_id].step = "duration_check"
        duration = await get_youtube_duration(video_id)
        if duration > settings.max_video_duration_seconds:
            max_hours = settings.max_video_duration_seconds / 3600
            jobs[job_id].status = "error"
            jobs[job_id].error = f"Video exceeds the {max_hours:.0f}-hour duration limit."
            return

        jobs[job_id].step = "audio_extraction"
        audio_path = await extract_audio_from_youtube(video_id)

        jobs[job_id].step = "transcription"
        if not request.deepgram_api_key:
            jobs[job_id].status = "error"
            jobs[job_id].error = "Deepgram API key is required for transcription."
            return
        segments = await transcribe_audio_deepgram(audio_path, request.deepgram_api_key)

        source_url = f"https://www.youtube.com/watch?v={video_id}"
        title = f"YouTube Video ({video_id})"

        await _shared_pipeline(
            job_id,
            segments,
            request.translation_languages,
            request.openai_api_key,
            request.model,
            title,
            "youtube",
            source_url,
            duration,
            audio_filename=audio_path.name if audio_path else None,
        )

    except Exception as exc:
        logger.exception("YouTube lesson pipeline failed: %s", exc)
        jobs[job_id].status = "error"
        jobs[job_id].error = str(exc)
        if audio_path and audio_path.exists():
            audio_path.unlink(missing_ok=True)


async def _process_upload_lesson(
    file: UploadFile,
    translation_languages: list[str],
    openai_api_key: str,
    model: str,
    job_id: str,
    deepgram_api_key: str | None = None,
) -> None:
    """Background task: save file → probe duration → extract audio → transcribe → shared pipeline."""
    _TEMP_DIR.mkdir(parents=True, exist_ok=True)
    video_path: Path | None = None
    audio_path: Path | None = None
    try:
        filename = file.filename or "upload"
        ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "mp4"
        title = Path(filename).stem
        logger.info("[pipeline] upload_lesson: start file=%s", filename)

        jobs[job_id].step = "upload"
        t0 = time.monotonic()
        video_path = _TEMP_DIR / f"{uuid.uuid4()}.{ext}"
        total_bytes = 0
        with video_path.open("wb") as f:
            while True:
                chunk = await file.read(_CHUNK_SIZE)
                if not chunk:
                    break
                f.write(chunk)
                total_bytes += len(chunk)
        logger.info("[pipeline] upload: received %.1f MB in %.1fs", total_bytes / 1024 / 1024, time.monotonic() - t0)

        try:
            validate_upload_file(filename, total_bytes)
        except ValidationError as exc:
            jobs[job_id].status = "error"
            jobs[job_id].error = exc.message
            return

        jobs[job_id].step = "duration_check"
        duration = await probe_upload_duration(video_path)
        logger.info("[pipeline] duration_check: %.1fs", duration)
        if duration > settings.max_video_duration_seconds:
            max_hours = settings.max_video_duration_seconds / 3600
            jobs[job_id].status = "error"
            jobs[job_id].error = f"Video exceeds the {max_hours:.0f}-hour duration limit."
            return

        jobs[job_id].step = "audio_extraction"
        t0 = time.monotonic()
        audio_path = await extract_audio_from_upload(video_path)
        logger.info("[pipeline] audio_extraction: done in %.1fs", time.monotonic() - t0)

        jobs[job_id].step = "transcription"
        t0 = time.monotonic()
        if not deepgram_api_key:
            jobs[job_id].status = "error"
            jobs[job_id].error = "Deepgram API key is required for transcription."
            return
        segments = await transcribe_audio_deepgram(audio_path, deepgram_api_key)
        logger.info("[pipeline] transcription: done in %.1fs, %d segments", time.monotonic() - t0, len(segments))

        await _shared_pipeline(
            job_id,
            segments,
            translation_languages,
            openai_api_key,
            model,
            title,
            "upload",
            None,
            duration,
        )

    except Exception as exc:
        logger.exception("Upload lesson pipeline failed: %s", exc)
        jobs[job_id].status = "error"
        jobs[job_id].error = str(exc)
    finally:
        if video_path and video_path.exists():
            video_path.unlink(missing_ok=True)
        if audio_path and audio_path.exists():
            audio_path.unlink(missing_ok=True)


@router.post("/generate")
async def generate_lesson(request: LessonRequest, background_tasks: BackgroundTasks) -> dict:
    """Accept a LessonRequest JSON body, start background pipeline, return job_id immediately."""
    api_model = request.model
    if "api.openai.com" in settings.openai_chat_url and api_model.startswith("openai/"):
        api_model = api_model.replace("openai/", "", 1)
    request.model = api_model

    if request.source == "youtube":
        if not request.youtube_url:
            raise HTTPException(status_code=400, detail="youtube_url is required for source 'youtube'")
        try:
            video_id = validate_youtube_url(request.youtube_url)
        except ValidationError as exc:
            raise HTTPException(status_code=400, detail=exc.message)

        job_id = str(uuid.uuid4())
        jobs[job_id] = Job(status="processing", step="audio_extraction", result=None, error=None)
        background_tasks.add_task(_process_youtube_lesson, request, video_id, job_id)
        return {"job_id": job_id}
    else:
        raise HTTPException(
            status_code=400,
            detail="Use POST /api/lessons/generate-upload with multipart form for file uploads.",
        )


@router.post("/generate-upload")
async def generate_lesson_upload(
    background_tasks: BackgroundTasks,
    file: UploadFile,
    translation_languages: str = Form(...),
    openai_api_key: str = Form(...),
    model: str = Form("gpt-4o-mini"),
    deepgram_api_key: str | None = Form(None),
) -> dict:
    """Accept a multipart upload, start background pipeline, return job_id immediately."""
    languages = [lang.strip() for lang in translation_languages.split(",") if lang.strip()]
    if not languages:
        raise HTTPException(status_code=400, detail="translation_languages must not be empty")

    api_model = model
    if "api.openai.com" in settings.openai_chat_url and api_model.startswith("openai/"):
        api_model = api_model.replace("openai/", "", 1)

    job_id = str(uuid.uuid4())
    jobs[job_id] = Job(status="processing", step="upload", result=None, error=None)
    background_tasks.add_task(
        _process_upload_lesson,
        file,
        languages,
        openai_api_key,
        api_model,
        job_id,
        deepgram_api_key,
    )
    return {"job_id": job_id}


@router.get("/audio/{filename}")
async def get_audio(filename: str) -> StreamingResponse:
    """Serve a temporary audio file and delete it after sending."""
    safe_name = Path(filename).name
    audio_path = _TEMP_DIR / safe_name

    if not audio_path.exists() or not audio_path.is_file():
        raise HTTPException(status_code=404, detail="Audio file not found")

    def iterfile():
        with audio_path.open("rb") as f:
            while chunk := f.read(1024 * 64):
                yield chunk
        audio_path.unlink(missing_ok=True)

    return StreamingResponse(
        iterfile(),
        media_type="audio/mpeg",
        headers={"Content-Disposition": f'attachment; filename="{safe_name}"'},
    )
```

- [ ] **Step 2.4: Run lessons router tests**

```bash
cd backend && python -m pytest tests/test_lessons_router.py -v
```

Expected: all 5 tests PASS

- [ ] **Step 2.5: Run full backend test suite**

```bash
cd backend && python -m pytest -v
```

Expected: all tests PASS

- [ ] **Step 2.6: Commit**

```bash
git add backend/app/routers/lessons.py backend/tests/test_lessons_router.py
git commit -m "feat: refactor lesson pipeline to background tasks, return job_id immediately"
```

---

## Chunk 3: Frontend — Types + LessonsContext + Library Migration

**Files:**
- Modify: `frontend/src/types.ts`
- Create: `frontend/src/contexts/LessonsContext.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/library/Library.tsx`
- Create: `frontend/tests/LessonsContext.test.tsx`

---

- [ ] **Step 3.1: Write failing tests for LessonsContext**

Create `frontend/tests/LessonsContext.test.tsx`:

```typescript
import 'fake-indexeddb/auto'
import React from 'react'
import { IDBFactory } from 'fake-indexeddb'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { LessonsProvider, useLessons } from '@/contexts/LessonsContext'
import { initDB, saveLessonMeta, getAllLessonMetas } from '@/db'
import type { LessonMeta } from '@/types'

function makeMeta(overrides: Partial<LessonMeta> = {}): LessonMeta {
  return {
    id: 'lesson_1',
    title: 'Test Lesson',
    source: 'youtube',
    sourceUrl: 'https://youtube.com/watch?v=abc',
    translationLanguages: ['en'],
    createdAt: new Date().toISOString(),
    lastOpenedAt: new Date().toISOString(),
    progressSegmentId: null,
    tags: [],
    status: 'complete',
    ...overrides,
  }
}

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ db: (globalThis as any).__testDb }),
}))

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory()
  ;(globalThis as any).__testDb = await initDB()
})

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <LessonsProvider>{children}</LessonsProvider>
)

describe('LessonsProvider', () => {
  it('loads lessons from IndexedDB on mount', async () => {
    const db = (globalThis as any).__testDb
    await saveLessonMeta(db, makeMeta())

    const { result } = renderHook(() => useLessons(), { wrapper })

    await waitFor(() => expect(result.current.lessons).toHaveLength(1))
    expect(result.current.lessons[0].id).toBe('lesson_1')
  })

  it('updateLesson adds new lesson to state and IndexedDB', async () => {
    const db = (globalThis as any).__testDb
    const meta = makeMeta({ id: 'lesson_2', title: 'New' })

    const { result } = renderHook(() => useLessons(), { wrapper })

    await waitFor(() => expect(result.current.updateLesson).toBeDefined())
    await act(async () => {
      await result.current.updateLesson(meta)
    })

    expect(result.current.lessons.find(l => l.id === 'lesson_2')).toBeDefined()
    const persisted = await getAllLessonMetas(db)
    expect(persisted.find(l => l.id === 'lesson_2')).toBeDefined()
  })

  it('updateLesson updates existing lesson in state', async () => {
    const db = (globalThis as any).__testDb
    await saveLessonMeta(db, makeMeta({ title: 'Original' }))

    const { result } = renderHook(() => useLessons(), { wrapper })

    await waitFor(() => expect(result.current.lessons).toHaveLength(1))
    await act(async () => {
      await result.current.updateLesson({ ...result.current.lessons[0], title: 'Updated' })
    })

    expect(result.current.lessons[0].title).toBe('Updated')
  })

  it('deleteLesson removes from state and IndexedDB', async () => {
    const db = (globalThis as any).__testDb
    await saveLessonMeta(db, makeMeta())

    const { result } = renderHook(() => useLessons(), { wrapper })

    await waitFor(() => expect(result.current.lessons).toHaveLength(1))
    await act(async () => {
      await result.current.deleteLesson('lesson_1')
    })

    expect(result.current.lessons).toHaveLength(0)
    const persisted = await getAllLessonMetas(db)
    expect(persisted).toHaveLength(0)
  })
})
```

- [ ] **Step 3.2: Run test to confirm it fails**

```bash
cd frontend && npx vitest run tests/LessonsContext.test.tsx
```

Expected: FAIL with `Cannot find module '@/contexts/LessonsContext'`

- [ ] **Step 3.3: Add new fields to `LessonMeta` in `frontend/src/types.ts`**

Make `duration` and `segmentCount` optional (stub lessons have neither) and add four new fields:

```typescript
export interface LessonMeta {
  id: string
  title: string
  source: 'youtube' | 'upload'
  sourceUrl: string | null
  duration?: number         // optional: stub lessons don't have it yet
  segmentCount?: number     // optional: stub lessons don't have it yet
  translationLanguages: string[]
  createdAt: string
  lastOpenedAt: string
  progressSegmentId: string | null
  tags: string[]
  status?: 'processing' | 'complete' | 'error'  // undefined treated as 'complete'
  jobId?: string
  errorMessage?: string
  currentStep?: string
}
```

- [ ] **Step 3.4: Create `frontend/src/contexts/LessonsContext.tsx`**

```typescript
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { LessonMeta } from '@/types'
import type { ShadowLearnDB } from '@/db'
import { deleteFullLesson, getAllLessonMetas, saveLessonMeta } from '@/db'
import { useAuth } from '@/contexts/AuthContext'

interface LessonsContextValue {
  lessons: LessonMeta[]
  db: ShadowLearnDB | null
  updateLesson: (meta: LessonMeta) => Promise<void>
  deleteLesson: (id: string) => Promise<void>
  refreshLessons: () => Promise<void>
}

const LessonsContext = createContext<LessonsContextValue | null>(null)

export function LessonsProvider({ children }: { children: React.ReactNode }) {
  const { db } = useAuth()
  const [lessons, setLessons] = useState<LessonMeta[]>([])

  const refreshLessons = useCallback(async () => {
    if (!db)
      return
    const metas = await getAllLessonMetas(db)
    setLessons(metas)
  }, [db])

  const updateLesson = useCallback(async (meta: LessonMeta) => {
    if (!db)
      return
    await saveLessonMeta(db, meta)
    setLessons(prev => {
      const idx = prev.findIndex(l => l.id === meta.id)
      if (idx === -1)
        return [...prev, meta]
      const next = [...prev]
      next[idx] = meta
      return next
    })
  }, [db])

  const deleteLesson = useCallback(async (id: string) => {
    if (!db)
      return
    await deleteFullLesson(db, id)
    setLessons(prev => prev.filter(l => l.id !== id))
  }, [db])

  useEffect(() => {
    refreshLessons()
  }, [refreshLessons])

  return (
    <LessonsContext.Provider value={{ lessons, db, updateLesson, deleteLesson, refreshLessons }}>
      {children}
    </LessonsContext.Provider>
  )
}

export function useLessons(): LessonsContextValue {
  const ctx = useContext(LessonsContext)
  if (!ctx)
    throw new Error('useLessons must be used within LessonsProvider')
  return ctx
}
```

- [ ] **Step 3.5: Run context tests**

```bash
cd frontend && npx vitest run tests/LessonsContext.test.tsx
```

Expected: all 4 tests PASS

- [ ] **Step 3.6: Wrap app with `LessonsProvider` in `frontend/src/App.tsx`**

Read `App.tsx` fully. Add `LessonsProvider` import and wrap the existing content inside `AuthProvider` with it:

```tsx
import { LessonsProvider } from '@/contexts/LessonsContext'

// Inside JSX — LessonsProvider goes inside AuthProvider (it calls useAuth):
<AuthProvider>
  <LessonsProvider>
    {/* existing children */}
  </LessonsProvider>
</AuthProvider>
```

- [ ] **Step 3.7: Migrate `Library.tsx` to use `useLessons`**

Read `Library.tsx` fully. Replace the file with the version below (preserves all existing sort/filter/search/rename/delete UI, adds context-based state, processing-first sort, and `onRetry` wiring):

```tsx
import type { LessonMeta } from '@/types'
import { Plus } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useAuth } from '@/contexts/AuthContext'
import { useLessons } from '@/contexts/LessonsContext'
import { cn } from '@/lib/utils'
import { LessonCard } from './LessonCard'

type SortMode = 'recent' | 'alpha' | 'progress'

export function Library() {
  const { keys } = useAuth()
  const { lessons, updateLesson, deleteLesson } = useLessons()
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortMode>('recent')

  const filtered = useMemo(() => {
    let result = lessons
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(l => l.title.toLowerCase().includes(q))
    }

    return result.toSorted((a, b) => {
      // Processing lessons always sort to the top
      const aProcessing = a.status === 'processing'
      const bProcessing = b.status === 'processing'
      if (aProcessing && !bProcessing)
        return -1
      if (!aProcessing && bProcessing)
        return 1

      if (sort === 'recent')
        return new Date(b.lastOpenedAt).getTime() - new Date(a.lastOpenedAt).getTime()
      if (sort === 'alpha')
        return a.title.localeCompare(b.title)
      const pA = a.progressSegmentId && a.segmentCount
        ? Number.parseInt(a.progressSegmentId, 10) / a.segmentCount
        : 0
      const pB = b.progressSegmentId && b.segmentCount
        ? Number.parseInt(b.progressSegmentId, 10) / b.segmentCount
        : 0
      return pB - pA
    })
  }, [lessons, search, sort])

  const handleDelete = useCallback(async (id: string) => {
    await deleteLesson(id)
  }, [deleteLesson])

  const handleRename = useCallback(async (lesson: LessonMeta, newTitle: string) => {
    await updateLesson({ ...lesson, title: newTitle })
  }, [updateLesson])

  const handleRetry = useCallback(async (lesson: LessonMeta) => {
    // Upload retry: audio blob is already in IndexedDB; only the pipeline needs re-running.
    // The backend does not currently support re-running from a saved blob — the user must
    // re-upload. LessonCard shows "Re-upload to retry" text for upload-sourced errors.
    if (!keys || lesson.source !== 'youtube' || !lesson.sourceUrl)
      return
    const res = await fetch('/api/lessons/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'youtube',
        youtube_url: lesson.sourceUrl,
        translation_languages: lesson.translationLanguages,
        openai_api_key: keys.openaiApiKey,
        deepgram_api_key: keys.deepgramApiKey,
        model: 'gpt-4o-mini',
      }),
    })
    if (!res.ok)
      return
    const { job_id } = await res.json()
    await updateLesson({
      ...lesson,
      status: 'processing',
      jobId: job_id,
      errorMessage: undefined,
      currentStep: undefined,
    })
  }, [keys, updateLesson])

  const sortButtons: { mode: SortMode, label: string }[] = [
    { mode: 'recent', label: 'Recent' },
    { mode: 'alpha', label: 'A-Z' },
    { mode: 'progress', label: 'Progress' },
  ]

  return (
    <Layout onSearch={setSearch} searchValue={search}>
      <div className="p-4">
        <div className="mb-4 flex items-center gap-1">
          {sortButtons.map(({ mode, label }) => (
            <Button
              key={mode}
              variant={sort === mode ? 'secondary' : 'ghost'}
              size="xs"
              onClick={() => setSort(mode)}
              className={cn(sort === mode && 'font-semibold')}
            >
              {label}
            </Button>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <Card className="flex min-h-[160px] items-center justify-center border-dashed">
            <Button variant="ghost" size="lg" render={<Link to="/create" />}>
              <Plus className="size-5" />
              Add new lesson
            </Button>
          </Card>

          {filtered.map(lesson => (
            <LessonCard
              key={lesson.id}
              lesson={lesson}
              onDelete={handleDelete}
              onRename={handleRename}
              onRetry={handleRetry}
            />
          ))}
        </div>
      </div>
    </Layout>
  )
}
```

- [ ] **Step 3.8: Run frontend test suite**

```bash
cd frontend && npx vitest run
```

Expected: all existing tests PASS, new context tests PASS

- [ ] **Step 3.9: Commit**

```bash
git add frontend/src/types.ts frontend/src/contexts/LessonsContext.tsx frontend/src/App.tsx frontend/src/components/library/Library.tsx frontend/tests/LessonsContext.test.tsx
git commit -m "feat: add LessonsContext, migrate Library to context, extend LessonMeta for job status"
```

---

## Chunk 4: Frontend — useJobPoller + CreateLesson + LessonCard Badge

**Files:**
- Create: `frontend/src/hooks/useJobPoller.ts`
- Modify: `frontend/src/contexts/LessonsContext.tsx`
- Modify: `frontend/src/components/create/CreateLesson.tsx`
- Modify: `frontend/src/components/library/LessonCard.tsx`
- Create: `frontend/tests/useJobPoller.test.ts`

---

- [ ] **Step 4.1: Write failing tests for `useJobPoller`**

Create `frontend/tests/useJobPoller.test.ts`:

```typescript
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { initDB, getSegments } from '@/db'
import { useJobPoller } from '@/hooks/useJobPoller'
import type { LessonMeta } from '@/types'

function makeProcessingLesson(overrides: Partial<LessonMeta> = {}): LessonMeta {
  return {
    id: 'lesson_1',
    title: 'YouTube Video (abc)',
    source: 'youtube',
    sourceUrl: 'https://youtube.com/watch?v=abc',
    translationLanguages: ['en'],
    createdAt: new Date().toISOString(),
    lastOpenedAt: new Date().toISOString(),
    progressSegmentId: null,
    tags: [],
    status: 'processing',
    jobId: 'job_abc',
    ...overrides,
  }
}

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory()
  ;(globalThis as any).__testDb = await initDB()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('useJobPoller', () => {
  it('marks lesson as error on 404 (server restart)', async () => {
    const db = (globalThis as any).__testDb
    const lesson = makeProcessingLesson()
    const updateLesson = vi.fn(async () => {})

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 404 }))
    renderHook(() => useJobPoller({ lessons: [lesson], db, updateLesson }))

    await act(async () => {
      vi.advanceTimersByTime(3000)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(updateLesson).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'error', errorMessage: 'Server restarted', jobId: undefined })
    )
  })

  it('updates currentStep when job is still processing', async () => {
    const db = (globalThis as any).__testDb
    const lesson = makeProcessingLesson()
    const updateLesson = vi.fn(async () => {})

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 200,
      json: async () => ({ status: 'processing', step: 'translation', result: null, error: null }),
    }))
    renderHook(() => useJobPoller({ lessons: [lesson], db, updateLesson }))

    await act(async () => {
      vi.advanceTimersByTime(3000)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(updateLesson).toHaveBeenCalledWith(
      expect.objectContaining({ currentStep: 'translation' })
    )
  })

  it('saves segments, downloads audio, marks complete, calls DELETE on success', async () => {
    const db = (globalThis as any).__testDb
    const lesson = makeProcessingLesson()
    const segments = [{
      id: '1', start: 0, end: 5, chinese: '你好', pinyin: 'nǐ hǎo',
      translations: { en: 'Hello' }, words: [],
    }]
    const updateLesson = vi.fn(async () => {})

    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        status: 200,
        json: async () => ({
          status: 'complete',
          step: 'complete',
          result: {
            lesson: { title: 'YouTube Video (abc)', source: 'youtube', source_url: 'https://youtube.com/watch?v=abc', duration: 60, segments, translation_languages: ['en'] },
            audio_url: '/api/lessons/audio/audio.mp3',
          },
          error: null,
        }),
      })
      .mockResolvedValueOnce({ blob: async () => new Blob(['audio'], { type: 'audio/mpeg' }) })
      .mockResolvedValue({ status: 204 })

    vi.stubGlobal('fetch', mockFetch)
    renderHook(() => useJobPoller({ lessons: [lesson], db, updateLesson }))

    await act(async () => {
      vi.advanceTimersByTime(3000)
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    const saved = await getSegments(db, 'lesson_1')
    expect(saved).toHaveLength(1)
    expect(updateLesson).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'complete', jobId: undefined, duration: 60, segmentCount: 1 })
    )
    expect(mockFetch).toHaveBeenCalledWith('/api/jobs/job_abc', { method: 'DELETE' })
  })

  it('marks error and calls DELETE when job errors', async () => {
    const db = (globalThis as any).__testDb
    const lesson = makeProcessingLesson()
    const updateLesson = vi.fn(async () => {})

    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        status: 200,
        json: async () => ({ status: 'error', step: 'transcription', result: null, error: 'API timeout' }),
      })
      .mockResolvedValue({ status: 204 })

    vi.stubGlobal('fetch', mockFetch)
    renderHook(() => useJobPoller({ lessons: [lesson], db, updateLesson }))

    await act(async () => {
      vi.advanceTimersByTime(3000)
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(updateLesson).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'error', errorMessage: 'API timeout', jobId: undefined })
    )
    expect(mockFetch).toHaveBeenCalledWith('/api/jobs/job_abc', { method: 'DELETE' })
  })

  it('does not start interval when no processing lessons', async () => {
    const db = (globalThis as any).__testDb
    const lesson = makeProcessingLesson({ status: 'complete', jobId: undefined })
    const mockFetch = vi.fn()

    vi.stubGlobal('fetch', mockFetch)
    renderHook(() => useJobPoller({ lessons: [lesson], db, updateLesson: vi.fn() }))

    await act(async () => {
      vi.advanceTimersByTime(10000)
    })

    expect(mockFetch).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 4.2: Run tests to confirm they fail**

```bash
cd frontend && npx vitest run tests/useJobPoller.test.ts
```

Expected: FAIL with `Cannot find module '@/hooks/useJobPoller'`

- [ ] **Step 4.3: Create `frontend/src/hooks/useJobPoller.ts`**

```typescript
import { useCallback, useEffect, useRef } from 'react'
import type { LessonMeta } from '@/types'
import type { ShadowLearnDB } from '@/db'
import { saveSegments, saveVideo } from '@/db'

interface UseJobPollerProps {
  lessons: LessonMeta[]
  db: ShadowLearnDB | null
  updateLesson: (meta: LessonMeta) => Promise<void>
}

export function useJobPoller({ lessons, db, updateLesson }: UseJobPollerProps): void {
  // Stable ref so pollJobs can read latest lessons without being in its dep array
  const lessonsRef = useRef(lessons)
  useEffect(() => {
    lessonsRef.current = lessons
  }, [lessons])

  // Primitive string dep: restart interval only when the set of active job IDs changes
  const processingJobIds = lessons
    .filter(l => l.status === 'processing')
    .map(l => l.jobId ?? '')
    .join(',')

  const pollJobs = useCallback(async () => {
    if (!db)
      return
    const processing = lessonsRef.current.filter(l => l.status === 'processing')
    for (const lesson of processing) {
      if (!lesson.jobId)
        continue
      let res: Response
      try {
        res = await fetch(`/api/jobs/${lesson.jobId}`)
      }
      catch {
        continue // network error — retry on next tick
      }

      if (res.status === 404) {
        await updateLesson({
          ...lesson,
          status: 'error',
          errorMessage: 'Server restarted',
          jobId: undefined,
          currentStep: undefined,
        })
        continue
      }

      const job = await res.json()

      if (job.status === 'processing') {
        await updateLesson({ ...lesson, currentStep: job.step })
      }
      else if (job.status === 'complete') {
        const jobId = lesson.jobId
        // job.result has the nested shape { lesson: {...}, audio_url? } —
        // matches the backend _shared_pipeline result dict from Chunk 2 Step 2.3.
        const { lesson: resultLesson, audio_url } = job.result
        await saveSegments(db, lesson.id, resultLesson.segments)
        if (lesson.source === 'youtube' && audio_url) {
          const audioBlob = await fetch(audio_url).then(r => r.blob())
          await saveVideo(db, lesson.id, audioBlob)
        }
        await updateLesson({
          ...lesson,
          title: resultLesson.title,
          status: 'complete',
          jobId: undefined,
          currentStep: undefined,
          duration: resultLesson.duration,
          segmentCount: resultLesson.segments.length,
        })
        await fetch(`/api/jobs/${jobId}`, { method: 'DELETE' })
      }
      else if (job.status === 'error') {
        const jobId = lesson.jobId
        await updateLesson({
          ...lesson,
          status: 'error',
          errorMessage: job.error,
          jobId: undefined,
          currentStep: undefined,
        })
        await fetch(`/api/jobs/${jobId}`, { method: 'DELETE' })
      }
    }
  }, [db, updateLesson])

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!processingJobIds)
      return
    intervalRef.current = setInterval(pollJobs, 3000)
    return () => {
      if (intervalRef.current)
        clearInterval(intervalRef.current)
    }
  }, [processingJobIds, pollJobs])
}
```

- [ ] **Step 4.4: Mount `useJobPoller` inside `LessonsProvider`**

In `frontend/src/contexts/LessonsContext.tsx`, add the import and call it inside the provider before the return:

```typescript
import { useJobPoller } from '@/hooks/useJobPoller'

// Inside LessonsProvider, before the return statement:
useJobPoller({ lessons, db, updateLesson })
```

- [ ] **Step 4.5: Run `useJobPoller` tests**

```bash
cd frontend && npx vitest run tests/useJobPoller.test.ts
```

Expected: all 5 tests PASS

- [ ] **Step 4.6: Replace `CreateLesson.tsx` with background-job version**

Replace the full content of `frontend/src/components/create/CreateLesson.tsx`:

```tsx
import type { LessonMeta } from '@/types'
import { Sparkles } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Layout } from '@/components/Layout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuth } from '@/contexts/AuthContext'
import { useLessons } from '@/contexts/LessonsContext'
import { getSettings, saveVideo } from '@/db'
import { UploadTab } from './UploadTab'
import { YouTubeTab } from './YouTubeTab'

const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'ja', label: 'Japanese' },
  { value: 'ko', label: 'Korean' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'ru', label: 'Russian' },
  { value: 'vi', label: 'Vietnamese' },
]

export function CreateLesson() {
  const { db, keys } = useAuth()
  const navigate = useNavigate()
  const { updateLesson } = useLessons()

  const [tab, setTab] = useState('youtube')
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [language, setLanguage] = useState('en')
  const [submitting, setSubmitting] = useState(false)
  const [queued, setQueued] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!db)
      return
    getSettings(db).then((s) => {
      if (s)
        setLanguage(s.translationLanguage)
    })
  }, [db])

  const handleGenerate = useCallback(async () => {
    if (!db || !keys)
      return
    const isYoutube = tab === 'youtube'
    if (isYoutube && !youtubeUrl.trim())
      return
    if (!isYoutube && !file)
      return

    setSubmitting(true)
    setError(null)

    try {
      let jobId: string
      let lessonSource: 'youtube' | 'upload'
      let lessonSourceUrl: string | null = null
      let lessonTitle: string
      let capturedFile: File | null = null

      if (isYoutube) {
        const res = await fetch('/api/lessons/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            source: 'youtube',
            youtube_url: youtubeUrl,
            translation_languages: [language],
            openai_api_key: keys.openaiApiKey,
            deepgram_api_key: keys.deepgramApiKey ?? null,
            model: 'gpt-4o-mini',
          }),
        })
        if (!res.ok) {
          const detail = await res.json().catch(() => null)
          const msg = detail?.detail || `Server error: ${res.status}`
          toast.error(msg)
          throw new Error(msg)
        }
        const data = await res.json()
        jobId = data.job_id
        lessonSource = 'youtube'
        const match = youtubeUrl.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/)
        const videoId = match?.[1] ?? 'unknown'
        lessonTitle = `YouTube Video (${videoId})`
        lessonSourceUrl = youtubeUrl
      }
      else {
        capturedFile = file!
        const formData = new FormData()
        formData.append('file', file!)
        formData.append('translation_languages', language)
        formData.append('openai_api_key', keys.openaiApiKey)
        formData.append('model', 'gpt-4o-mini')
        if (keys.deepgramApiKey)
          formData.append('deepgram_api_key', keys.deepgramApiKey)

        const res = await fetch('/api/lessons/generate-upload', { method: 'POST', body: formData })
        if (!res.ok) {
          const detail = await res.json().catch(() => null)
          const msg = detail?.detail || `Server error: ${res.status}`
          toast.error(msg)
          throw new Error(msg)
        }
        const data = await res.json()
        jobId = data.job_id
        lessonSource = 'upload'
        lessonTitle = file!.name.replace(/\.[^/.]+$/, '')
      }

      const lessonId = crypto.randomUUID()
      const now = new Date().toISOString()

      // For uploads: persist audio to IndexedDB before navigating (component will unmount)
      if (lessonSource === 'upload' && capturedFile) {
        await saveVideo(db, lessonId, capturedFile)
      }

      await updateLesson({
        id: lessonId,
        title: lessonTitle,
        source: lessonSource,
        sourceUrl: lessonSourceUrl,
        translationLanguages: [language],
        createdAt: now,
        lastOpenedAt: now,
        progressSegmentId: null,
        tags: [],
        status: 'processing',
        jobId,
      } as LessonMeta)

      setQueued(true)
      setYoutubeUrl('')
      setFile(null)
    }
    catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setError(msg)
    }
    finally {
      setSubmitting(false)
    }
  }, [db, keys, tab, youtubeUrl, file, language, updateLesson])

  const canGenerate = (tab === 'youtube' ? !!youtubeUrl.trim() : !!file) && !!keys?.deepgramApiKey

  if (queued) {
    return (
      <Layout>
        <div className="mx-auto max-w-2xl p-4">
          <Card>
            <CardContent className="flex flex-col items-center justify-center gap-4 py-12 text-center">
              <p className="text-sm text-white/65">
                Lesson queued — track progress in the library
              </p>
              <div className="flex gap-2">
                <Button onClick={() => navigate('/')}>Go to Library</Button>
                <Button variant="ghost" onClick={() => setQueued(false)}>Queue Another</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="mx-auto max-w-2xl p-4">
        <Card>
          <CardHeader>
            <CardTitle>Create New Lesson</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <Tabs value={tab} onValueChange={v => setTab(v as string)}>
              <TabsList>
                <TabsTrigger value="youtube">YouTube</TabsTrigger>
                <TabsTrigger value="upload">Upload</TabsTrigger>
              </TabsList>
              <TabsContent value="youtube">
                <YouTubeTab url={youtubeUrl} onUrlChange={setYoutubeUrl} />
              </TabsContent>
              <TabsContent value="upload">
                <UploadTab file={file} onFileChange={setFile} />
              </TabsContent>
            </Tabs>

            <div className="space-y-2">
              <label className="text-sm font-medium text-white/65">Translation Language</label>
              <Select value={language} onValueChange={v => v !== null && setLanguage(v)} items={LANGUAGES}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map(l => (
                    <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              disabled={!canGenerate || submitting}
              onClick={handleGenerate}
              className="w-full"
            >
              <Sparkles className="size-4" />
              {submitting ? 'Starting…' : 'Generate Lesson'}
            </Button>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </CardContent>
        </Card>
      </div>
    </Layout>
  )
}
```

- [ ] **Step 4.7: Replace `LessonCard.tsx` with status-badge version**

Replace the full content of `frontend/src/components/library/LessonCard.tsx`:

```tsx
import type { LessonMeta } from '@/types'
import { Clock, FileVideo, Loader2, MoreHorizontal, Trash2, Youtube } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { MenuBackdrop, MenuItem, MenuPopup, MenuPortal, MenuPositioner, MenuRoot, MenuTrigger } from '@/components/ui/menu'

interface LessonCardProps {
  lesson: LessonMeta
  onDelete: (id: string) => void
  onRename: (lesson: LessonMeta, newTitle: string) => void
  onRetry?: (lesson: LessonMeta) => void
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function LessonCard({ lesson, onDelete, onRename, onRetry }: LessonCardProps) {
  const status = lesson.status ?? 'complete'
  const isProcessing = status === 'processing'
  const isError = status === 'error'

  const progress = lesson.progressSegmentId && lesson.segmentCount
    ? Math.min(100, Math.round((Number.parseInt(lesson.progressSegmentId, 10) / lesson.segmentCount) * 100))
    : 0

  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState('')
  const isCancelledRef = useRef(false)
  const inputRef = useRef<HTMLInputElement>(null)

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
      {/* Card-level navigation link — disabled while editing or processing */}
      <Link
        to={`/lesson/${lesson.id}`}
        className="absolute inset-0 z-10"
        tabIndex={isEditing || isProcessing ? -1 : undefined}
        style={{ pointerEvents: isEditing || isProcessing ? 'none' : undefined }}
      />

      {/* Action menu */}
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
        {/* Status badge — only shown for processing or error states */}
        {isProcessing && (
          <div className="mb-2 flex items-center gap-1.5 text-xs text-white/50">
            <Loader2 className="size-3 animate-spin" />
            <span>{lesson.currentStep ?? 'Processing…'}</span>
          </div>
        )}
        {isError && (
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <span className="rounded bg-destructive/15 px-1.5 py-0.5 text-xs font-medium text-destructive">
              Failed
            </span>
            {/* YouTube: retry is possible programmatically */}
            {lesson.source === 'youtube' && onRetry && (
              <button
                onClick={(e) => { e.preventDefault(); onRetry(lesson) }}
                className="z-20 text-xs text-white/50 underline hover:text-white"
              >
                Retry
              </button>
            )}
            {/* Upload: pipeline cannot be retried without re-uploading */}
            {lesson.source === 'upload' && (
              <span className="text-xs text-white/50">Re-upload to retry</span>
            )}
            {lesson.errorMessage && (
              <span
                className="max-w-[120px] truncate text-xs text-white/40"
                title={lesson.errorMessage}
              >
                {lesson.errorMessage}
              </span>
            )}
          </div>
        )}

        <div className="flex items-center gap-2 text-white/40 mb-2">
          {lesson.source === 'youtube'
            ? <Youtube className="size-5 text-red-400" />
            : <FileVideo className="size-5 text-white/50" />}
          {/* Duration and segment count hidden until lesson is complete */}
          {!isProcessing && lesson.duration != null && lesson.segmentCount != null && (
            <>
              <div className="flex items-center gap-1 text-xs">
                <Clock className="size-4" />
                {formatDuration(lesson.duration)}
              </div>
              <span className="text-xs">
                {lesson.segmentCount}
                {' '}
                segments
              </span>
            </>
          )}
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

        {/* Progress bar hidden while processing (no segments yet) */}
        {!isProcessing && lesson.segmentCount != null && (
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
        )}
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 4.8: Run full frontend test suite**

```bash
cd frontend && npx vitest run
```

Expected: all tests PASS

- [ ] **Step 4.9: Commit**

```bash
git add frontend/src/hooks/useJobPoller.ts frontend/src/contexts/LessonsContext.tsx frontend/src/components/create/CreateLesson.tsx frontend/src/components/library/LessonCard.tsx frontend/tests/useJobPoller.test.ts
git commit -m "feat: background lesson processing with job poller, status badges, and queued creation flow"
```

---

## Chunk 5: Final Verification

- [ ] **Step 5.1: Run full backend test suite**

```bash
cd backend && python -m pytest -v
```

Expected: all tests PASS

- [ ] **Step 5.2: Run full frontend test suite**

```bash
cd frontend && npx vitest run
```

Expected: all tests PASS

- [ ] **Step 5.3: Manual smoke test**

1. Start backend: `cd backend && uvicorn app.main:app --reload`
2. Start frontend: `cd frontend && npm run dev`
3. Submit a YouTube URL → app shows "Lesson queued" confirmation immediately
4. Navigate to Library → stub card appears with spinner + step label
5. After ~30s verify card updates its step label as pipeline progresses
6. On completion: card shows no badge, link becomes active, lesson opens correctly
7. Submit a second lesson before the first completes → both cards show spinners concurrently
8. Test error: submit with invalid API key → card shows "Failed" badge + Retry button; clicking Retry re-queues the lesson

- [ ] **Step 5.4: Commit any cleanup**

```bash
git add -p
git commit -m "chore: post-integration cleanup"
```
