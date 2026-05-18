"""Tests for GET /api/tips/transcript/{video_id}.

Strategy: mock the subtitle service and the STT factory so the test runs
without hitting YouTube or Deepgram. Verify each fallback branch and the
shape of the response, plus the 202+jobId path when transcription is
queued.
"""
from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.tips.services.transcript import fetch_youtube_subtitles


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def test_returns_subtitle_segments_when_manual_track_exists(client: TestClient) -> None:
    fake_segments = [
        {"start": 0.0, "end": 2.5, "text": "Hello"},
        {"start": 2.5, "end": 5.0, "text": "World"},
    ]
    with patch("app.tips.services.transcript.fetch_youtube_subtitles", new=AsyncMock(return_value=("en", fake_segments))):
        resp = client.get("/api/tips/transcript/abc123")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ready"
    assert body["source"] == "subtitle"
    assert body["lang"] == "en"
    assert body["segments"] == fake_segments


def test_returns_202_with_job_id_when_stt_falls_back(client: TestClient) -> None:
    with patch("app.tips.services.transcript.fetch_youtube_subtitles", new=AsyncMock(return_value=(None, None))), \
         patch("app.tips.services.transcript.kick_off_stt_job", new=AsyncMock(return_value="job-42")):
        resp = client.get("/api/tips/transcript/abc123")
    assert resp.status_code == 202
    body = resp.json()
    assert body["status"] == "pending"
    assert body["jobId"] == "job-42"


def test_returns_404_when_neither_subtitle_nor_stt_available(client: TestClient) -> None:
    with patch("app.tips.services.transcript.fetch_youtube_subtitles", new=AsyncMock(return_value=(None, None))), \
         patch("app.tips.services.transcript.kick_off_stt_job", new=AsyncMock(return_value=None)):
        resp = client.get("/api/tips/transcript/abc123")
    assert resp.status_code == 404
    assert resp.json()["status"] == "unavailable"


def test_validates_video_id_format(client: TestClient) -> None:
    resp = client.get("/api/tips/transcript/" + "x" * 64)
    assert resp.status_code == 400


def test_get_transcript_blocks_over_30_min_video(client: TestClient) -> None:
    async def fake_check(_video_id: str) -> tuple[float, bool]:
        return (35 * 60, True)

    with patch("app.tips.services.transcript.check_video_duration", new=fake_check):
        resp = client.get("/api/tips/transcript/abc123")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "too_long"
    assert body["durationSec"] == 35 * 60
    assert body["limitSec"] == 30 * 60


@pytest.mark.asyncio
async def test_fetch_subtitles_prefers_detected_language_over_english(monkeypatch):
    """Vietnamese video with EN manual track should still pick VI."""
    fake_meta = {
        "duration": 600.0,
        "language": "vi",
        "subtitles": {"vi": [{"ext": "vtt"}], "en": [{"ext": "vtt"}]},
        "automatic_captions": {},
    }
    monkeypatch.setattr(
        "app.tips.services.transcript.get_youtube_metadata",
        AsyncMock(return_value=fake_meta),
    )
    monkeypatch.setattr(
        "app.tips.services.transcript.pick_manual_subtitle",
        lambda subs, lang: lang if lang in subs else None,
    )
    monkeypatch.setattr(
        "app.tips.services.transcript.download_subtitle_vtt",
        AsyncMock(return_value="WEBVTT\n\n00:00.000 --> 00:01.000\nxin chào"),
    )
    monkeypatch.setattr(
        "app.tips.services.transcript.parse_vtt_to_segments",
        lambda vtt, lang: [{"start": 0.0, "end": 1.0, "text": "xin chào"}],
    )

    lang, segments = await fetch_youtube_subtitles("abc123")
    assert lang == "vi"
    assert segments == [{"start": 0.0, "end": 1.0, "text": "xin chào"}]


@pytest.mark.asyncio
async def test_fetch_subtitles_no_auto_translate(monkeypatch):
    """Vietnamese video with only EN auto-captions should fall through to STT
    rather than serving auto-translated EN."""
    fake_meta = {
        "duration": 600.0,
        "language": "vi",
        "subtitles": {},
        "automatic_captions": {"en": [{"ext": "vtt"}]},
    }
    monkeypatch.setattr(
        "app.tips.services.transcript.get_youtube_metadata",
        AsyncMock(return_value=fake_meta),
    )
    monkeypatch.setattr(
        "app.tips.services.transcript.pick_manual_subtitle",
        lambda subs, lang: lang if lang in subs else None,
    )

    lang, segments = await fetch_youtube_subtitles("abc123")
    assert lang is None
    assert segments is None


