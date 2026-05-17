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
