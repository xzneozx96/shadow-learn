import pytest
import httpx
from unittest.mock import patch, MagicMock, AsyncMock
from app.transcription.services.transcription_provider import (
    _finalize_segment,
    _group_words_into_segments,
)
from app.transcription.services.transcription_deepgram import (
    _segments_from_utterances,
    transcribe_audio_deepgram,
    _normalize_deepgram_words,
)


def test_group_words_splits_on_punctuation():
    """Words with sentence-ending punctuation split into segments."""
    words = [
        {"text": "你好", "start": 0.0, "end": 0.5},
        {"text": "。", "start": 0.5, "end": 0.5},
        {"text": "世界", "start": 1.0, "end": 1.5},
    ]
    segments = _group_words_into_segments(words, language="zh-CN")
    assert len(segments) == 2
    assert segments[0]["text"] == "你好。"
    assert segments[0]["word_timings"] == [
        {"text": "你好", "start": 0.0, "end": 0.5},
        {"text": "。", "start": 0.5, "end": 0.5},
    ]
    assert segments[1]["text"] == "世界"
    assert segments[1]["word_timings"] == [{"text": "世界", "start": 1.0, "end": 1.5}]


def test_group_words_splits_on_gap():
    """Words with > 1.5s gap split into segments."""
    words = [
        {"text": "你", "start": 0.0, "end": 0.5},
        {"text": "好", "start": 3.1, "end": 3.6},
    ]
    segments = _group_words_into_segments(words, language="zh-CN")
    assert len(segments) == 2
    assert segments[0]["text"] == "你"
    assert segments[0]["word_timings"] == [{"text": "你", "start": 0.0, "end": 0.5}]
    assert segments[1]["text"] == "好"
    assert segments[1]["word_timings"] == [{"text": "好", "start": 3.1, "end": 3.6}]


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


def test_segments_from_utterances_strips_spaces_and_assigns_ids():
    """Utterance transcript spaces are stripped; id/start/end match utterance."""
    utterances = [
        {
            "start": 0.24, "end": 1.92, "transcript": "我 的 桌 子",
            "words": [
                {"word": "我", "start": 0.24, "end": 0.48, "punctuated_word": "我",
                 "speaker": 0, "speaker_confidence": 0.9, "confidence": 0.9},
                {"word": "的", "start": 0.72, "end": 0.96, "punctuated_word": "的",
                 "speaker": 0, "speaker_confidence": 0.9, "confidence": 0.9},
                {"word": "桌", "start": 1.12, "end": 1.28, "punctuated_word": "桌",
                 "speaker": 0, "speaker_confidence": 0.9, "confidence": 0.9},
                {"word": "子", "start": 1.44, "end": 1.92, "punctuated_word": "子",
                 "speaker": 0, "speaker_confidence": 0.9, "confidence": 0.9},
            ],
            "speaker": 0, "id": "abc", "channel": 0, "confidence": 0.96,
        }
    ]
    segments = _segments_from_utterances(utterances, language="zh-CN")
    assert len(segments) == 1
    assert segments[0]["id"] == 0
    assert segments[0]["text"] == "我的桌子"
    assert segments[0]["start"] == 0.24
    assert segments[0]["end"] == 1.92
    assert len(segments[0]["word_timings"]) == 4
    assert segments[0]["word_timings"][0] == {"text": "我", "start": 0.24, "end": 0.48}
    assert segments[0]["word_timings"][3] == {"text": "子", "start": 1.44, "end": 1.92}


def test_segments_from_utterances_uses_punctuated_word():
    """punctuated_word is preferred over word key for word_timing text."""
    utterances = [
        {
            "start": 0.0, "end": 1.0, "transcript": "你 好。",
            "words": [
                {"word": "你", "start": 0.0, "end": 0.4, "punctuated_word": "你",
                 "speaker": 0, "speaker_confidence": 0.9, "confidence": 0.9},
                {"word": "好", "start": 0.5, "end": 1.0, "punctuated_word": "好。",
                 "speaker": 0, "speaker_confidence": 0.9, "confidence": 0.9},
            ],
            "speaker": 0, "id": "xyz", "channel": 0, "confidence": 0.99,
        }
    ]
    segments = _segments_from_utterances(utterances, language="zh-CN")
    assert segments[0]["text"] == "你好。"
    assert segments[0]["word_timings"][1]["text"] == "好。"


