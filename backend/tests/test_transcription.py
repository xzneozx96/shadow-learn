import pytest
import httpx
from unittest.mock import patch, MagicMock, AsyncMock
from pathlib import Path
from app.services.transcription import transcribe_audio, _group_words_into_segments
from app.services.transcription import transcribe_audio_deepgram, _normalize_deepgram_words


@pytest.mark.asyncio
async def test_transcribe_audio_returns_segments(tmp_path):
    """Mock OpenAI Whisper verbose_json response, verify segments returned."""
    audio_file = tmp_path / "test.mp3"
    audio_file.write_bytes(b"fake audio data")

    mock_json = {
        "text": "你好世界。谢谢你！",
        "words": [
            {"word": "你好", "start": 0.0, "end": 0.5},
            {"word": "世界", "start": 0.5, "end": 1.0},
            {"word": "。", "start": 1.0, "end": 1.0},
            {"word": "谢谢", "start": 3.0, "end": 3.5},
            {"word": "你", "start": 3.5, "end": 4.0},
            {"word": "！", "start": 4.0, "end": 4.0},
        ],
    }

    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = mock_json
    mock_response.raise_for_status = MagicMock()

    with patch("app.services.transcription.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client_cls.return_value = mock_client

        segments = await transcribe_audio(audio_file, api_key="test_key")

    assert len(segments) == 2
    assert segments[0]["text"] == "你好世界。"
    assert segments[0]["start"] == 0.0
    assert segments[1]["text"] == "谢谢你！"
    assert segments[1]["start"] == 3.0


@pytest.mark.asyncio
async def test_transcribe_audio_raises_on_api_error(tmp_path):
    """Mock 401 response, verify raises HTTPStatusError."""
    audio_file = tmp_path / "test.mp3"
    audio_file.write_bytes(b"fake audio data")

    mock_response = MagicMock()
    mock_response.status_code = 401
    mock_response.text = "Unauthorized"
    mock_response.raise_for_status.side_effect = httpx.HTTPStatusError(
        "401 Unauthorized",
        request=MagicMock(),
        response=mock_response,
    )

    with patch("app.services.transcription.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client_cls.return_value = mock_client

        with pytest.raises(httpx.HTTPStatusError):
            await transcribe_audio(audio_file, api_key="bad_key")


def test_group_words_splits_on_punctuation():
    """Words with sentence-ending punctuation split into segments."""
    words = [
        {"text": "你好", "start": 0.0, "end": 0.5},
        {"text": "。", "start": 0.5, "end": 0.5},
        {"text": "世界", "start": 1.0, "end": 1.5},
    ]
    segments = _group_words_into_segments(words)
    assert len(segments) == 2
    assert segments[0]["text"] == "你好。"
    assert segments[1]["text"] == "世界"


def test_group_words_splits_on_gap():
    """Words with > 1.5s gap split into segments."""
    words = [
        {"text": "你", "start": 0.0, "end": 0.5},
        {"text": "好", "start": 3.1, "end": 3.6},
    ]
    segments = _group_words_into_segments(words)
    assert len(segments) == 2
    assert segments[0]["text"] == "你"
    assert segments[1]["text"] == "好"


def test_normalize_deepgram_words_uses_punctuated_word():
    """punctuated_word becomes text; start/end preserved."""
    raw = [
        {"word": "你", "start": 0.0, "end": 0.3, "punctuated_word": "你", "speaker": 0},
        {"word": "好", "start": 0.4, "end": 0.8, "punctuated_word": "好。", "speaker": 0},
    ]
    result = _normalize_deepgram_words(raw)
    assert result == [
        {"text": "你", "start": 0.0, "end": 0.3},
        {"text": "好。", "start": 0.4, "end": 0.8},
    ]


def test_normalize_deepgram_words_fallback_to_word_key():
    """Falls back to 'word' key when 'punctuated_word' is absent."""
    raw = [{"word": "你", "start": 0.0, "end": 0.3}]
    result = _normalize_deepgram_words(raw)
    assert result[0]["text"] == "你"


@pytest.mark.asyncio
async def test_transcribe_audio_deepgram_returns_segments(tmp_path):
    """Mock Deepgram response, verify segments returned via existing grouper."""
    audio_file = tmp_path / "test.mp3"
    audio_file.write_bytes(b"fake audio data")

    mock_json = {
        "results": {
            "channels": [{
                "alternatives": [{
                    "words": [
                        {"word": "你好", "start": 0.0, "end": 0.5, "punctuated_word": "你好", "speaker": 0},
                        {"word": "世界", "start": 0.5, "end": 1.0, "punctuated_word": "世界。", "speaker": 0},
                        {"word": "谢谢", "start": 3.0, "end": 3.5, "punctuated_word": "谢谢", "speaker": 1},
                        {"word": "你", "start": 3.5, "end": 4.0, "punctuated_word": "你！", "speaker": 1},
                    ]
                }]
            }]
        }
    }

    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = mock_json
    mock_response.raise_for_status = MagicMock()

    with patch("app.services.transcription.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client_cls.return_value = mock_client

        segments = await transcribe_audio_deepgram(audio_file, api_key="test_key")

    assert len(segments) == 2
    assert segments[0]["text"] == "你好世界。"
    assert segments[0]["start"] == 0.0
    assert segments[1]["text"] == "谢谢你！"
    assert segments[1]["start"] == 3.0


@pytest.mark.asyncio
async def test_transcribe_audio_deepgram_raises_on_api_error(tmp_path):
    """Mock 401, verify raises HTTPStatusError."""
    audio_file = tmp_path / "test.mp3"
    audio_file.write_bytes(b"fake audio data")

    mock_response = MagicMock()
    mock_response.status_code = 401
    mock_response.text = "Unauthorized"
    mock_response.raise_for_status.side_effect = httpx.HTTPStatusError(
        "401 Unauthorized",
        request=MagicMock(),
        response=mock_response,
    )

    with patch("app.services.transcription.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client_cls.return_value = mock_client

        with pytest.raises(httpx.HTTPStatusError):
            await transcribe_audio_deepgram(audio_file, api_key="bad_key")
