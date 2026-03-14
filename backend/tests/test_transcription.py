import pytest
import httpx
from unittest.mock import patch, MagicMock, AsyncMock
from pathlib import Path
from app.services.transcription import (
    transcribe_audio,
    _group_words_into_segments,
)


@pytest.mark.asyncio
async def test_transcribe_audio_returns_segments(tmp_path):
    """Mock ElevenLabs Scribe response, verify segments with start/end/text returned."""
    audio_file = tmp_path / "test.mp3"
    audio_file.write_bytes(b"fake audio data")

    mock_response_data = {
        "words": [
            {"text": "你", "start": 0.0, "end": 0.5, "type": "word"},
            {"text": "好", "start": 0.5, "end": 1.0, "type": "word"},
            {"text": "。", "start": 1.0, "end": 1.0, "type": "spacing"},
            {"text": "世", "start": 1.2, "end": 1.6, "type": "word"},
            {"text": "界", "start": 1.6, "end": 2.0, "type": "word"},
            {"text": "！", "start": 2.0, "end": 2.0, "type": "spacing"},
        ]
    }

    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = mock_response_data
    mock_response.raise_for_status = MagicMock()

    with patch("app.services.transcription.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client_cls.return_value = mock_client

        segments = await transcribe_audio(audio_file, api_key="test_key")

    assert len(segments) >= 1
    for seg in segments:
        assert "start" in seg
        assert "end" in seg
        assert "text" in seg


@pytest.mark.asyncio
async def test_transcribe_audio_raises_on_api_error(tmp_path):
    """Mock 401 response, verify raises HTTPStatusError."""
    audio_file = tmp_path / "test.mp3"
    audio_file.write_bytes(b"fake audio data")

    mock_response = MagicMock()
    mock_response.status_code = 401
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
    """4 words with sentence-ending punctuation (。) → 2 segments."""
    words = [
        {"text": "你", "start": 0.0, "end": 0.5, "type": "word"},
        {"text": "好", "start": 0.5, "end": 1.0, "type": "word"},
        {"text": "。", "start": 1.0, "end": 1.0, "type": "spacing"},
        {"text": "世", "start": 1.2, "end": 1.6, "type": "word"},
        {"text": "界", "start": 1.6, "end": 2.0, "type": "word"},
        {"text": "！", "start": 2.0, "end": 2.0, "type": "spacing"},
    ]
    segments = _group_words_into_segments(words)
    assert len(segments) == 2
    assert segments[0]["text"] == "你好。"
    assert segments[1]["text"] == "世界！"


def test_group_words_splits_on_gap():
    """2 words with 2.5s gap → 2 segments."""
    words = [
        {"text": "你", "start": 0.0, "end": 0.5, "type": "word"},
        {"text": "好", "start": 3.1, "end": 3.6, "type": "word"},
    ]
    segments = _group_words_into_segments(words)
    assert len(segments) == 2
    assert segments[0]["text"] == "你"
    assert segments[1]["text"] == "好"
