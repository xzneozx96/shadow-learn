import pytest
from app.services.transcription_gladia import (
    _segments_from_gladia_utterances,
    transcribe_audio_gladia,
    GladiaSTTProvider,
)


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
async def test_transcribe_audio_gladia_returns_segments(tmp_path):
    """transcribe_audio_gladia returns segments from Gladia response."""
    audio_file = tmp_path / "test.mp3"
    audio_file.write_bytes(b"fake audio data")

    mock_json = {
        "result": {
            "transcription": {
                "utterances": [
                    {
                        "language": "zh",
                        "start": 0.0,
                        "end": 1.0,
                        "confidence": 0.95,
                        "channel": 0,
                        "text": "你好",
                        "speaker": None,
                        "words": [
                            {"word": "你", "start": 0.0, "end": 0.5, "confidence": 0.95},
                            {"word": "好", "start": 0.5, "end": 1.0, "confidence": 0.95},
                        ],
                    }
                ]
            }
        }
    }

    from unittest.mock import patch, MagicMock, AsyncMock

    with patch("app.services.transcription_gladia.httpx.AsyncClient") as mock_client_cls:
        mock_client = MagicMock()
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = mock_json
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client_cls.return_value.__aexit__ = AsyncMock(return_value=None)

        segments = await transcribe_audio_gladia(audio_file, api_key="test_key", language="zh-CN")

    assert len(segments) == 1
    assert segments[0]["text"] == "你好"
    assert segments[0]["start"] == 0.0
    assert segments[0]["end"] == 1.0


@pytest.mark.asyncio
async def test_transcribe_audio_gladia_raises_on_api_error(tmp_path):
    """transcribe_audio_gladia raises on API error."""
    audio_file = tmp_path / "test.mp3"
    audio_file.write_bytes(b"fake audio data")

    from unittest.mock import patch, MagicMock, AsyncMock

    with patch("app.services.transcription_gladia.httpx.AsyncClient") as mock_client_cls:
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
    """GladiaSTTProvider raises if api_key is missing."""
    provider = GladiaSTTProvider()
    audio_file = tmp_path / "test.mp3"
    audio_file.write_bytes(b"fake audio data")

    with pytest.raises(ValueError, match="Gladia API key is required"):
        await provider.transcribe(audio_file, {}, "zh-CN")