@pytest.mark.asyncio
async def test_kick_off_stt_job_dedupes_same_video(monkeypatch):
    """Two calls for the same video_id while the first job is still processing
    must return the same job_id and only spawn one background task."""
    from app.job_store import jobs
    from app.tips.services import transcript as svc

    # Reset module-level state.
    jobs.clear()
    svc._tip_video_jobs.clear()

    # Stub DeepgramSTTProvider so we don't try to call out.
    class FakeProvider:
        async def transcribe(self, *a, **kw):
            return []
    monkeypatch.setattr(svc, "DeepgramSTTProvider", lambda: FakeProvider())

    # Block the background _run coroutine from actually executing — we just
    # care that kick_off_stt_job returns the right job_id and registers it.
    monkeypatch.setattr(svc.asyncio, "create_task", lambda coro: coro.close() or None)

    job_id_1 = await svc.kick_off_stt_job("abc123")
    assert job_id_1 is not None
    assert svc._tip_video_jobs["abc123"] == job_id_1

    job_id_2 = await svc.kick_off_stt_job("abc123")
    assert job_id_2 == job_id_1, "second call must reuse the in-flight job"
    # Only one entry in jobs[] for this video.
    assert sum(1 for j in jobs.values() if j is jobs[job_id_1]) == 1


@pytest.mark.asyncio
async def test_kick_off_stt_job_spawns_fresh_after_error(monkeypatch):
    """If the previous job for a video failed, a new call must spawn fresh."""
    from app.job_store import jobs
    from app.tips.services import transcript as svc

    jobs.clear()
    svc._tip_video_jobs.clear()

    class FakeProvider:
        async def transcribe(self, *a, **kw):
            return []
    monkeypatch.setattr(svc, "DeepgramSTTProvider", lambda: FakeProvider())
    monkeypatch.setattr(svc.asyncio, "create_task", lambda coro: coro.close() or None)

    first = await svc.kick_off_stt_job("abc123")
    # Simulate the background task erroring out.
    jobs[first].status = "error"
    jobs[first].error = "deepgram blew up"

    second = await svc.kick_off_stt_job("abc123")
    assert second is not None
    assert second != first, "errored job must NOT be reused"


@pytest.mark.asyncio
async def test_kick_off_stt_job_spawns_fresh_after_prune(monkeypatch):
    """If the stored job_id is no longer in jobs[] (pruned by TTL), spawn fresh."""
    from app.job_store import jobs
    from app.tips.services import transcript as svc

    jobs.clear()
    svc._tip_video_jobs.clear()

    class FakeProvider:
        async def transcribe(self, *a, **kw):
            return []
    monkeypatch.setattr(svc, "DeepgramSTTProvider", lambda: FakeProvider())
    monkeypatch.setattr(svc.asyncio, "create_task", lambda coro: coro.close() or None)

    first = await svc.kick_off_stt_job("abc123")
    # Simulate pruning.
    del jobs[first]

    second = await svc.kick_off_stt_job("abc123")
    assert second is not None
    assert second != first
    # Index cleaned up to point at the new job.
    assert svc._tip_video_jobs["abc123"] == second


def test_get_transcript_fast_path_for_completed_job(client, monkeypatch):
    """If a complete STT job already exists for the video, return its
    cached result without running any yt-dlp metadata probe."""
    from app.job_store import Job, jobs
    from app.tips.services import transcript as svc

    jobs.clear()
    svc._tip_video_jobs.clear()

    # Plant a complete job for the video.
    job_id = "tip-stt-cached"
    jobs[job_id] = Job(
        status="complete",
        step="indexing",
        result={
            "status": "ready",
            "source": "stt",
            "lang": "vi",
            "segments": [{"start": 0.0, "end": 1.0, "text": "xin chào"}],
        },
        error=None,
    )
    svc._tip_video_jobs["abc123"] = job_id

    # Sabotage yt-dlp — if the fast path doesn't kick in, this will throw.
    def boom(*a, **kw):
        raise AssertionError("fast path failed — yt-dlp was called")
    monkeypatch.setattr(svc, "check_video_duration", boom)
    monkeypatch.setattr(svc, "fetch_youtube_subtitles", boom)

    resp = client.get("/api/tips/transcript/abc123")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ready"
    assert body["source"] == "stt"
    assert body["lang"] == "vi"
    assert len(body["segments"]) == 1


def test_get_transcript_fast_path_resumes_in_flight_job(client, monkeypatch):
    """If an STT job is still processing for the video, return 202 with
    the existing jobId — frontend resumes polling."""
    from app.job_store import Job, jobs
    from app.tips.services import transcript as svc

    jobs.clear()
    svc._tip_video_jobs.clear()

    job_id = "tip-stt-inflight"
    jobs[job_id] = Job(
        status="processing",
        step="transcription",
        result=None,
        error=None,
    )
    svc._tip_video_jobs["abc123"] = job_id

    def boom(*a, **kw):
        raise AssertionError("fast path failed — yt-dlp was called")
    monkeypatch.setattr(svc, "check_video_duration", boom)
    monkeypatch.setattr(svc, "fetch_youtube_subtitles", boom)

    resp = client.get("/api/tips/transcript/abc123")
    assert resp.status_code == 202
    body = resp.json()
    assert body["status"] == "pending"
    assert body["jobId"] == job_id
