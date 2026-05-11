import io
from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

import app.job_store as jobs_module
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
async def test_generate_lesson_youtube_returns_job_id():
    """Valid YouTube request returns a job_id immediately; pipeline runs in background."""
    from unittest.mock import AsyncMock, patch

    with (
        patch("app.lessons.router.validate_youtube_url", return_value="abc123"),
        patch("app.lessons.router._process_youtube_lesson", new=AsyncMock()),
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

    with patch("app.lessons.router._process_upload_lesson", new=AsyncMock()):
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
    import app.lessons.router as lessons_module

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
    from app.lessons.router import _shared_pipeline
    import app.job_store as jobs_module
    from app.job_store import Job
    from unittest.mock import MagicMock

    job_id = "test-field-rename"
    jobs_module.jobs[job_id] = Job(status="processing", step="queued", result=None, error=None)

    raw_segments = [{"id": 0, "start": 0.0, "end": 1.0, "text": "Hello world"}]

    mock_romanizer = MagicMock()
    mock_romanizer.romanize_text.return_value = ""

    with (
        patch("app.lessons.router.translate_segments", new=AsyncMock(return_value=raw_segments)),
        patch("app.lessons.router.extract_vocabulary", new=AsyncMock(return_value={})),
        patch("app.lessons.router.get_romanization_provider", return_value=mock_romanizer),
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


# --- _process_youtube_lesson: subtitle vs STT branch ---


_FAKE_VTT_BODY = """WEBVTT

00:00:01.000 --> 00:00:03.000
你好世界
"""


def _make_youtube_request(source_language: str = "zh-CN"):
    from app.models import LessonRequest

    return LessonRequest(
        source="youtube",
        youtube_url="https://www.youtube.com/watch?v=abc123",
        translation_languages=["en"],
        openrouter_api_key="sk-test",
        source_language=source_language,
    )


@pytest.mark.asyncio
async def test_youtube_lesson_uses_manual_subtitle_when_available():
    """Manual subtitle in source_language → STT skipped; segments come from VTT."""
    from app.lessons.router import _process_youtube_lesson
    from app.job_store import Job

    job_id = "job-sub-hit"
    jobs_module.jobs[job_id] = Job(status="processing", step="queued", result=None, error=None)
    stt = AsyncMock()
    stt.transcribe = AsyncMock(return_value=[])

    captured_segments = {}

    async def fake_shared(job_id, segments, *args, **kwargs):
        captured_segments["segs"] = segments
        jobs_module.jobs[job_id].status = "complete"
        jobs_module.jobs[job_id].result = {"lesson": {"segments": []}}

    from pathlib import Path

    with (
        patch(
            "app.lessons.router.get_youtube_metadata",
            new=AsyncMock(return_value={"duration": 30.0, "subtitles": {"zh-Hans": [{"ext": "vtt"}]}}),
        ),
        patch(
            "app.lessons.router.download_youtube_video",
            new=AsyncMock(return_value=Path("/tmp/shadowlearn/vid.mp4")),
        ),
        patch(
            "app.lessons.router.download_subtitle_vtt",
            new=AsyncMock(return_value=_FAKE_VTT_BODY),
        ),
        patch("app.lessons.router._shared_pipeline", side_effect=fake_shared),
        patch("app.lessons.router.extract_audio_from_upload", new=AsyncMock()) as mock_extract,
    ):
        await _process_youtube_lesson(_make_youtube_request("zh-CN"), "abc123", job_id, stt)

    stt.transcribe.assert_not_called()
    mock_extract.assert_not_called()
    assert captured_segments["segs"]
    assert captured_segments["segs"][0]["text"] == "你好世界"


@pytest.mark.asyncio
async def test_youtube_lesson_falls_back_to_stt_when_no_manual_track():
    """No manual subtitle in source_language → existing STT pipeline runs."""
    from pathlib import Path

    from app.lessons.router import _process_youtube_lesson
    from app.job_store import Job

    job_id = "job-stt-fallback"
    jobs_module.jobs[job_id] = Job(status="processing", step="queued", result=None, error=None)
    stt = AsyncMock()
    stt.transcribe = AsyncMock(
        return_value=[{"id": 0, "start": 0.0, "end": 1.0, "text": "你好", "word_timings": []}]
    )

    async def fake_shared(*args, **kwargs):
        jobs_module.jobs[job_id].status = "complete"
        jobs_module.jobs[job_id].result = {}

    with (
        patch(
            "app.lessons.router.get_youtube_metadata",
            new=AsyncMock(return_value={"duration": 30.0, "subtitles": {"en": [{"ext": "vtt"}]}}),
        ),
        patch(
            "app.lessons.router.download_youtube_video",
            new=AsyncMock(return_value=Path("/tmp/shadowlearn/vid.mp4")),
        ),
        patch(
            "app.lessons.router.extract_audio_from_upload",
            new=AsyncMock(return_value=Path("/tmp/shadowlearn/vid.mp3")),
        ),
        patch("app.lessons.router._shared_pipeline", side_effect=fake_shared),
        patch("pathlib.Path.unlink"),
    ):
        await _process_youtube_lesson(_make_youtube_request("zh-CN"), "abc123", job_id, stt)

    stt.transcribe.assert_called_once()


@pytest.mark.asyncio
async def test_youtube_lesson_ignores_automatic_captions():
    """Auto-generated captions never trigger the subtitle path."""
    from pathlib import Path

    from app.lessons.router import _process_youtube_lesson
    from app.job_store import Job

    job_id = "job-auto-only"
    jobs_module.jobs[job_id] = Job(status="processing", step="queued", result=None, error=None)
    stt = AsyncMock()
    stt.transcribe = AsyncMock(return_value=[{"id": 0, "start": 0.0, "end": 1.0, "text": "x", "word_timings": []}])

    download_sub = AsyncMock()
    async def fake_shared(*args, **kwargs):
        jobs_module.jobs[job_id].status = "complete"

    with (
        # subtitles dict is empty (auto-only would only appear in automatic_captions, which we never read)
        patch(
            "app.lessons.router.get_youtube_metadata",
            new=AsyncMock(return_value={"duration": 30.0, "subtitles": {}}),
        ),
        patch(
            "app.lessons.router.download_youtube_video",
            new=AsyncMock(return_value=Path("/tmp/shadowlearn/vid.mp4")),
        ),
        patch("app.lessons.router.download_subtitle_vtt", new=download_sub),
        patch(
            "app.lessons.router.extract_audio_from_upload",
            new=AsyncMock(return_value=Path("/tmp/shadowlearn/vid.mp3")),
        ),
        patch("app.lessons.router._shared_pipeline", side_effect=fake_shared),
        patch("pathlib.Path.unlink"),
    ):
        await _process_youtube_lesson(_make_youtube_request("zh-CN"), "abc123", job_id, stt)

    download_sub.assert_not_called()
    stt.transcribe.assert_called_once()


@pytest.mark.asyncio
async def test_youtube_lesson_falls_back_when_subtitle_download_fails():
    """If yt-dlp fails to write the VTT, fall back to STT instead of erroring the job."""
    from pathlib import Path

    from app.lessons.router import _process_youtube_lesson
    from app.job_store import Job

    job_id = "job-sub-download-fails"
    jobs_module.jobs[job_id] = Job(status="processing", step="queued", result=None, error=None)
    stt = AsyncMock()
    stt.transcribe = AsyncMock(return_value=[{"id": 0, "start": 0.0, "end": 1.0, "text": "x", "word_timings": []}])

    async def fake_shared(*args, **kwargs):
        jobs_module.jobs[job_id].status = "complete"

    with (
        patch(
            "app.lessons.router.get_youtube_metadata",
            new=AsyncMock(return_value={"duration": 30.0, "subtitles": {"zh-Hans": [{"ext": "vtt"}]}}),
        ),
        patch(
            "app.lessons.router.download_youtube_video",
            new=AsyncMock(return_value=Path("/tmp/shadowlearn/vid.mp4")),
        ),
        patch(
            "app.lessons.router.download_subtitle_vtt",
            new=AsyncMock(side_effect=FileNotFoundError("no vtt")),
        ),
        patch(
            "app.lessons.router.extract_audio_from_upload",
            new=AsyncMock(return_value=Path("/tmp/shadowlearn/vid.mp3")),
        ),
        patch("app.lessons.router._shared_pipeline", side_effect=fake_shared),
        patch("pathlib.Path.unlink"),
    ):
        await _process_youtube_lesson(_make_youtube_request("zh-CN"), "abc123", job_id, stt)

    stt.transcribe.assert_called_once()
    assert jobs_module.jobs[job_id].status == "complete"


@pytest.mark.asyncio
async def test_youtube_lesson_video_still_downloaded_on_subtitle_hit():
    """Even on subtitle hit, video must be downloaded for playback (media_filename)."""
    from pathlib import Path

    from app.lessons.router import _process_youtube_lesson
    from app.job_store import Job

    job_id = "job-video-still-needed"
    jobs_module.jobs[job_id] = Job(status="processing", step="queued", result=None, error=None)
    stt = AsyncMock()

    captured_kwargs: dict = {}

    async def fake_shared(job_id, segments, *args, **kwargs):
        captured_kwargs.update(kwargs)
        jobs_module.jobs[job_id].status = "complete"

    download_video = AsyncMock(return_value=Path("/tmp/shadowlearn/vid.mp4"))

    with (
        patch(
            "app.lessons.router.get_youtube_metadata",
            new=AsyncMock(return_value={"duration": 30.0, "subtitles": {"zh-Hans": [{"ext": "vtt"}]}}),
        ),
        patch("app.lessons.router.download_youtube_video", new=download_video),
        patch(
            "app.lessons.router.download_subtitle_vtt",
            new=AsyncMock(return_value=_FAKE_VTT_BODY),
        ),
        patch("app.lessons.router._shared_pipeline", side_effect=fake_shared),
    ):
        await _process_youtube_lesson(_make_youtube_request("zh-CN"), "abc123", job_id, stt)

    download_video.assert_called_once()
    assert captured_kwargs.get("media_filename") == "vid.mp4"


@pytest.mark.asyncio
async def test_generate_lesson_upload_returns_job_id():
    """Valid upload request returns a job_id immediately."""
    from unittest.mock import AsyncMock, patch

    with patch("app.lessons.router._process_upload_lesson", new=AsyncMock()):
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


@pytest.fixture()
def mock_tts_provider():
    from unittest.mock import AsyncMock
    provider = AsyncMock()
    provider.synthesize = AsyncMock(return_value=b"fake-mp3-bytes")
    app.state.tts_provider = provider
    yield provider
    if hasattr(app.state, "tts_provider"):
        del app.state.tts_provider


@pytest.mark.asyncio
async def test_generate_blog_lesson_missing_url():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/lessons/generate",
            json={
                "source": "blog",
                "translation_languages": ["en"],
                "openrouter_api_key": "key",
            },
        )
    assert response.status_code == 400
    assert "blog_url" in response.json()["detail"]


@pytest.mark.asyncio
async def test_generate_blog_lesson_returns_job_id(mock_tts_provider):
    from unittest.mock import AsyncMock, patch

    with patch("app.lessons.router._process_blog_lesson", new=AsyncMock()):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/lessons/generate",
                json={
                    "source": "blog",
                    "blog_url": "https://example.com/article",
                    "translation_languages": ["en"],
                    "openrouter_api_key": "sk-test",
                },
            )
    assert response.status_code == 200
    assert "job_id" in response.json()


@pytest.mark.asyncio
async def test_get_audio_returns_404_for_missing_file():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/lessons/audio/nonexistent.mp3")
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_get_audio_streams_and_deletes_file(tmp_path):
    from unittest.mock import patch

    fake_audio = tmp_path / "test.mp3"
    fake_audio.write_bytes(b"fake-audio-content")

    with patch("app.lessons.router._TEMP_DIR", tmp_path):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/lessons/audio/test.mp3")

    assert response.status_code == 200
    assert response.content == b"fake-audio-content"
    assert not fake_audio.exists()  # deleted after streaming