def test_segments_from_utterances_skips_empty():
    """Utterances with empty transcript after space-stripping are skipped."""
    utterances = [
        {"start": 0.0, "end": 0.1, "transcript": " ", "words": [],
         "speaker": 0, "id": "a", "channel": 0, "confidence": 0.0},
        {"start": 1.0, "end": 2.0, "transcript": "你 好",
         "words": [
             {"word": "你", "start": 1.0, "end": 1.4, "punctuated_word": "你",
              "speaker": 0, "speaker_confidence": 0.9, "confidence": 0.9},
             {"word": "好", "start": 1.5, "end": 2.0, "punctuated_word": "好",
              "speaker": 0, "speaker_confidence": 0.9, "confidence": 0.9},
         ],
         "speaker": 0, "id": "b", "channel": 0, "confidence": 0.99},
    ]
    segments = _segments_from_utterances(utterances, language="zh-CN")
    assert len(segments) == 1
    assert segments[0]["text"] == "你好"
    assert segments[0]["id"] == 0  # Re-sequenced starting at 0


def test_segments_from_utterances_multiple():
    """Multiple utterances produce multiple segments with sequential ids."""
    utterances = [
        {"start": 0.0, "end": 1.0, "transcript": "你 好",
         "words": [
             {"word": "你", "start": 0.0, "end": 0.5, "punctuated_word": "你",
              "speaker": 0, "speaker_confidence": 0.9, "confidence": 0.9},
             {"word": "好", "start": 0.6, "end": 1.0, "punctuated_word": "好",
              "speaker": 0, "speaker_confidence": 0.9, "confidence": 0.9},
         ],
         "speaker": 0, "id": "a", "channel": 0, "confidence": 0.99},
        {"start": 2.0, "end": 3.0, "transcript": "再 见",
         "words": [
             {"word": "再", "start": 2.0, "end": 2.4, "punctuated_word": "再",
              "speaker": 0, "speaker_confidence": 0.9, "confidence": 0.9},
             {"word": "见", "start": 2.5, "end": 3.0, "punctuated_word": "见",
              "speaker": 0, "speaker_confidence": 0.9, "confidence": 0.9},
         ],
         "speaker": 0, "id": "b", "channel": 0, "confidence": 0.99},
    ]
    segments = _segments_from_utterances(utterances, language="zh-CN")
    assert len(segments) == 2
    assert segments[0]["id"] == 0
    assert segments[1]["id"] == 1
    assert segments[1]["text"] == "再见"


