import pytest
import httpx
from unittest.mock import patch, AsyncMock, MagicMock
from app.transcription.services.transcription_gladia import (
    _segments_from_gladia_utterances,
    transcribe_audio_gladia,
    GladiaSTTProvider,
)


def _quota_error(status_code: int) -> httpx.HTTPStatusError:
    request = MagicMock(spec=httpx.Request)
    response = MagicMock(spec=httpx.Response)
    response.status_code = status_code
    return httpx.HTTPStatusError("quota exceeded", request=request, response=response)


def test_segments_from_gladia_utterances_chinese_strips_spaces():
    """Chinese text should have spaces stripped from words."""
    utterances = [
        {
            "language": "zh",
            "start": 0.34,
            "end": 1.621,
            "confidence": 0.903,
            "channel": 0,
            "text": "我的桌子,",
            "speaker": None,
            "words": [
                {"word": "我", "start": 0.34, "end": 0.46, "confidence": 0.92},
                {"word": "的", "start": 0.52, "end": 0.64, "confidence": 0.96},
                {"word": "桌子", "start": 0.96, "end": 1.621, "confidence": 0.83},
            ]
        }
    ]
    segments = _segments_from_gladia_utterances(utterances, "zh-CN")
    assert len(segments) == 1
    assert segments[0]["text"] == "我的桌子"


def test_segments_from_gladia_utterances_multiple():
    """Multiple utterances produce multiple segments."""
    utterances = [
        {"language": "zh", "start": 0.0, "end": 1.0, "confidence": 0.9, "channel": 0,
         "text": "你好", "speaker": None, "words": [
             {"word": "你", "start": 0.0, "end": 0.5, "confidence": 0.9},
             {"word": "好", "start": 0.5, "end": 1.0, "confidence": 0.9},
         ]},
        {"language": "zh", "start": 2.0, "end": 3.0, "confidence": 0.9, "channel": 0,
         "text": "再见", "speaker": None, "words": [
             {"word": "再", "start": 2.0, "end": 2.5, "confidence": 0.9},
             {"word": "见", "start": 2.5, "end": 3.0, "confidence": 0.9},
         ]},
    ]
    segments = _segments_from_gladia_utterances(utterances, "zh-CN")
    assert len(segments) == 2
    assert segments[0]["text"] == "你好"
    assert segments[1]["text"] == "再见"


def test_segments_from_gladia_utterances_english_preserves_spaces():
    """English text preserves spaces between words."""
    utterances = [
        {"language": "en", "start": 0.0, "end": 1.0, "confidence": 0.9, "channel": 0,
         "text": "hello world", "speaker": None, "words": [
             {"word": "hello", "start": 0.0, "end": 0.5, "confidence": 0.9},
             {"word": "world", "start": 0.5, "end": 1.0, "confidence": 0.9},
         ]},
    ]
    segments = _segments_from_gladia_utterances(utterances, "en")
    assert len(segments) == 1
    assert segments[0]["text"] == "hello world"


def test_segments_from_gladia_utterances_skips_empty():
    """Utterances with empty transcript after space-stripping are skipped."""
    utterances = [
        {"language": "zh", "start": 0.0, "end": 0.1, "confidence": 0.0, "channel": 0,
         "text": " ", "speaker": None, "words": []},
        {"language": "zh", "start": 1.0, "end": 2.0, "confidence": 0.9, "channel": 0,
         "text": "你好", "speaker": None, "words": [
             {"word": "你", "start": 1.0, "end": 1.4, "confidence": 0.9},
             {"word": "好", "start": 1.5, "end": 2.0, "confidence": 0.9},
         ]},
    ]
    segments = _segments_from_gladia_utterances(utterances, "zh-CN")
    assert len(segments) == 1
    assert segments[0]["text"] == "你好"
    assert segments[0]["id"] == 0


@pytest.mark.asyncio
async def test_transcribe_audio_gladia_full_flow(tmp_path):
    """Full flow: upload -> start -> poll -> segments."""
    audio_file = tmp_path / "test.mp3"
    audio_file.write_bytes(b"fake audio data")

    async def mock_upload(path, key):
        return "https://api.gladia.io/file/test"

    async def mock_start(url, key, lang):
        return "job-123"

    async def mock_poll(job_id, key):
        return {
            "status": "done",
            "result": {"transcription": {"utterances": [
                {"language": "zh", "start": 0.0, "end": 1.0, "confidence": 0.95, "channel": 0,
                 "text": "你好", "speaker": None, "words": [
                     {"word": "你", "start": 0.0, "end": 0.5, "confidence": 0.95},
                     {"word": "好", "start": 0.5, "end": 1.0, "confidence": 0.95},
                 ]}
            ]}}
        }

    with patch("app.transcription.services.transcription_gladia._upload_audio", mock_upload):
        with patch("app.transcription.services.transcription_gladia._start_transcription", mock_start):
            with patch("app.transcription.services.transcription_gladia._poll_for_result", mock_poll):
                segments = await transcribe_audio_gladia(audio_file, api_key="test_key", language="zh-CN")

    assert len(segments) == 1
    assert segments[0]["text"] == "你好"
    assert segments[0]["start"] == 0.0
    assert segments[0]["end"] == 1.0


