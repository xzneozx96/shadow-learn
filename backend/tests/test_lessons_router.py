import io
from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

import app.job_store as jobs_module
from app.main import app

pytestmark = pytest.mark.usefixtures("stored_user", "provider_env")


@pytest.fixture(autouse=True)
def speech_providers():
    app.state.stt_provider = AsyncMock()
    app.state.stt_provider_name = "azure"
    app.state.tts_provider_name = "azure"


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


@pytest.mark.asyncio(loop_scope="session")
async def test_generate_lesson_rejects_missing_url():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/lessons/generate",
            json={
                "source": "youtube",
                "youtube_url": None,
                "translation_languages": ["en"],
            },
        )
    assert response.status_code == 400


@pytest.mark.asyncio(loop_scope="session")
async def test_generate_lesson_rejects_invalid_source():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/lessons/generate",
            json={
                "source": "invalid",
                "translation_languages": ["en"],
            },
        )
    assert response.status_code == 422


@pytest.mark.asyncio(loop_scope="session")
async def test_generate_lesson_youtube_returns_job_id(signed_in_user):
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
                },
            )
    assert response.status_code == 200
    data = response.json()
    assert "job_id" in data
    assert isinstance(data["job_id"], str)
    assert len(data["job_id"]) > 0
    assert jobs_module.jobs[data["job_id"]].user_id == str(signed_in_user.id)


@pytest.mark.asyncio(loop_scope="session")
async def test_generate_lesson_rejects_a_key_in_the_body():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/lessons/generate",
            json={
                "source": "youtube",
                "youtube_url": "https://www.youtube.com/watch?v=abc123",
                "translation_languages": ["en"],
                "openrouter_api_key": "sk-leaked",
            },
        )
    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"] == ["body", "openrouter_api_key"]


@pytest.mark.asyncio(loop_scope="session")
async def test_generate_lesson_hands_the_server_keys_to_the_pipeline():
    with (
        patch("app.lessons.router.validate_youtube_url", return_value="abc123"),
        patch("app.lessons.router._process_youtube_lesson", new=AsyncMock()) as pipeline,
    ):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/lessons/generate",
                json={
                    "source": "youtube",
                    "youtube_url": "https://www.youtube.com/watch?v=abc123",
                    "translation_languages": ["en"],
                },
            )
    assert response.status_code == 200
    *_, openrouter_key, stt_keys = pipeline.call_args.args
    assert openrouter_key == "env-openrouter-key"
    assert stt_keys == {"azure_speech_key": "env-azure-key", "azure_speech_region": "eastus"}


@pytest.mark.asyncio(loop_scope="session")
async def test_youtube_lesson_starts_without_an_azure_key_because_subtitles_may_skip_stt(monkeypatch):
    monkeypatch.setattr("app.keys.service.settings.azure_speech_key", None)
    with (
        patch("app.lessons.router.validate_youtube_url", return_value="abc123"),
        patch("app.lessons.router._process_youtube_lesson", new=AsyncMock()) as pipeline,
    ):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/lessons/generate",
                json={"source": "youtube", "youtube_url": "https://www.youtube.com/watch?v=abc123", "translation_languages": ["en"]},
            )
    assert response.status_code == 200
    assert pipeline.call_args.args[-1] == {}


@pytest.mark.asyncio(loop_scope="session")
async def test_blog_lesson_resolves_azure_once_for_tts_and_stt(mock_tts_provider, db_session):
    from sqlalchemy import func, select

    from app.keys.models import Provider, ProviderUsage

    with patch("app.lessons.router._process_blog_lesson", new=AsyncMock()) as pipeline:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/lessons/generate",
                json={"source": "blog", "blog_text": "你好世界", "translation_languages": ["en"]},
            )
    assert response.status_code == 200
    *_, tts_keys, stt_keys = pipeline.call_args.args
    assert tts_keys["azure_speech_key"] == stt_keys["azure_speech_key"] == "env-azure-key"
    azure_rows = await db_session.scalar(
        select(func.count()).select_from(ProviderUsage).where(ProviderUsage.provider == Provider.azure_speech)
    )
    assert azure_rows == 1


@pytest.mark.asyncio(loop_scope="session")
async def test_generate_lesson_returns_400_without_any_openrouter_key(monkeypatch):
    monkeypatch.setattr("app.keys.service.settings.openrouter_api_key", None)
    with patch("app.lessons.router.validate_youtube_url", return_value="abc123"):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/lessons/generate",
                json={
                    "source": "youtube",
                    "youtube_url": "https://www.youtube.com/watch?v=abc123",
                    "translation_languages": ["en"],
                },
            )
    assert response.status_code == 400
    assert response.json()["detail"] == "No OpenRouter key configured. Add one in Settings."


@pytest.mark.asyncio(loop_scope="session")
async def test_generate_lesson_upload_rejects_key_form_fields():
    from unittest.mock import AsyncMock, patch

    with patch("app.lessons.router._process_upload_lesson", new=AsyncMock()):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/lessons/generate-upload",
                files={"file": ("test.mp4", io.BytesIO(b"fake"), "video/mp4")},
                data={
                    "translation_languages": "en",
                    "azure_speech_key": "az-key",
                    "azure_speech_region": "eastus",
                },
            )
    assert response.status_code == 422
    assert {error["loc"][-1] for error in response.json()["detail"]} == {"azure_speech_key", "azure_speech_region"}