@pytest.mark.asyncio
async def test_transcribe_audio_deepgram_uses_utterances(tmp_path):
    """When utterances are present, they are used as the primary segment source."""
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
                }],
            }],
            "utterances": [
                {
                    "start": 0.0, "end": 1.0,
                    "transcript": "你好 世界。",
                    "words": [
                        {"word": "你好", "start": 0.0, "end": 0.5,
                         "punctuated_word": "你好", "speaker": 0,
                         "speaker_confidence": 0.9, "confidence": 0.9},
                        {"word": "世界", "start": 0.5, "end": 1.0,
                         "punctuated_word": "世界。", "speaker": 0,
                         "speaker_confidence": 0.9, "confidence": 0.9},
                    ],
                    "speaker": 0, "id": "u1", "channel": 0, "confidence": 0.99,
                },
                {
                    "start": 3.0, "end": 4.0,
                    "transcript": "谢谢 你！",
                    "words": [
                        {"word": "谢谢", "start": 3.0, "end": 3.5,
                         "punctuated_word": "谢谢", "speaker": 1,
                         "speaker_confidence": 0.9, "confidence": 0.9},
                        {"word": "你", "start": 3.5, "end": 4.0,
                         "punctuated_word": "你！", "speaker": 1,
                         "speaker_confidence": 0.9, "confidence": 0.9},
                    ],
                    "speaker": 1, "id": "u2", "channel": 0, "confidence": 0.99,
                },
            ],
        },
    }

    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = mock_json
    mock_response.raise_for_status = MagicMock()

    with patch("app.transcription.services.transcription_deepgram.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client_cls.return_value = mock_client

        segments = await transcribe_audio_deepgram(audio_file, api_key="test_key", language="zh-CN")

    assert len(segments) == 2
    assert segments[0]["text"] == "你好世界。"
    assert segments[0]["start"] == 0.0
    assert segments[0]["word_timings"][1]["text"] == "世界。"
    assert segments[1]["text"] == "谢谢你！"
    assert segments[1]["start"] == 3.0


@pytest.mark.asyncio
async def test_transcribe_audio_deepgram_falls_back_to_words(tmp_path):
    """Without utterances, falls back to word-level grouping with word_timings."""
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
                        {"word": "你好", "start": 0.0, "end": 0.5,
                         "punctuated_word": "你好", "speaker": 0,
                         "speaker_confidence": 0.9},
                        {"word": "世界", "start": 0.5, "end": 1.0,
                         "punctuated_word": "世界。", "speaker": 0,
                         "speaker_confidence": 0.9},
                        {"word": "谢谢", "start": 3.0, "end": 3.5,
                         "punctuated_word": "谢谢", "speaker": 1,
                         "speaker_confidence": 0.9},
                        {"word": "你", "start": 3.5, "end": 4.0,
                         "punctuated_word": "你！", "speaker": 1,
                         "speaker_confidence": 0.9},
                    ],
                }],
            }],
            # No "utterances" key — triggers fallback
        },
    }

    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = mock_json
    mock_response.raise_for_status = MagicMock()

    with patch("app.transcription.services.transcription_deepgram.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client_cls.return_value = mock_client

        segments = await transcribe_audio_deepgram(audio_file, api_key="test_key", language="zh-CN")

    assert len(segments) == 2
    assert segments[0]["text"] == "你好世界。"
    assert segments[1]["text"] == "谢谢你！"
    # Fallback segments must include word_timings from constituent words
    assert len(segments[0]["word_timings"]) == 2
    assert segments[0]["word_timings"][0]["text"] == "你好"
    assert segments[0]["word_timings"][1]["text"] == "世界。"


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

    with patch("app.transcription.services.transcription_deepgram.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client_cls.return_value = mock_client

        with pytest.raises(httpx.HTTPStatusError):
            await transcribe_audio_deepgram(audio_file, api_key="bad_key", language="zh-CN")


def test_finalize_segment_english_preserves_spaces():
    """Non-CJK words must be joined with spaces, not concatenated."""
    words = [
        {"text": "Hello", "start": 0.0, "end": 0.5},
        {"text": "world.", "start": 0.5, "end": 1.0},
    ]
    seg = _finalize_segment(words, 0, language="en")
    assert seg["text"] == "Hello world."


def test_finalize_segment_chinese_strips_spaces():
    """CJK tokens must be joined without spaces."""
    words = [
        {"text": "你好", "start": 0.0, "end": 0.5},
        {"text": "世界。", "start": 0.5, "end": 1.0},
    ]
    seg = _finalize_segment(words, 0, language="zh-CN")
    assert seg["text"] == "你好世界。"


def test_group_words_english_preserves_spaces():
    """Word fallback path must join English words with spaces."""
    words = [
        {"text": "Hello", "start": 0.0, "end": 0.5},
        {"text": "world.", "start": 0.5, "end": 1.0},
    ]
    segments = _group_words_into_segments(words, language="en")
    assert len(segments) == 1
    assert segments[0]["text"] == "Hello world."


def test_group_words_chinese_strips_spaces():
    """Word fallback path must strip spaces for CJK."""
    words = [
        {"text": "你好", "start": 0.0, "end": 0.5},
        {"text": "世界。", "start": 0.5, "end": 1.0},
    ]
    segments = _group_words_into_segments(words, language="zh-CN")
    assert len(segments) == 1
    assert segments[0]["text"] == "你好世界。"


def test_segments_from_utterances_english_preserves_spaces():
    """Utterance transcripts for non-CJK must keep word spaces."""
    utterances = [
        {
            "start": 0.0, "end": 1.0,
            "transcript": "Hello world.",
            "words": [
                {"word": "Hello", "punctuated_word": "Hello", "start": 0.0, "end": 0.5,
                 "speaker": 0, "speaker_confidence": 0.9, "confidence": 0.9},
                {"word": "world", "punctuated_word": "world.", "start": 0.5, "end": 1.0,
                 "speaker": 0, "speaker_confidence": 0.9, "confidence": 0.9},
            ],
            "speaker": 0, "id": "u1", "channel": 0, "confidence": 0.99,
        }
    ]
    segments = _segments_from_utterances(utterances, language="en")
    assert segments[0]["text"] == "Hello world."


def test_segments_from_utterances_chinese_strips_spaces():
    """Utterance transcripts for CJK must have spaces stripped."""
    utterances = [
        {
            "start": 0.0, "end": 1.0,
            "transcript": "你好 世界。",
            "words": [],
            "speaker": 0, "id": "u1", "channel": 0, "confidence": 0.99,
        }
    ]
    segments = _segments_from_utterances(utterances, language="zh-CN")
    assert segments[0]["text"] == "你好世界。"


def _minimal_deepgram_json():
    return {
        "results": {
            "channels": [],
            "utterances": [
                {
                    "start": 0.0, "end": 1.0, "transcript": "你好",
                    "words": [
                        {"word": "你好", "start": 0.0, "end": 1.0, "punctuated_word": "你好",
                         "speaker": 0, "speaker_confidence": 0.9, "confidence": 0.9},
                    ],
                    "speaker": 0, "id": "u1", "channel": 0, "confidence": 0.99,
                }
            ],
        }
    }


@pytest.mark.asyncio
async def test_transcribe_retries_on_429_then_succeeds(tmp_path):
    """transcribe_audio_deepgram retries on 429 and returns segments on success."""
    audio_file = tmp_path / "test.mp3"
    audio_file.write_bytes(b"fake audio data")

    ok_response = MagicMock()
    ok_response.status_code = 200
    ok_response.raise_for_status = MagicMock()
    ok_response.json.return_value = _minimal_deepgram_json()

    rate_limit_response = MagicMock()
    rate_limit_response.status_code = 429
    rate_limit_response.text = "Too Many Requests"
    rate_limit_response.raise_for_status = MagicMock(
        side_effect=httpx.HTTPStatusError("429", request=MagicMock(), response=rate_limit_response)
    )

    with patch("app.transcription.services.transcription_deepgram.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.post = AsyncMock(side_effect=[rate_limit_response, ok_response])
        mock_client_cls.return_value = mock_client

        with patch("asyncio.sleep", new_callable=AsyncMock):
            segments = await transcribe_audio_deepgram(audio_file, api_key="key", language="zh-CN")

    assert len(segments) == 1
    assert mock_client.post.call_count == 2


@pytest.mark.asyncio
async def test_transcribe_retries_on_503(tmp_path):
    """transcribe_audio_deepgram retries on 503 and returns segments on success."""
    audio_file = tmp_path / "test.mp3"
    audio_file.write_bytes(b"fake audio data")

    ok_response = MagicMock()
    ok_response.status_code = 200
    ok_response.raise_for_status = MagicMock()
    ok_response.json.return_value = _minimal_deepgram_json()

    server_error_response = MagicMock()
    server_error_response.status_code = 503
    server_error_response.text = "Service Unavailable"
    server_error_response.raise_for_status = MagicMock(
        side_effect=httpx.HTTPStatusError("503", request=MagicMock(), response=server_error_response)
    )

    with patch("app.transcription.services.transcription_deepgram.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.post = AsyncMock(side_effect=[server_error_response, ok_response])
        mock_client_cls.return_value = mock_client

        with patch("asyncio.sleep", new_callable=AsyncMock):
            segments = await transcribe_audio_deepgram(audio_file, api_key="key", language="zh-CN")

    assert len(segments) == 1
    assert mock_client.post.call_count == 2


def test_finalize_segment_japanese_strips_spaces():
    """_finalize_segment removes word-boundary spaces for Japanese text."""
    words = [
        {"text": "日本", "start": 0.0, "end": 0.5},
        {"text": "語", "start": 0.5, "end": 0.8},
    ]
    seg = _finalize_segment(words, 0, language="ja-JP")
    assert seg["text"] == "日本語"


def test_group_words_japanese_strips_spaces():
    """_group_words_into_segments removes spaces between words for Japanese."""
    words = [
        {"text": "東", "start": 0.0, "end": 0.3},
        {"text": "京。", "start": 0.3, "end": 0.6},
    ]
    segments = _group_words_into_segments(words, language="ja-JP")
    assert segments[0]["text"] == "東京。"
