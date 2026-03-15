import io

import pytest
from httpx import ASGITransport, AsyncClient

import app.jobs as jobs_module
from app.main import app


@pytest.fixture(autouse=True)
def clear_jobs():
    jobs_module.jobs.clear()
    yield
    jobs_module.jobs.clear()


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


@pytest.mark.asyncio
async def test_generate_lesson_accepts_deepgram_key_in_body():
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
async def test_generate_lesson_youtube_returns_job_id():
    """Valid YouTube request returns a job_id immediately; pipeline runs in background."""
    from unittest.mock import AsyncMock, patch

    with (
        patch("app.routers.lessons.validate_youtube_url", return_value="abc123"),
        patch("app.routers.lessons._process_youtube_lesson", new=AsyncMock()),
    ):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/lessons/generate",
                json={
                    "source": "youtube",
                    "youtube_url": "https://www.youtube.com/watch?v=abc123",
                    "translation_languages": ["en"],
                    "openai_api_key": "sk-test",
                    "deepgram_api_key": "dg-test",
                    "model": "gpt-4o-mini",
                },
            )
    assert response.status_code == 200
    data = response.json()
    assert "job_id" in data
    assert isinstance(data["job_id"], str)
    assert len(data["job_id"]) > 0


@pytest.mark.asyncio
async def test_get_video_serves_and_deletes_file(tmp_path):
    """GET /api/lessons/video/{filename} streams the file and deletes it."""
    import app.routers.lessons as lessons_module

    video_file = tmp_path / "test.mp4"
    video_file.write_bytes(b"fake video content")

    original_temp_dir = lessons_module._TEMP_DIR
    lessons_module._TEMP_DIR = tmp_path
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/lessons/video/test.mp4")
        assert response.status_code == 200
        assert response.content == b"fake video content"
        assert not video_file.exists()
    finally:
        lessons_module._TEMP_DIR = original_temp_dir


@pytest.mark.asyncio
async def test_get_video_returns_404_for_missing_file():
    """GET /api/lessons/video/{filename} returns 404 when file is not found."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/lessons/video/nonexistent.mp4")
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_generate_lesson_upload_returns_job_id():
    """Valid upload request returns a job_id immediately."""
    from unittest.mock import AsyncMock, patch

    with patch("app.routers.lessons._process_upload_lesson", new=AsyncMock()):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/lessons/generate-upload",
                files={"file": ("test.mp4", io.BytesIO(b"fake"), "video/mp4")},
                data={
                    "translation_languages": "en",
                    "openai_api_key": "sk-test",
                    "deepgram_api_key": "dg-test",
                    "model": "gpt-4o-mini",
                },
            )
    assert response.status_code == 200
    data = response.json()
    assert "job_id" in data
