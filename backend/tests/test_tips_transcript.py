"""Tests for GET /api/tips/transcript/{video_id}.

Strategy: mock the subtitle service and the STT factory so the test runs
without hitting YouTube or Deepgram. Verify each fallback branch and the
shape of the response, plus the 202+jobId path when transcription is
queued.
"""
from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, patch

import pytest

from app.catalog import service as catalog
from app.job_store import (
    delete_job,
    fail_job,
    get_job,
    get_job_for_key,
    register_job,
    register_keyed_job,
    update_job,
)
from app.tips.services.transcript import fetch_youtube_subtitles

pytestmark = [pytest.mark.asyncio(loop_scope="session"), pytest.mark.usefixtures("db_session")]


@pytest.fixture
def within_duration_limit():
    with patch("app.tips.services.transcript.check_video_duration", new=AsyncMock(return_value=(60.0, False))):
        yield


@pytest.fixture
def no_background_runner(monkeypatch):
    import app.job_store as _js

    monkeypatch.setattr(_js, "_run_with_guard", AsyncMock())


@pytest.fixture
def fake_deepgram(monkeypatch):
    from app.tips.services import transcript as svc

    class FakeProvider:
        async def transcribe(self, *a, **kw):
            return []

    monkeypatch.setattr(svc, "DeepgramSTTProvider", lambda: FakeProvider())


@pytest.mark.usefixtures("within_duration_limit")
async def test_returns_subtitle_segments_when_manual_track_exists(client) -> None:
    fake_segments = [
        {"start": 0.0, "end": 2.5, "text": "Hello"},
        {"start": 2.5, "end": 5.0, "text": "World"},
    ]
    with patch("app.tips.services.transcript.fetch_youtube_subtitles", new=AsyncMock(return_value=("en", fake_segments))):
        resp = await client.get("/api/tips/transcript/abc123")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ready"
    assert body["source"] == "subtitle"
    assert body["lang"] == "en"
    assert body["segments"] == fake_segments


@pytest.mark.usefixtures("within_duration_limit")
async def test_returns_202_with_job_id_when_stt_falls_back(client) -> None:
    with patch("app.tips.services.transcript.fetch_youtube_subtitles", new=AsyncMock(return_value=(None, None))), \
         patch("app.tips.services.transcript.kick_off_stt_job", new=AsyncMock(return_value="job-42")):
        resp = await client.get("/api/tips/transcript/abc123")
    assert resp.status_code == 202
    body = resp.json()
    assert body["status"] == "pending"
    assert body["jobId"] == "job-42"


@pytest.mark.usefixtures("within_duration_limit")
async def test_returns_404_when_neither_subtitle_nor_stt_available(client) -> None:
    with patch("app.tips.services.transcript.fetch_youtube_subtitles", new=AsyncMock(return_value=(None, None))), \
         patch("app.tips.services.transcript.kick_off_stt_job", new=AsyncMock(return_value=None)):
        resp = await client.get("/api/tips/transcript/abc123")
    assert resp.status_code == 404
    assert resp.json()["status"] == "unavailable"


async def test_validates_video_id_format(client) -> None:
    resp = await client.get("/api/tips/transcript/" + "x" * 64)
    assert resp.status_code == 400


async def test_get_transcript_blocks_over_30_min_video(client) -> None:
    async def fake_check(_video_id: str) -> tuple[float, bool]:
        return (35 * 60, True)

    with patch("app.tips.services.transcript.check_video_duration", new=fake_check):
        resp = await client.get("/api/tips/transcript/abc123")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "too_long"
    assert body["durationSec"] == 35 * 60
    assert body["limitSec"] == 30 * 60


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


@pytest.mark.usefixtures("fake_deepgram", "no_background_runner")
async def test_kick_off_stt_job_dedupes_same_video():
    """Two calls for the same video_id while the first job is still processing
    must return the same job_id and only spawn one background task."""
    from app.tips.services import transcript as svc

    job_id_1 = await svc.kick_off_stt_job("abc123")
    assert job_id_1 is not None
    assert await get_job_for_key("tip-stt:abc123") == job_id_1

    job_id_2 = await svc.kick_off_stt_job("abc123")
    assert job_id_2 == job_id_1, "second call must reuse the in-flight job"


