import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_session_start_requires_language_and_level():
    resp = client.post("/api/speak/session-start", json={
        "google_key": "test-key",
        "persona_id": "friendly_buddy",
        "situation_id": "ordering_food",
        # missing target_language, proficiency_level
    })
    assert resp.status_code == 422


def test_session_start_with_valid_payload_returns_token():
    resp = client.post("/api/speak/session-start", json={
        "google_key": "test-key",
        "persona_id": "friendly_buddy",
        "situation_id": "ordering_food",
        "target_language": "zh-CN",
        "proficiency_level": "beginner",
    })
    assert resp.status_code == 200
    body = resp.json()
    assert "livekit_token" in body
    assert "session_id" in body


def test_session_start_rejects_unsupported_persona_language_combo():
    resp = client.post("/api/speak/session-start", json={
        "google_key": "test-key",
        "persona_id": "taxi_driver",  # zh-CN only
        "situation_id": "ordering_food",
        "target_language": "ja",
        "proficiency_level": "beginner",
    })
    assert resp.status_code == 400


def test_session_start_rejects_unknown_situation():
    resp = client.post("/api/speak/session-start", json={
        "google_key": "test-key",
        "persona_id": "friendly_buddy",
        "situation_id": "nonexistent_situation",
        "target_language": "zh-CN",
        "proficiency_level": "beginner",
    })
    assert resp.status_code == 404
