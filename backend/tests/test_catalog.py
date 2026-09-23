"""Global catalogs: a repeat request is served from Postgres and MinIO, not the provider."""

import logging
from unittest.mock import AsyncMock, patch

import httpx
import pytest
import respx

from app.main import app
from app.settings import settings
from app.tts.services.tts_azure import AzureTTSProvider

pytestmark = [
    pytest.mark.asyncio(loop_scope="session"),
    pytest.mark.usefixtures("stored_user", "provider_env", "app_s3"),
]

_BREAKDOWN = {
    "word": "学习",
    "pinyin": "xuéxí",
    "meaning": "to study",
    "sino_vietnamese": "học tập",
    "characters": [{"char": "学", "pinyin": "xué", "meaning": "to learn"}],
}


@pytest.fixture
def providers():
    with respx.mock(assert_all_called=False) as mock:
        mock.route(host="test").pass_through()
        yield mock


@pytest.fixture
def azure_tts(monkeypatch):
    monkeypatch.setattr(app.state, "tts_provider", AzureTTSProvider(), raising=False)
    monkeypatch.setattr(app.state, "tts_provider_name", "azure", raising=False)


@pytest.mark.usefixtures("azure_tts")
async def test_second_identical_tts_request_is_a_catalog_hit(client, providers, caplog):
    azure = providers.post("https://eastus.tts.speech.microsoft.com/cognitiveservices/v1").respond(
        200, content=b"\xff\xfb\x90\x00mp3"
    )

    with caplog.at_level(logging.INFO, logger="app.catalog.service"):
        first = await client.post("/api/tts", json={"text": "你好"})
        second = await client.post("/api/tts", json={"text": "你好"})

    assert first.status_code == second.status_code == 200
    assert first.content == second.content == b"\xff\xfb\x90\x00mp3"
    assert second.headers["content-type"] == "audio/mpeg"
    assert azure.call_count == 1
    assert any(r.getMessage().startswith("catalog hit key=") for r in caplog.records)


@pytest.mark.usefixtures("azure_tts")
async def test_tts_catalog_is_keyed_by_text(client, providers):
    azure = providers.post("https://eastus.tts.speech.microsoft.com/cognitiveservices/v1").respond(200, content=b"a")

    await client.post("/api/tts", json={"text": "你好"})
    await client.post("/api/tts", json={"text": "再见"})

    assert azure.call_count == 2


async def test_second_identical_breakdown_is_a_catalog_hit(client, providers):
    openrouter = providers.post(settings.openrouter_chat_url).respond(
        200, json={"choices": [{"message": {"content": "Học là đứa trẻ ngồi dưới mái nhà."}}]}
    )

    first = await client.post("/api/vocab/breakdown-story", json=_BREAKDOWN)
    second = await client.post("/api/vocab/breakdown-story", json=_BREAKDOWN)

    assert first.status_code == second.status_code == 200
    assert first.json() == second.json() == {"story": "Học là đứa trẻ ngồi dưới mái nhà."}
    assert openrouter.call_count == 1


async def test_breakdown_provider_error_is_not_cached(client, providers):
    openrouter = providers.post(settings.openrouter_chat_url)
    openrouter.side_effect = [
        httpx.Response(200, json={"error": "bad"}),
        httpx.Response(200, json={"choices": [{"message": {"content": "story"}}]}),
    ]

    failed = await client.post("/api/vocab/breakdown-story", json=_BREAKDOWN)
    ok = await client.post("/api/vocab/breakdown-story", json=_BREAKDOWN)

    assert failed.status_code == 500
    assert ok.json() == {"story": "story"}
    assert openrouter.call_count == 2


async def test_second_tip_transcript_request_skips_youtube(client):
    """The transcript provider is yt-dlp, not httpx, so the probe is counted with a mock."""
    segments = [{"start": 0.0, "end": 1.0, "text": "hi"}]
    fetch = AsyncMock(return_value=("en", segments))
    duration = AsyncMock(return_value=(60.0, False))

    with (
        patch("app.tips.services.transcript.fetch_youtube_subtitles", new=fetch),
        patch("app.tips.services.transcript.check_video_duration", new=duration),
    ):
        first = await client.get("/api/tips/transcript/abc123")
        second = await client.get("/api/tips/transcript/abc123")

    assert first.json() == second.json() == {"status": "ready", "source": "subtitle", "lang": "en", "segments": segments}
    assert fetch.await_count == 1
    assert duration.await_count == 1
