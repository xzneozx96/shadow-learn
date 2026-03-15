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
                "openai_api_key": "key",
                "model": "gpt-4o-mini",
            },
        )
        assert response.status_code == 400


@pytest.mark.asyncio
async def test_generate_lesson_accepts_deepgram_key_in_body():
    """LessonRequest with deepgram_api_key should be accepted (422-free)."""
    from app.models import LessonRequest
    req = LessonRequest(
        source="youtube",
        youtube_url="https://www.youtube.com/watch?v=test",
        translation_languages=["en"],
        openai_api_key="sk-test",
        deepgram_api_key="dg-test",
    )
    assert req.deepgram_api_key == "dg-test"


@pytest.mark.asyncio
async def test_generate_lesson_deepgram_key_defaults_to_none():
    """deepgram_api_key is optional and defaults to None."""
    from app.models import LessonRequest
    req = LessonRequest(
        source="youtube",
        youtube_url="https://www.youtube.com/watch?v=test",
        translation_languages=["en"],
        openai_api_key="sk-test",
    )
    assert req.deepgram_api_key is None


@pytest.mark.asyncio
async def test_generate_lesson_rejects_invalid_source():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/lessons/generate",
            json={
                "source": "invalid",
                "translation_languages": ["en"],
                "openai_api_key": "key",
                "model": "gpt-4o-mini",
            },
        )
        assert response.status_code == 422
