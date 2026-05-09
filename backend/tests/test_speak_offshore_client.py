"""Tests for the China-side offshore client (forwards Gemini calls)."""
from unittest.mock import AsyncMock, patch

import httpx
import pytest
import respx

from app.speak.offshore_client import (
    OFFSHORE_PATH,
    OffshoreConfigError,
    call_offshore_gemini,
)
from app.speak.generation import GenerationError


BASE_URL = "https://offshore.example.test"
TOKEN = "uuid-token-abc"
ENDPOINT = f"{BASE_URL}{OFFSHORE_PATH}"


@pytest.fixture
def offshore_settings(monkeypatch):
    from app.settings import settings

    monkeypatch.setattr(settings, "offshore_base_url", BASE_URL)
    monkeypatch.setattr(settings, "offshore_internal_token", TOKEN)
    return settings


@respx.mock
async def test_returns_text_on_200(offshore_settings):
    respx.post(ENDPOINT).mock(return_value=httpx.Response(200, json={"text": "ai-output"}))
    async with httpx.AsyncClient() as client:
        out = await call_offshore_gemini(prompt="hi", google_key="k", client=client)
    assert out == "ai-output"


@respx.mock
async def test_sends_bearer_header(offshore_settings):
    captured = {}

    def _capture(request):
        captured["auth"] = request.headers.get("Authorization")
        return httpx.Response(200, json={"text": "ok"})

    respx.post(ENDPOINT).mock(side_effect=_capture)
    async with httpx.AsyncClient() as client:
        await call_offshore_gemini(prompt="hi", google_key="k", client=client)
    assert captured["auth"] == f"Bearer {TOKEN}"


@respx.mock
async def test_sends_prompt_and_google_key_body(offshore_settings):
    captured = {}

    def _capture(request):
        captured["body"] = request.read().decode()
        return httpx.Response(200, json={"text": "ok"})

    respx.post(ENDPOINT).mock(side_effect=_capture)
    async with httpx.AsyncClient() as client:
        await call_offshore_gemini(prompt="my prompt", google_key="my-key", client=client)
    assert "my prompt" in captured["body"]
    assert "my-key" in captured["body"]


async def test_raises_when_base_url_unset():
    from app.settings import settings

    # No monkeypatch fixture — base_url empty.
    settings.offshore_base_url = ""
    async with httpx.AsyncClient() as client:
        with pytest.raises(OffshoreConfigError):
            await call_offshore_gemini(prompt="hi", google_key="k", client=client)


@respx.mock
async def test_401_raises_generation_error_no_retry(offshore_settings):
    route = respx.post(ENDPOINT).mock(return_value=httpx.Response(401, json={"error": "auth"}))
    async with httpx.AsyncClient() as client:
        with pytest.raises(GenerationError) as exc:
            await call_offshore_gemini(prompt="hi", google_key="k", client=client)
    assert "auth" in str(exc.value).lower()
    assert route.call_count == 1


@respx.mock
async def test_400_raises_generation_error_no_retry(offshore_settings):
    route = respx.post(ENDPOINT).mock(
        return_value=httpx.Response(400, json={"error": "bad_input", "detail": "x"})
    )
    async with httpx.AsyncClient() as client:
        with pytest.raises(GenerationError):
            await call_offshore_gemini(prompt="hi", google_key="k", client=client)
    assert route.call_count == 1


@respx.mock
async def test_503_raises_immediately_no_retry(offshore_settings):
    """503 from offshore means it already exhausted Gemini retries; don't re-amplify."""
    route = respx.post(ENDPOINT).mock(return_value=httpx.Response(503))
    async with httpx.AsyncClient() as client:
        with pytest.raises(GenerationError, match="503"):
            await call_offshore_gemini(prompt="hi", google_key="k", client=client)
    assert route.call_count == 1


@respx.mock
async def test_502_raises_immediately_no_retry(offshore_settings):
    """502 from offshore means Gemini was down; retrying from China amplifies quota waste."""
    route = respx.post(ENDPOINT).mock(return_value=httpx.Response(502))
    async with httpx.AsyncClient() as client:
        with pytest.raises(GenerationError, match="502"):
            await call_offshore_gemini(prompt="hi", google_key="k", client=client)
    assert route.call_count == 1


@respx.mock
async def test_network_timeout_retries(offshore_settings):
    route = respx.post(ENDPOINT).mock(
        side_effect=[
            httpx.TimeoutException("timed out"),
            httpx.Response(200, json={"text": "ok"}),
        ]
    )
    with patch("asyncio.sleep", new_callable=AsyncMock):
        async with httpx.AsyncClient() as client:
            out = await call_offshore_gemini(prompt="hi", google_key="k", client=client)
    assert out == "ok"
    assert route.call_count == 2


@respx.mock
async def test_malformed_response_body_raises_generation_error(offshore_settings):
    """Offshore returned 200 with no `text` field — surface as GenerationError."""
    respx.post(ENDPOINT).mock(return_value=httpx.Response(200, json={"unexpected": "shape"}))
    with patch("asyncio.sleep", new_callable=AsyncMock):
        async with httpx.AsyncClient() as client:
            with pytest.raises(GenerationError):
                await call_offshore_gemini(prompt="hi", google_key="k", client=client)
