import pytest
from unittest.mock import AsyncMock, patch
from httpx import AsyncClient, ASGITransport
from app.main import app


@pytest.mark.asyncio
async def test_tts_returns_audio():
    """POST /api/tts proxies to Minimax and returns audio/mpeg."""
    fake_mp3 = b"\xff\xfb\x90\x00" * 10

    with patch("app.routers.tts.synthesize_speech", new_callable=AsyncMock, return_value=fake_mp3):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/tts",
                json={"text": "你好", "minimax_api_key": "test-key"},
            )

    assert response.status_code == 200
    assert response.headers["content-type"] == "audio/mpeg"
    assert response.content == fake_mp3


@pytest.mark.asyncio
async def test_tts_rejects_empty_text():
    """POST /api/tts returns 400 when text is empty."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/tts",
            json={"text": "", "minimax_api_key": "test-key"},
        )
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_tts_rejects_whitespace_only_text():
    """POST /api/tts returns 400 when text is whitespace only."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/tts",
            json={"text": "   ", "minimax_api_key": "test-key"},
        )
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_tts_returns_502_on_minimax_error():
    """POST /api/tts returns 502 when Minimax API call fails."""
    with patch(
        "app.routers.tts.synthesize_speech",
        new_callable=AsyncMock,
        side_effect=RuntimeError("Invalid API key"),
    ):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/tts",
                json={"text": "你好", "minimax_api_key": "bad-key"},
            )
    assert response.status_code == 502
