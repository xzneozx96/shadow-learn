from pathlib import Path

import pytest
import respx
from httpx import Response

from app.services.transcription_azure import AzureSTTProvider, _parse_duration


# ---------------------------------------------------------------------------
# _parse_duration
# ---------------------------------------------------------------------------

def test_parse_duration_seconds():
    assert _parse_duration("PT1.23S") == pytest.approx(1.23)


def test_parse_duration_zero():
    assert _parse_duration("PT0S") == pytest.approx(0.0)


def test_parse_duration_whole():
    assert _parse_duration("PT10S") == pytest.approx(10.0)


# ---------------------------------------------------------------------------
# AzureSTTProvider.transcribe
# ---------------------------------------------------------------------------

_API_URL = "https://eastus.api.cognitive.microsoft.com/speechtotext/transcriptions:transcribe"


def _make_response(phrases: list[dict]) -> Response:
    return Response(200, json={"phrases": phrases})


@pytest.mark.asyncio
@respx.mock
async def test_transcribe_maps_phrases_to_segments(tmp_path: Path):
    """Phrases with word timings are mapped correctly to _Segment dicts."""
    audio = tmp_path / "audio.mp3"
    audio.write_bytes(b"fake mp3")

    respx.post(_API_URL).mock(return_value=_make_response([
        {
            "text": "你好世界",
            "offset": "PT1.0S",
            "duration": "PT1.0S",
            "words": [
                {"text": "你好", "offset": "PT1.0S", "duration": "PT0.5S"},
                {"text": "世界", "offset": "PT1.5S", "duration": "PT0.5S"},
            ],
        }
    ]))

    provider = AzureSTTProvider()
    segments = await provider.transcribe(audio, {"azure_speech_key": "k", "azure_speech_region": "eastus"}, "zh-CN")

    assert len(segments) == 1
    seg = segments[0]
    assert seg["id"] == 0
    assert seg["text"] == "你好世界"
    assert seg["start"] == pytest.approx(1.0)
    assert seg["end"] == pytest.approx(2.0)
    assert seg["word_timings"][0] == {"text": "你好", "start": pytest.approx(1.0), "end": pytest.approx(1.5)}
    assert seg["word_timings"][1] == {"text": "世界", "start": pytest.approx(1.5), "end": pytest.approx(2.0)}


@pytest.mark.asyncio
@respx.mock
async def test_transcribe_strips_chinese_spaces(tmp_path: Path):
    """Chinese phrase text with spaces is stripped."""
    audio = tmp_path / "audio.mp3"
    audio.write_bytes(b"fake mp3")

    respx.post(_API_URL).mock(return_value=_make_response([
        {"text": "你 好", "offset": "PT0S", "duration": "PT1S", "words": []},
    ]))

    provider = AzureSTTProvider()
    segments = await provider.transcribe(audio, {"azure_speech_key": "k", "azure_speech_region": "eastus"}, "zh-CN")

    assert segments[0]["text"] == "你好"


@pytest.mark.asyncio
@respx.mock
async def test_transcribe_phrase_without_words(tmp_path: Path):
    """Phrase with no words array uses phrase-level offset/duration."""
    audio = tmp_path / "audio.mp3"
    audio.write_bytes(b"fake mp3")

    respx.post(_API_URL).mock(return_value=_make_response([
        {"text": "你好", "offset": "PT2.5S", "duration": "PT1.0S", "words": []},
    ]))

    provider = AzureSTTProvider()
    segments = await provider.transcribe(audio, {"azure_speech_key": "k", "azure_speech_region": "eastus"}, "zh-CN")

    assert segments[0]["start"] == pytest.approx(2.5)
    assert segments[0]["end"] == pytest.approx(3.5)
    assert segments[0]["word_timings"] == []


@pytest.mark.asyncio
@respx.mock
async def test_transcribe_raises_on_http_error(tmp_path: Path):
    """RuntimeError raised when API returns non-200."""
    audio = tmp_path / "audio.mp3"
    audio.write_bytes(b"fake mp3")

    respx.post(_API_URL).mock(return_value=Response(400, text="Bad Request"))

    provider = AzureSTTProvider()
    with pytest.raises(RuntimeError, match="Azure Fast STT error 400"):
        await provider.transcribe(audio, {"azure_speech_key": "k", "azure_speech_region": "eastus"}, "zh-CN")


@pytest.mark.asyncio
async def test_transcribe_raises_without_key(tmp_path: Path):
    """ValueError raised when azure_speech_key is absent."""
    audio = tmp_path / "audio.mp3"
    audio.write_bytes(b"fake mp3")

    provider = AzureSTTProvider()
    with pytest.raises(ValueError, match="Azure Speech key"):
        await provider.transcribe(audio, {}, "zh-CN")


@pytest.mark.asyncio
async def test_transcribe_raises_without_region(tmp_path: Path):
    """ValueError raised when azure_speech_region is absent."""
    audio = tmp_path / "audio.mp3"
    audio.write_bytes(b"fake mp3")

    provider = AzureSTTProvider()
    with pytest.raises(ValueError, match="Azure Speech region"):
        await provider.transcribe(audio, {"azure_speech_key": "k"}, "zh-CN")
