"""Tests for /api/transcription/session — origin check, rate limit, Gladia call shape."""

from __future__ import annotations

import pytest
import respx
from fastapi.middleware.cors import CORSMiddleware
from fastapi.testclient import TestClient
from httpx import Response

from app.main import app
from app.settings import settings
from app.transcription import router as transcription_router_module


@pytest.fixture(autouse=True)
def _reset_state(monkeypatch: pytest.MonkeyPatch):
    """Reset rate-limit buckets and allow the test client's origin by default."""
    transcription_router_module._ip_buckets.clear()
    monkeypatch.setattr(settings, "frontend_origin_allowlist", ["http://testserver"])
    monkeypatch.setattr(settings, "frontend_origin_regex", "")
    monkeypatch.setattr(settings, "gladia_api_keys", ["test-key"])
    yield
    transcription_router_module._ip_buckets.clear()


@pytest.fixture
def client() -> TestClient:
    return TestClient(app, headers={"Origin": "http://testserver"})


@respx.mock
def test_session_returns_url_on_success(client: TestClient) -> None:
    respx.post("https://api.gladia.io/v2/live").mock(
        return_value=Response(201, json={"id": "abc", "url": "wss://gladia.io/v2/live?token=xyz"})
    )
    response = client.post("/api/transcription/session?language=zh-CN")
    assert response.status_code == 200
    assert response.json() == {"url": "wss://gladia.io/v2/live?token=xyz"}


@respx.mock
def test_session_uses_auto_detect_with_code_switching(client: TestClient) -> None:
    route = respx.post("https://api.gladia.io/v2/live").mock(
        return_value=Response(201, json={"id": "abc", "url": "wss://gladia.io/v2/live?token=t"})
    )
    client.post("/api/transcription/session")
    request_body = route.calls.last.request.read().decode().replace(" ", "")
    assert '"languages":[]' in request_body
    assert '"code_switching":true' in request_body


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


@respx.mock
def test_origin_check_allows_regex_match(monkeypatch: pytest.MonkeyPatch, client: TestClient) -> None:
    monkeypatch.setattr(settings, "frontend_origin_allowlist", ["https://shadowlearn.app"])
    monkeypatch.setattr(settings, "frontend_origin_regex", r"https://.*\.vercel\.app")
    respx.post("https://api.gladia.io/v2/live").mock(
        return_value=Response(201, json={"id": "a", "url": "wss://x"})
    )
    allowed = client.post("/api/transcription/session", headers={"Origin": "https://pr-12.vercel.app"})
    rejected = client.post("/api/transcription/session", headers={"Origin": "https://evil.example"})
    assert allowed.status_code == 200
    assert rejected.status_code == 403


def test_origin_check_rejects_everything_when_allowlist_empty(monkeypatch: pytest.MonkeyPatch, client: TestClient) -> None:
    monkeypatch.setattr(settings, "frontend_origin_allowlist", [])
    response = client.post("/api/transcription/session")
    assert response.status_code == 403


def test_origin_rule_matches_the_cors_middleware(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "frontend_origin_allowlist", ["https://shadowlearn.app"])
    monkeypatch.setattr(settings, "frontend_origin_regex", r"https://.*\.vercel\.app")
    cors = CORSMiddleware(
        app=None,
        allow_origins=settings.frontend_origin_allowlist,
        allow_origin_regex=settings.frontend_origin_regex or None,
    )
    for origin in ["https://shadowlearn.app", "https://pr-12.vercel.app", "https://evil.example", "https://x.vercel.app.evil"]:
        assert settings.origin_allowed(origin) == cors.is_allowed_origin(origin), origin