@pytest.mark.asyncio
async def test_transcribe_audio_gladia_raises_on_api_error(tmp_path):
    """transcribe_audio_gladia raises on API error."""
    from unittest.mock import MagicMock

    audio_file = tmp_path / "test.mp3"
    audio_file.write_bytes(b"fake audio data")

    with patch("app.transcription.services.transcription_gladia.httpx.AsyncClient") as mock_client_cls:
        mock_client = MagicMock()
        mock_response = MagicMock()
        mock_response.status_code = 401
        mock_response.text = "Unauthorized"
        mock_response.raise_for_status = MagicMock(side_effect=Exception("Unauthorized"))
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client_cls.return_value.__aexit__ = AsyncMock(return_value=None)

        with pytest.raises(Exception, match="Unauthorized"):
            await transcribe_audio_gladia(audio_file, api_key="bad_key", language="zh-CN")


@pytest.mark.asyncio
async def test_gladia_provider_requires_api_key(tmp_path):
    """GladiaSTTProvider raises if api_key list is empty."""
    provider = GladiaSTTProvider()
    audio_file = tmp_path / "test.mp3"
    audio_file.write_bytes(b"fake audio data")

    with pytest.raises(ValueError, match="Gladia API key is required"):
        await provider.transcribe(audio_file, {}, "zh-CN")


@pytest.mark.asyncio
async def test_gladia_provider_rotates_to_key2_on_402(tmp_path):
    """Key1 returns 402 → provider rotates to key2 and succeeds."""
    audio_file = tmp_path / "test.mp3"
    audio_file.write_bytes(b"fake audio")

    segments = [{"id": 0, "start": 0.0, "end": 1.0, "text": "你好", "word_timings": []}]
    calls: list[str] = []

    async def mock_transcribe(path, api_key, language):
        calls.append(api_key)
        if api_key == "key1":
            raise _quota_error(402)
        return segments

    with patch("app.transcription.services.transcription_gladia.transcribe_audio_gladia", mock_transcribe):
        result = await GladiaSTTProvider().transcribe(
            audio_file, {"gladia_api_keys": ["key1", "key2"]}, "zh-CN"
        )

    assert calls == ["key1", "key2"]
    assert result == segments


@pytest.mark.asyncio
async def test_gladia_provider_rotates_to_key2_on_403(tmp_path):
    """Key1 returns 403 → provider rotates to key2 and succeeds."""
    audio_file = tmp_path / "test.mp3"
    audio_file.write_bytes(b"fake audio")

    segments = [{"id": 0, "start": 0.0, "end": 1.0, "text": "你好", "word_timings": []}]
    calls: list[str] = []

    async def mock_transcribe(path, api_key, language):
        calls.append(api_key)
        if api_key == "key1":
            raise _quota_error(403)
        return segments

    with patch("app.transcription.services.transcription_gladia.transcribe_audio_gladia", mock_transcribe):
        result = await GladiaSTTProvider().transcribe(
            audio_file, {"gladia_api_keys": ["key1", "key2"]}, "zh-CN"
        )

    assert calls == ["key1", "key2"]
    assert result == segments


@pytest.mark.asyncio
async def test_gladia_provider_rotates_through_all_keys(tmp_path):
    """Exhausted keys are all tried; succeeds on last key."""
    audio_file = tmp_path / "test.mp3"
    audio_file.write_bytes(b"fake audio")

    segments = [{"id": 0, "start": 0.0, "end": 1.0, "text": "你好", "word_timings": []}]
    calls: list[str] = []

    async def mock_transcribe(path, api_key, language):
        calls.append(api_key)
        if api_key != "key5":
            raise _quota_error(402)
        return segments

    with patch("app.transcription.services.transcription_gladia.transcribe_audio_gladia", mock_transcribe):
        result = await GladiaSTTProvider().transcribe(
            audio_file, {"gladia_api_keys": ["key1", "key2", "key3", "key4", "key5"]}, "zh-CN"
        )

    assert calls == ["key1", "key2", "key3", "key4", "key5"]
    assert result == segments


@pytest.mark.asyncio
async def test_gladia_provider_raises_when_all_keys_exhausted(tmp_path):
    """All keys return 402 → raises the last HTTPStatusError."""
    audio_file = tmp_path / "test.mp3"
    audio_file.write_bytes(b"fake audio")

    async def mock_transcribe(path, api_key, language):
        raise _quota_error(402)

    with patch("app.transcription.services.transcription_gladia.transcribe_audio_gladia", mock_transcribe):
        with pytest.raises(httpx.HTTPStatusError) as exc_info:
            await GladiaSTTProvider().transcribe(
                audio_file, {"gladia_api_keys": ["key1", "key2", "key3"]}, "zh-CN"
            )

    assert exc_info.value.response.status_code == 402


@pytest.mark.asyncio
async def test_gladia_provider_does_not_rotate_on_non_quota_error(tmp_path):
    """Non-quota errors (401) raise immediately without trying remaining keys."""
    audio_file = tmp_path / "test.mp3"
    audio_file.write_bytes(b"fake audio")

    calls: list[str] = []

    async def mock_transcribe(path, api_key, language):
        calls.append(api_key)
        raise _quota_error(401)

    with patch("app.transcription.services.transcription_gladia.transcribe_audio_gladia", mock_transcribe):
        with pytest.raises(httpx.HTTPStatusError) as exc_info:
            await GladiaSTTProvider().transcribe(
                audio_file, {"gladia_api_keys": ["key1", "key2", "key3"]}, "zh-CN"
            )

    assert calls == ["key1"]
    assert exc_info.value.response.status_code == 401


