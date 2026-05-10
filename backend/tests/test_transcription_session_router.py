"""Tests for /api/transcription/session — origin check, rate limit, Gladia call shape."""

from __future__ import annotations

import pytest
import respx
from fastapi.testclient import TestClient
from httpx import Response

from app.main import app
from app.settings import settings
from app.transcription import router as transcription_router_module


@pytest.fixture(autouse=True)
def _reset_state(monkeypatch: pytest.MonkeyPatch):
    """Reset rate-limit buckets and disable origin check by default."""
    transcription_router_module._ip_buckets.clear()
    monkeypatch.setattr(settings, "frontend_origin_allowlist", [])
    monkeypatch.setattr(settings, "gladia_api_keys", ["test-key"])
    yield
    transcription_router_module._ip_buckets.clear()


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


@respx.mock
def test_session_returns_url_on_success(client: TestClient) -> None:
    respx.post("https://api.gladia.io/v2/live").mock(
        return_value=Response(201, json={"id": "abc", "url": "wss://gladia.io/v2/live?token=xyz"})
    )
    response = client.post("/api/transcription/session?language=zh-CN")
    assert response.status_code == 200
    assert response.json() == {"url": "wss://gladia.io/v2/live?token=xyz"}


@respx.mock
def test_session_maps_language_to_short_form(client: TestClient) -> None:
    route = respx.post("https://api.gladia.io/v2/live").mock(
        return_value=Response(201, json={"id": "abc", "url": "wss://gladia.io/v2/live?token=t"})
    )
    client.post("/api/transcription/session?language=zh-CN")
    request_body = route.calls.last.request.read().decode()
    assert '"languages":["zh"]' in request_body.replace(" ", "")


def test_session_500_when_no_gladia_keys(monkeypatch: pytest.MonkeyPatch, client: TestClient) -> None:
    monkeypatch.setattr(settings, "gladia_api_keys", [])
    response = client.post("/api/transcription/session")
    assert response.status_code == 500
    assert response.json()["detail"] == "Voice input unavailable"


@respx.mock
def test_session_rotates_on_402(monkeypatch: pytest.MonkeyPatch, client: TestClient) -> None:
    monkeypatch.setattr(settings, "gladia_api_keys", ["bad-key", "good-key"])
    respx.post("https://api.gladia.io/v2/live").mock(
        side_effect=[
            Response(402, json={"detail": "quota"}),
            Response(201, json={"id": "abc", "url": "wss://gladia.io/v2/live?token=t"}),
        ]
    )
    response = client.post("/api/transcription/session")
    assert response.status_code == 200
    assert response.json()["url"] == "wss://gladia.io/v2/live?token=t"


@respx.mock
def test_session_502_on_all_keys_exhausted(monkeypatch: pytest.MonkeyPatch, client: TestClient) -> None:
    monkeypatch.setattr(settings, "gladia_api_keys", ["k1", "k2"])
    respx.post("https://api.gladia.io/v2/live").mock(return_value=Response(402, json={"detail": "quota"}))
    response = client.post("/api/transcription/session")
    assert response.status_code == 502


@respx.mock
def test_session_502_on_unexpected_status(client: TestClient) -> None:
    respx.post("https://api.gladia.io/v2/live").mock(return_value=Response(500, text="boom"))
    response = client.post("/api/transcription/session")
    assert response.status_code == 502


def test_origin_check_rejects_when_allowlist_set(monkeypatch: pytest.MonkeyPatch, client: TestClient) -> None:
    monkeypatch.setattr(settings, "frontend_origin_allowlist", ["https://shadowlearn.app"])
    response = client.post("/api/transcription/session", headers={"Origin": "https://evil.com"})
    assert response.status_code == 403


@respx.mock
def test_origin_check_allows_match(monkeypatch: pytest.MonkeyPatch, client: TestClient) -> None:
    monkeypatch.setattr(settings, "frontend_origin_allowlist", ["https://shadowlearn.app"])
    respx.post("https://api.gladia.io/v2/live").mock(
        return_value=Response(201, json={"id": "a", "url": "wss://x"})
    )
    response = client.post("/api/transcription/session", headers={"Origin": "https://shadowlearn.app"})
    assert response.status_code == 200


@respx.mock
def test_rate_limit_blocks_after_20_requests(client: TestClient) -> None:
    respx.post("https://api.gladia.io/v2/live").mock(
        return_value=Response(201, json={"id": "a", "url": "wss://x"})
    )
    for _ in range(20):
        ok = client.post("/api/transcription/session")
        assert ok.status_code == 200
    blocked = client.post("/api/transcription/session")
    assert blocked.status_code == 429
