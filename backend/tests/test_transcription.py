import pytest
import httpx
from unittest.mock import patch, MagicMock, AsyncMock
from pathlib import Path
from app.services.transcription import _group_words_into_segments, _segments_from_paragraphs
from app.services.transcription import transcribe_audio_deepgram, _normalize_deepgram_words


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


def test_segments_from_paragraphs_strips_spaces_and_assigns_ids():
    """Paragraph sentences become segments; inter-character spaces are stripped."""
    paragraphs = [
        {
            "sentences": [{"text": "你 好 世 界。", "start": 0.0, "end": 1.0}],
            "speaker": 0, "num_words": 4, "start": 0.0, "end": 1.0,
        },
        {
            "sentences": [{"text": "谢 谢 你！", "start": 3.0, "end": 4.0}],
            "speaker": 1, "num_words": 3, "start": 3.0, "end": 4.0,
        },
    ]
    segments = _segments_from_paragraphs(paragraphs)
    assert len(segments) == 2
    assert segments[0] == {"id": 0, "start": 0.0, "end": 1.0, "text": "你好世界。"}
    assert segments[1] == {"id": 1, "start": 3.0, "end": 4.0, "text": "谢谢你！"}


def test_segments_from_paragraphs_multiple_sentences_per_paragraph():
    """Multiple sentences within one paragraph each become separate segments."""
    paragraphs = [
        {
            "sentences": [
                {"text": "你 好。", "start": 0.0, "end": 0.5},
                {"text": "世 界！", "start": 0.6, "end": 1.0},
            ],
            "speaker": 0, "num_words": 4, "start": 0.0, "end": 1.0,
        },
    ]
    segments = _segments_from_paragraphs(paragraphs)
    assert len(segments) == 2
    assert segments[0]["text"] == "你好。"
    assert segments[1]["text"] == "世界！"
    assert segments[1]["id"] == 1


@pytest.mark.asyncio
async def test_transcribe_audio_deepgram_uses_paragraphs(tmp_path):
    """When paragraphs are present, they are used as the primary segment source."""
    audio_file = tmp_path / "test.mp3"
    audio_file.write_bytes(b"fake audio data")

    mock_json = {
        "results": {
            "channels": [{
                "detected_language": "zh",
                "language_confidence": 0.99,
                "alternatives": [{
                    "transcript": "你好世界。谢谢你！",
                    "confidence": 0.99,
                    "words": [],
                    "paragraphs": {
                        "transcript": "你好世界。\n谢谢你！",
                        "paragraphs": [
                            {
                                "sentences": [{"text": "你好 世界。", "start": 0.0, "end": 1.0}],
                                "speaker": 0, "num_words": 2, "start": 0.0, "end": 1.0,
                            },
                            {
                                "sentences": [{"text": "谢谢 你！", "start": 3.0, "end": 4.0}],
                                "speaker": 1, "num_words": 2, "start": 3.0, "end": 4.0,
                            },
                        ],
                    },
                }],
            }],
        },
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
async def test_transcribe_audio_deepgram_falls_back_to_words(tmp_path):
    """Without paragraphs, falls back to word-level grouping."""
    audio_file = tmp_path / "test.mp3"
    audio_file.write_bytes(b"fake audio data")

    mock_json = {
        "results": {
            "channels": [{
                "detected_language": "zh",
                "language_confidence": 0.99,
                "alternatives": [{
                    "transcript": "你好世界。",
                    "confidence": 0.99,
                    "words": [
                        {"word": "你好", "start": 0.0, "end": 0.5, "punctuated_word": "你好", "speaker": 0},
                        {"word": "世界", "start": 0.5, "end": 1.0, "punctuated_word": "世界。", "speaker": 0},
                        {"word": "谢谢", "start": 3.0, "end": 3.5, "punctuated_word": "谢谢", "speaker": 1},
                        {"word": "你", "start": 3.5, "end": 4.0, "punctuated_word": "你！", "speaker": 1},
                    ],
                }],
            }],
        },
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
    assert segments[1]["text"] == "谢谢你！"


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
