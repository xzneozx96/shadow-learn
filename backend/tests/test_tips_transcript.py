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
