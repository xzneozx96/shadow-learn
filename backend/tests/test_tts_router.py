# backend/tests/test_tts_router.py
"""Tests for TTS router endpoints."""

from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.keys.crypto import encrypt
from app.keys.models import Provider, ProviderKey
from app.main import app

pytestmark = [pytest.mark.asyncio(loop_scope="session"), pytest.mark.usefixtures("stored_user")]


async def test_get_provider_returns_provider_name(mock_tts_provider):
    """GET /api/tts/provider returns the active provider name."""
    app.state.tts_provider_name = "azure"
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/tts/provider")

    assert response.status_code == 200
    assert response.json() == {"provider": "azure"}


async def test_get_provider_returns_minimax_when_set(mock_tts_provider):
    """GET /api/tts/provider returns 'minimax' when provider is minimax."""
    app.state.tts_provider_name = "minimax"
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/tts/provider")

    assert response.status_code == 200
    assert response.json() == {"provider": "minimax"}


async def test_tts_azure_returns_audio(mock_tts_provider, provider_env):
    fake_mp3 = b"\xff\xfb\x90\x00" * 10
    mock_tts_provider.synthesize = AsyncMock(return_value=fake_mp3)
    app.state.tts_provider_name = "azure"

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/api/tts", json={"text": "你好"})

    assert response.status_code == 200
    assert response.headers["content-type"] == "audio/mpeg"
    assert response.content == fake_mp3


async def test_tts_azure_returns_400_when_keys_missing(mock_tts_provider):
    app.state.tts_provider_name = "azure"

    transport = ASGITransport(app=app)
    with patch("app.keys.service.settings") as mock_settings:
        mock_settings.azure_speech_key = ""
        mock_settings.azure_speech_region = ""
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post("/api/tts", json={"text": "你好"})

    assert response.status_code == 400
    assert response.json()["detail"] == "No Azure Speech key configured. Add one in Settings."


async def test_tts_uses_server_fallback_key_without_a_saved_key(mock_tts_provider, provider_env):
    mock_tts_provider.synthesize = AsyncMock(return_value=b"audio")
    app.state.tts_provider_name = "azure"

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/api/tts", json={"text": "你好"})

    assert response.status_code == 200
    call_keys = mock_tts_provider.synthesize.call_args[0][1]
    assert call_keys == {"azure_speech_key": "env-azure-key", "azure_speech_region": "eastus"}


async def test_tts_uses_the_saved_key_over_the_server_key(mock_tts_provider, provider_env, stored_user, db_session):
    db_session.add(
        ProviderKey(user_id=stored_user.id, provider=Provider.azure_speech, ciphertext=encrypt("my-az-key"), region="westus")
    )
    await db_session.commit()
    mock_tts_provider.synthesize = AsyncMock(return_value=b"audio")
    app.state.tts_provider_name = "azure"

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/api/tts", json={"text": "你好"})

    assert response.status_code == 200
    call_keys = mock_tts_provider.synthesize.call_args[0][1]
    assert call_keys == {"azure_speech_key": "my-az-key", "azure_speech_region": "westus"}


async def test_tts_rejects_a_key_in_the_body(mock_tts_provider, provider_env):
    app.state.tts_provider_name = "azure"

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/api/tts", json={"text": "你好", "azure_speech_key": "x"})

    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"] == ["body", "azure_speech_key"]


async def test_tts_minimax_returns_audio(mock_tts_provider):
    """POST /api/tts with MiniMax key returns audio/mpeg."""
    fake_mp3 = b"\xff\xfb\x90\x00" * 10
    mock_tts_provider.synthesize = AsyncMock(return_value=fake_mp3)
    app.state.tts_provider_name = "minimax"

    transport = ASGITransport(app=app)
    with patch("app.tts.router.settings.minimax_api_key", "test-key"):
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post("/api/tts", json={"text": "你好"})

    assert response.status_code == 200
    assert response.content == fake_mp3


async def test_tts_minimax_returns_400_when_key_missing(mock_tts_provider):
    """POST /api/tts returns 400 when MiniMax key is absent and provider is minimax."""
    app.state.tts_provider_name = "minimax"

    transport = ASGITransport(app=app)
    with patch("app.tts.router.settings") as mock_settings:
        mock_settings.minimax_api_key = ""
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post("/api/tts", json={"text": "你好"})

    assert response.status_code == 400
    assert "MiniMax" in response.json()["detail"]


async def test_tts_rejects_empty_text(mock_tts_provider):
    """POST /api/tts returns 400 when text is empty (text validated before keys)."""
    app.state.tts_provider_name = "azure"

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/api/tts", json={"text": ""})

    assert response.status_code == 400


async def test_tts_rejects_oversized_text(mock_tts_provider):
    """POST /api/tts returns 400 when text exceeds 2,000 chars."""
    app.state.tts_provider_name = "azure"

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/api/tts", json={"text": "a" * 2_001})

    assert response.status_code == 400


async def test_tts_returns_502_on_provider_error(mock_tts_provider, provider_env):
    """POST /api/tts returns 502 when provider raises RuntimeError."""
    mock_tts_provider.synthesize = AsyncMock(side_effect=RuntimeError("Azure key invalid"))
    app.state.tts_provider_name = "azure"

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/api/tts", json={"text": "你好"})

    assert response.status_code == 502


async def test_tts_endpoint_passes_minimax_voice_id_to_provider(mock_tts_provider):
    """POST /api/tts threads minimax_voice_id into provider.synthesize()."""
    fake_mp3 = b"\xff\xfb\x90\x00" * 10
    mock_tts_provider.synthesize = AsyncMock(return_value=fake_mp3)
    app.state.tts_provider_name = "minimax"

    transport = ASGITransport(app=app)
    with patch("app.tts.router.settings.minimax_api_key", "test-key"):
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/tts",
                json={"text": "你好", "minimax_voice_id": "Chinese (Mandarin)_Crisp_Girl"},
            )

    assert response.status_code == 200
    call_kwargs = mock_tts_provider.synthesize.call_args
    assert call_kwargs.kwargs.get("voice_id") == "Chinese (Mandarin)_Crisp_Girl"
