# backend/tests/test_tts_router.py
"""Tests for TTS router endpoints."""

import pytest
from unittest.mock import AsyncMock
from httpx import AsyncClient, ASGITransport

from app.main import app


@pytest.mark.asyncio
async def test_get_provider_returns_provider_name(mock_tts_provider):
    """GET /api/tts/provider returns the active provider name."""
    app.state.tts_provider_name = "azure"
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/tts/provider")

    assert response.status_code == 200
    assert response.json() == {"provider": "azure"}


@pytest.mark.asyncio
async def test_get_provider_returns_minimax_when_set(mock_tts_provider):
    """GET /api/tts/provider returns 'minimax' when provider is minimax."""
    app.state.tts_provider_name = "minimax"
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/tts/provider")

    assert response.status_code == 200
    assert response.json() == {"provider": "minimax"}


@pytest.mark.asyncio
async def test_tts_azure_returns_audio(mock_tts_provider):
    """POST /api/tts with Azure keys returns audio/mpeg."""
    fake_mp3 = b"\xff\xfb\x90\x00" * 10
    mock_tts_provider.synthesize = AsyncMock(return_value=fake_mp3)
    app.state.tts_provider_name = "azure"

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/tts",
            json={"text": "你好", "azure_speech_key": "key", "azure_speech_region": "eastus"},
        )

    assert response.status_code == 200
    assert response.headers["content-type"] == "audio/mpeg"
    assert response.content == fake_mp3


@pytest.mark.asyncio
async def test_tts_azure_returns_400_when_keys_missing(mock_tts_provider):
    """POST /api/tts returns 400 when Azure keys are absent and provider is azure."""
    app.state.tts_provider_name = "azure"

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/tts",
            json={"text": "你好"},
        )

    assert response.status_code == 400
    assert "Azure" in response.json()["detail"]


@pytest.mark.asyncio
async def test_tts_minimax_returns_audio(mock_tts_provider):
    """POST /api/tts with MiniMax key returns audio/mpeg."""
    fake_mp3 = b"\xff\xfb\x90\x00" * 10
    mock_tts_provider.synthesize = AsyncMock(return_value=fake_mp3)
    app.state.tts_provider_name = "minimax"

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/tts",
            json={"text": "你好", "minimax_api_key": "test-key"},
        )

    assert response.status_code == 200
    assert response.content == fake_mp3


@pytest.mark.asyncio
async def test_tts_minimax_returns_400_when_key_missing(mock_tts_provider):
    """POST /api/tts returns 400 when MiniMax key is absent and provider is minimax."""
    app.state.tts_provider_name = "minimax"

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/tts",
            json={"text": "你好"},
        )

    assert response.status_code == 400
    assert "MiniMax" in response.json()["detail"]


@pytest.mark.asyncio
async def test_tts_rejects_empty_text(mock_tts_provider):
    """POST /api/tts returns 400 when text is empty (text validated before keys)."""
    app.state.tts_provider_name = "azure"

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/tts",
            json={"text": "", "azure_speech_key": "key", "azure_speech_region": "eastus"},
        )

    assert response.status_code == 400


@pytest.mark.asyncio
async def test_tts_rejects_oversized_text(mock_tts_provider):
    """POST /api/tts returns 400 when text exceeds 2,000 chars."""
    app.state.tts_provider_name = "azure"

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/tts",
            json={"text": "a" * 2_001, "azure_speech_key": "key", "azure_speech_region": "eastus"},
        )

    assert response.status_code == 400


@pytest.mark.asyncio
async def test_tts_uses_server_fallback_key_when_request_key_empty(mock_tts_provider):
    from app.main import app
    from app.config import settings

    mock_tts_provider.synthesize = AsyncMock(return_value=b"audio")
    app.state.tts_provider_name = "azure"
    original_key = settings.azure_speech_key
    original_region = settings.azure_speech_region
    settings.azure_speech_key = "server-az-key"
    settings.azure_speech_region = "eastus"

    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # No keys in request body — should use server fallback
            response = await client.post("/api/tts", json={"text": "你好"})
    finally:
        settings.azure_speech_key = original_key
        settings.azure_speech_region = original_region
    assert response.status_code == 200
    mock_tts_provider.synthesize.assert_called_once()
    call_keys = mock_tts_provider.synthesize.call_args[0][1]
    assert call_keys["azure_speech_key"] == "server-az-key"


@pytest.mark.asyncio
async def test_tts_returns_502_on_provider_error(mock_tts_provider):
    """POST /api/tts returns 502 when provider raises RuntimeError."""
    mock_tts_provider.synthesize = AsyncMock(side_effect=RuntimeError("Azure key invalid"))
    app.state.tts_provider_name = "azure"

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/tts",
            json={"text": "你好", "azure_speech_key": "bad", "azure_speech_region": "eastus"},
        )

    assert response.status_code == 502
