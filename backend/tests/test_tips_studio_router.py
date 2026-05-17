from __future__ import annotations

from unittest.mock import AsyncMock

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_post_studio_summary_happy(monkeypatch):
    fake = {"abstract": "It is about tones.", "takeaways": ["a", "b", "c"]}
    mock_gen = AsyncMock(return_value=fake)
    monkeypatch.setattr("app.tips.router._studio_svc.generate_studio_artifact", mock_gen)

    resp = client.post(
        "/api/tips/studio/summary",
        json={"video_id": "abc123", "transcript": "hello world", "locale": "en"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["abstract"] == "It is about tones."
    assert len(body["takeaways"]) == 3


def test_post_studio_invalid_kind_returns_400(monkeypatch):
    resp = client.post(
        "/api/tips/studio/notreal",
        json={"video_id": "abc123", "transcript": "x", "locale": "en"},
    )
    assert resp.status_code == 400


def test_post_studio_empty_transcript_returns_422(monkeypatch):
    resp = client.post(
        "/api/tips/studio/summary",
        json={"video_id": "abc123", "transcript": "", "locale": "en"},
    )
    # Pydantic field validation fails before reaching service
    assert resp.status_code in (400, 422)


def test_post_studio_invalid_locale_returns_422(monkeypatch):
    resp = client.post(
        "/api/tips/studio/summary",
        json={"video_id": "abc123", "transcript": "x", "locale": "fr"},
    )
    assert resp.status_code in (400, 422)


def test_post_studio_upstream_5xx_returns_502(monkeypatch):
    mock_gen = AsyncMock(side_effect=RuntimeError("openrouter down"))
    monkeypatch.setattr("app.tips.router._studio_svc.generate_studio_artifact", mock_gen)

    resp = client.post(
        "/api/tips/studio/summary",
        json={"video_id": "abc123", "transcript": "hi", "locale": "en"},
    )
    assert resp.status_code == 502


def test_post_studio_cards_returns_valid_cards(monkeypatch):
    fake = {
        "cards": [
            {"id": "le-guo", "front": "了 vs 过?", "rule": "Completed action vs experience.",
             "example": "我吃了 vs 我吃过", "trap": "Not interchangeable."},
        ]
    }
    mock_gen = AsyncMock(return_value=fake)
    monkeypatch.setattr("app.tips.router._studio_svc.generate_studio_artifact", mock_gen)

    resp = client.post(
        "/api/tips/studio/cards",
        json={"video_id": "abc123", "transcript": "lesson on le and guo", "locale": "en"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["cards"]) == 1
    assert body["cards"][0]["id"] == "le-guo"