@pytest.mark.asyncio(loop_scope="session")
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


@pytest.mark.asyncio(loop_scope="session")
async def test_get_video_returns_404_for_missing_file():
    """GET /api/lessons/video/{filename} returns 404 when file is not found."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/lessons/video/nonexistent.mp4")
    assert response.status_code == 404


@pytest.mark.asyncio(loop_scope="session")
async def test_shared_pipeline_assembles_text_and_romanization_keys():
    """Assembled segment dicts must use 'text'/'romanization', not 'chinese'/'pinyin'."""
    from unittest.mock import MagicMock

    import app.job_store as jobs_module
    from app.job_store import Job
    from app.lessons.router import _shared_pipeline

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
        source_language=source_language,
    )


@pytest.mark.asyncio(loop_scope="session")
async def test_youtube_lesson_uses_manual_subtitle_when_available():
    """Manual subtitle in source_language → STT skipped; segments come from VTT."""
    from app.job_store import Job
    from app.lessons.router import _process_youtube_lesson

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
        await _process_youtube_lesson(_make_youtube_request("zh-CN"), "abc123", job_id, stt, "sk-test", {})

    stt.transcribe.assert_not_called()
    mock_extract.assert_not_called()
    assert captured_segments["segs"]
    assert captured_segments["segs"][0]["text"] == "你好世界"


@pytest.mark.asyncio(loop_scope="session")
async def test_youtube_lesson_falls_back_to_stt_when_no_manual_track():
    """No manual subtitle in source_language → existing STT pipeline runs."""
    from pathlib import Path

    from app.job_store import Job
    from app.lessons.router import _process_youtube_lesson

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
        await _process_youtube_lesson(_make_youtube_request("zh-CN"), "abc123", job_id, stt, "sk-test", {})

    stt.transcribe.assert_called_once()


@pytest.mark.asyncio(loop_scope="session")
async def test_youtube_lesson_ignores_automatic_captions():
    """Auto-generated captions never trigger the subtitle path."""
    from pathlib import Path

    from app.job_store import Job
    from app.lessons.router import _process_youtube_lesson

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
        await _process_youtube_lesson(_make_youtube_request("zh-CN"), "abc123", job_id, stt, "sk-test", {})

    download_sub.assert_not_called()
    stt.transcribe.assert_called_once()


@pytest.mark.asyncio(loop_scope="session")
async def test_youtube_lesson_falls_back_when_subtitle_download_fails():
    """If yt-dlp fails to write the VTT, fall back to STT instead of erroring the job."""
    from pathlib import Path

    from app.job_store import Job
    from app.lessons.router import _process_youtube_lesson

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
        await _process_youtube_lesson(_make_youtube_request("zh-CN"), "abc123", job_id, stt, "sk-test", {})

    stt.transcribe.assert_called_once()
    assert jobs_module.jobs[job_id].status == "complete"


@pytest.mark.asyncio(loop_scope="session")
async def test_youtube_lesson_video_still_downloaded_on_subtitle_hit():
    """Even on subtitle hit, video must be downloaded for playback (media_filename)."""
    from pathlib import Path

    from app.job_store import Job
    from app.lessons.router import _process_youtube_lesson

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
        await _process_youtube_lesson(_make_youtube_request("zh-CN"), "abc123", job_id, stt, "sk-test", {})

    download_video.assert_called_once()
    assert captured_kwargs.get("media_filename") == "vid.mp4"


@pytest.mark.asyncio(loop_scope="session")
async def test_generate_lesson_upload_returns_job_id(signed_in_user):
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
                },
            )
    assert response.status_code == 200
    data = response.json()
    assert "job_id" in data
    assert jobs_module.jobs[data["job_id"]].user_id == str(signed_in_user.id)


@pytest.fixture()
def mock_tts_provider():
    from unittest.mock import AsyncMock
    provider = AsyncMock()
    provider.synthesize = AsyncMock(return_value=b"fake-mp3-bytes")
    app.state.tts_provider = provider
    yield provider
    if hasattr(app.state, "tts_provider"):
        del app.state.tts_provider


@pytest.mark.asyncio(loop_scope="session")
async def test_generate_blog_lesson_missing_url():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/lessons/generate",
            json={
                "source": "blog",
                "translation_languages": ["en"],
            },
        )
    assert response.status_code == 400
    assert "blog_url" in response.json()["detail"]


@pytest.mark.asyncio(loop_scope="session")
async def test_generate_blog_lesson_returns_job_id(mock_tts_provider, signed_in_user):
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
                },
            )
    assert response.status_code == 200
    assert jobs_module.jobs[response.json()["job_id"]].user_id == str(signed_in_user.id)


@pytest.mark.asyncio(loop_scope="session")
async def test_get_audio_returns_404_for_missing_file():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/lessons/audio/nonexistent.mp3")
    assert response.status_code == 404


@pytest.mark.asyncio(loop_scope="session")
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
