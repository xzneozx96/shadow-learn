import io
from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

import app.jobs as jobs_module
from app.main import app


@pytest.fixture(autouse=True)
def clear_jobs():
    jobs_module.jobs.clear()
    yield
    jobs_module.jobs.clear()


@pytest.fixture(autouse=True)
def mock_stt_provider():
    provider = AsyncMock()
    provider.transcribe = AsyncMock(return_value=[])
    app.state.stt_provider = provider
    yield provider
    del app.state.stt_provider


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
                "openrouter_api_key": "key",
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
        openrouter_api_key="sk-test",
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
                    "openrouter_api_key": "sk-test",
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
async def test_generate_lesson_accepts_azure_keys_in_body():
    from app.models import LessonRequest

    req = LessonRequest(
        source="youtube",
        youtube_url="https://www.youtube.com/watch?v=test",
        translation_languages=["en"],
        openrouter_api_key="sk-test",
        azure_speech_key="az-key",
        azure_speech_region="eastus",
    )
    assert req.azure_speech_key == "az-key"
    assert req.azure_speech_region == "eastus"


@pytest.mark.asyncio
async def test_generate_lesson_upload_accepts_azure_form_fields():
    """generate-upload accepts azure_speech_key and azure_speech_region as form fields."""
    from unittest.mock import AsyncMock, patch

    with patch("app.routers.lessons._process_upload_lesson", new=AsyncMock()):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/lessons/generate-upload",
                files={"file": ("test.mp4", io.BytesIO(b"fake"), "video/mp4")},
                data={
                    "translation_languages": "en",
                    "openrouter_api_key": "sk-test",
                    "azure_speech_key": "az-key",
                    "azure_speech_region": "eastus",
                },
            )
    assert response.status_code == 200
    assert "job_id" in response.json()


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
async def test_shared_pipeline_assembles_text_and_romanization_keys():
    """Assembled segment dicts must use 'text'/'romanization', not 'chinese'/'pinyin'."""
    from app.routers.lessons import _shared_pipeline
    import app.jobs as jobs_module
    from app.jobs import Job
    from unittest.mock import MagicMock

    job_id = "test-field-rename"
    jobs_module.jobs[job_id] = Job(status="processing", step="queued", result=None, error=None)

    raw_segments = [{"id": 0, "start": 0.0, "end": 1.0, "text": "Hello world"}]

    mock_romanizer = MagicMock()
    mock_romanizer.romanize_text.return_value = ""

    with (
        patch("app.routers.lessons.translate_segments", new=AsyncMock(return_value=raw_segments)),
        patch("app.routers.lessons.extract_vocabulary", new=AsyncMock(return_value={})),
        patch("app.routers.lessons.get_romanization_provider", return_value=mock_romanizer),
    ):
        await _shared_pipeline(
            job_id, raw_segments, ["es"], "key", "title", "upload", None, 60.0,
            source_language="en",
        )

    result = jobs_module.jobs[job_id].result
    seg = result["lesson"]["segments"][0]
    assert "text" in seg, "assembled segment must use 'text' not 'chinese'"
    assert "chinese" not in seg
    assert "romanization" in seg
    assert "pinyin" not in seg
    del jobs_module.jobs[job_id]


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
                    "openrouter_api_key": "sk-test",
                    "deepgram_api_key": "dg-test",
                    "model": "gpt-4o-mini",
                },
            )
    assert response.status_code == 200
    data = response.json()
    assert "job_id" in data