@pytest.mark.usefixtures("fake_deepgram", "no_background_runner")
async def test_kick_off_stt_job_spawns_fresh_after_error():
    """If the previous job for a video failed, a new call must spawn fresh."""
    from app.tips.services import transcript as svc

    first = await svc.kick_off_stt_job("abc123")
    await fail_job(first, "deepgram blew up")

    second = await svc.kick_off_stt_job("abc123")
    assert second is not None
    assert second != first, "errored job must NOT be reused"


@pytest.mark.usefixtures("fake_deepgram", "no_background_runner")
async def test_kick_off_stt_job_spawns_fresh_after_prune():
    """If the job for a video was pruned by TTL, spawn fresh."""
    from app.tips.services import transcript as svc

    first = await svc.kick_off_stt_job("abc123")
    await delete_job(first)

    second = await svc.kick_off_stt_job("abc123")
    assert second is not None
    assert second != first
    assert await get_job_for_key("tip-stt:abc123") == second


@pytest.mark.usefixtures("fake_deepgram")
async def test_stt_job_writes_the_catalog_and_removes_its_temp_files(monkeypatch, tmp_path):
    from app.tips.services import transcript as svc

    video = tmp_path / "v.mp4"
    audio = tmp_path / "a.mp3"
    video.write_bytes(b"v")
    audio.write_bytes(b"a")

    class OneSegment:
        async def transcribe(self, *a, **kw):
            return [{"start": 0.0, "end": 1.0, "text": "hi"}]

    monkeypatch.setattr(svc, "DeepgramSTTProvider", lambda: OneSegment())
    monkeypatch.setattr(svc, "get_youtube_metadata", AsyncMock(return_value={"language": "en"}))
    monkeypatch.setattr(svc, "download_youtube_video", AsyncMock(return_value=video))
    monkeypatch.setattr(svc, "extract_audio_from_upload", AsyncMock(return_value=audio))

    job_id = await svc.kick_off_stt_job("abc123")
    for _ in range(200):
        job = await get_job(job_id)
        if job.status != "processing":
            break
        await asyncio.sleep(0.01)

    assert job.status == "complete"
    assert job.result == {"status": "ready", "source": "stt", "lang": "en", "segments": [{"start": 0.0, "end": 1.0, "text": "hi"}]}
    assert await catalog.get_tip_transcript("abc123") == {k: v for k, v in job.result.items() if k != "status"}
    assert not video.exists()
    assert not audio.exists()


async def test_get_transcript_fast_path_reads_the_catalog(client, monkeypatch):
    """A transcript already in the catalog is returned without any yt-dlp probe."""
    from app.tips.services import transcript as svc

    await catalog.put_tip_transcript(
        "abc123", {"source": "stt", "lang": "vi", "segments": [{"start": 0.0, "end": 1.0, "text": "xin chào"}]}
    )

    def boom(*a, **kw):
        raise AssertionError("fast path failed — yt-dlp was called")
    monkeypatch.setattr(svc, "check_video_duration", boom)
    monkeypatch.setattr(svc, "fetch_youtube_subtitles", boom)

    resp = await client.get("/api/tips/transcript/abc123")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ready"
    assert body["source"] == "stt"
    assert body["lang"] == "vi"
    assert len(body["segments"]) == 1


async def test_get_transcript_fast_path_resumes_in_flight_job(client, monkeypatch):
    """If an STT job is still processing for the video, return 202 with
    the existing jobId — frontend resumes polling."""
    from app.tips.services import transcript as svc

    job_id = await register_job(id_prefix="tip-stt", user_id=None)
    await update_job(job_id, step="transcription")
    await register_keyed_job("tip-stt:abc123", job_id)

    def boom(*a, **kw):
        raise AssertionError("fast path failed — yt-dlp was called")
    monkeypatch.setattr(svc, "check_video_duration", boom)
    monkeypatch.setattr(svc, "fetch_youtube_subtitles", boom)

    resp = await client.get("/api/tips/transcript/abc123")
    assert resp.status_code == 202
    body = resp.json()
    assert body["status"] == "pending"
    assert body["jobId"] == job_id
