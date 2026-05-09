"""Tests for offshore FastAPI proxy."""
import os
import sys
from unittest.mock import AsyncMock, patch

import httpx
import respx
from httpx import ASGITransport

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# Set token before importing the app so the dependency closes over it.
os.environ["INTERNAL_TOKEN"] = "test-token-123"

from gemini_client import GEMINI_URL  # noqa: E402
from http_server import app  # noqa: E402


def _client() -> httpx.AsyncClient:
    return httpx.AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://offshore",
    )


def _gemini_ok(text: str = "hello") -> httpx.Response:
    return httpx.Response(
        200,
        json={"candidates": [{"content": {"parts": [{"text": text}]}}]},
    )


# ----------------------------------------------------------------------
# /healthz
# ----------------------------------------------------------------------

async def test_healthz_returns_ok():
    async with _client() as c:
        resp = await c.get("/healthz")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


# ----------------------------------------------------------------------
# auth
# ----------------------------------------------------------------------

async def test_generate_content_requires_auth_header():
    async with _client() as c:
        resp = await c.post(
            "/internal/gemini/generate-content",
            json={"prompt": "hi", "google_key": "k"},
        )
    assert resp.status_code == 401


async def test_generate_content_rejects_wrong_token():
    async with _client() as c:
        resp = await c.post(
            "/internal/gemini/generate-content",
            headers={"Authorization": "Bearer wrong-token"},
            json={"prompt": "hi", "google_key": "k"},
        )
    assert resp.status_code == 401


async def test_generate_content_rejects_missing_bearer_prefix():
    async with _client() as c:
        resp = await c.post(
            "/internal/gemini/generate-content",
            headers={"Authorization": "test-token-123"},
            json={"prompt": "hi", "google_key": "k"},
        )
    assert resp.status_code == 401


# ----------------------------------------------------------------------
# happy path
# ----------------------------------------------------------------------

@respx.mock
async def test_generate_content_returns_text():
    respx.post(GEMINI_URL).mock(return_value=_gemini_ok("ai-output"))
    async with _client() as c:
        resp = await c.post(
            "/internal/gemini/generate-content",
            headers={"Authorization": "Bearer test-token-123"},
            json={"prompt": "scene seed", "google_key": "user-key"},
        )
    assert resp.status_code == 200
    assert resp.json() == {"text": "ai-output"}


@respx.mock
async def test_generate_content_passes_user_key_to_google():
    captured = {}

    def _capture(request):
        captured["key"] = request.headers.get("x-goog-api-key")
        return _gemini_ok("ok")

    respx.post(GEMINI_URL).mock(side_effect=_capture)
    async with _client() as c:
        resp = await c.post(
            "/internal/gemini/generate-content",
            headers={"Authorization": "Bearer test-token-123"},
            json={"prompt": "x", "google_key": "user-supplied"},
        )
    assert resp.status_code == 200
    assert captured["key"] == "user-supplied"


# ----------------------------------------------------------------------
# input validation
# ----------------------------------------------------------------------

async def test_rejects_missing_prompt():
    async with _client() as c:
        resp = await c.post(
            "/internal/gemini/generate-content",
            headers={"Authorization": "Bearer test-token-123"},
            json={"google_key": "k"},
        )
    assert resp.status_code == 422


async def test_rejects_empty_google_key():
    async with _client() as c:
        resp = await c.post(
            "/internal/gemini/generate-content",
            headers={"Authorization": "Bearer test-token-123"},
            json={"prompt": "hi", "google_key": ""},
        )
    assert resp.status_code == 422


# ----------------------------------------------------------------------
# upstream failures
# ----------------------------------------------------------------------

@respx.mock
async def test_returns_502_when_upstream_persistently_5xx():
    respx.post(GEMINI_URL).mock(return_value=httpx.Response(503))
    with patch("asyncio.sleep", new_callable=AsyncMock):
        async with _client() as c:
            resp = await c.post(
                "/internal/gemini/generate-content",
                headers={"Authorization": "Bearer test-token-123"},
                json={"prompt": "hi", "google_key": "k"},
            )
    assert resp.status_code == 502
    assert resp.json()["error"] == "upstream_failed"


@respx.mock
async def test_returns_502_when_upstream_response_malformed():
    respx.post(GEMINI_URL).mock(
        return_value=httpx.Response(200, json={"unexpected": "shape"}),
    )
    with patch("asyncio.sleep", new_callable=AsyncMock):
        async with _client() as c:
            resp = await c.post(
                "/internal/gemini/generate-content",
                headers={"Authorization": "Bearer test-token-123"},
                json={"prompt": "hi", "google_key": "k"},
            )
    assert resp.status_code == 502
    assert resp.json()["error"] == "upstream_failed"


@respx.mock
async def test_propagates_401_from_google_as_401():
    """User-supplied google_key invalid — surface the auth failure to caller."""
    respx.post(GEMINI_URL).mock(return_value=httpx.Response(401))
    async with _client() as c:
        resp = await c.post(
            "/internal/gemini/generate-content",
            headers={"Authorization": "Bearer test-token-123"},
            json={"prompt": "hi", "google_key": "bad-key"},
        )
    assert resp.status_code == 401
    assert resp.json()["error"] == "google_auth_failed"
