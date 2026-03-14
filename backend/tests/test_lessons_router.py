import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app


@pytest.mark.asyncio
async def test_generate_lesson_rejects_missing_url():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/lessons/generate",
            json={
                "source": "youtube",
                "youtube_url": None,
                "translation_languages": ["en"],
                "openrouter_api_key": "key",
                "openrouter_model": "model",
                "elevenlabs_api_key": "key",
            },
        )
        assert response.status_code == 400


@pytest.mark.asyncio
async def test_generate_lesson_rejects_invalid_source():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/lessons/generate",
            json={
                "source": "invalid",
                "translation_languages": ["en"],
                "openrouter_api_key": "key",
                "openrouter_model": "model",
                "elevenlabs_api_key": "key",
            },
        )
        assert response.status_code == 422
