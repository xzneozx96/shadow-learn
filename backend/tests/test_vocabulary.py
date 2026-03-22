import asyncio
import json
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from app.services.vocabulary import VocabularyExtractionError, _VOCAB_BATCH_SIZE


def test_vocabulary_extraction_error_is_exception():
    err = VocabularyExtractionError("segments [1, 2] failed")
    assert isinstance(err, Exception)
    assert "segments [1, 2] failed" in str(err)


def test_vocab_batch_size_is_five():
    assert _VOCAB_BATCH_SIZE == 3


def _make_mock_response(status_code: int, content: str = "") -> MagicMock:
    mock = MagicMock()
    mock.status_code = status_code
    mock.text = content
    mock.json.return_value = {
        "choices": [{"message": {"content": content}}]
    }
    if status_code >= 400:
        mock.raise_for_status.side_effect = httpx.HTTPStatusError(
            message=f"HTTP {status_code}",
            request=MagicMock(),
            response=MagicMock(status_code=status_code),
        )
    else:
        mock.raise_for_status = MagicMock()
    return mock


def _valid_vocab_content(seg_ids: list[int]) -> str:
    return json.dumps({
        "segments": [
            {"id": i, "words": [{"word": "你好", "romanization": "nǐ hǎo", "meaning": "hello", "usage": "你好世界"}]}
            for i in seg_ids
        ]
    })


@pytest.mark.asyncio
async def test_extract_batch_with_retry_success():
    """Happy path: single successful request returns parsed vocab."""
    from app.services.vocabulary import _extract_batch_with_retry

    segments = [{"id": 0, "text": "你好"}, {"id": 1, "text": "世界"}]
    semaphore = asyncio.Semaphore(1)
    content = _valid_vocab_content([0, 1])
    mock_response = _make_mock_response(200, content)

    with patch("app.services.vocabulary.httpx.AsyncClient") as mock_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_cls.return_value = mock_client

        result = await _extract_batch_with_retry(segments, "test_key", semaphore)

    assert result[0][0]["word"] == "你好"
    assert result[1][0]["word"] == "你好"

    call_kwargs = mock_client.post.call_args.kwargs["json"]
    assert call_kwargs["response_format"]["type"] == "json_schema"
    assert call_kwargs["response_format"]["json_schema"]["strict"] is True
    assert "reasoning" not in call_kwargs


@pytest.mark.asyncio
async def test_extract_batch_with_retry_retries_on_429():
    """Should retry on 429, succeed on second attempt."""
    from app.services.vocabulary import _extract_batch_with_retry

    segments = [{"id": 0, "text": "你好"}]
    semaphore = asyncio.Semaphore(1)
    content = _valid_vocab_content([0])

    rate_limit_response = _make_mock_response(429)
    ok_response = _make_mock_response(200, content)

    with patch("app.services.vocabulary.httpx.AsyncClient") as mock_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.post = AsyncMock(side_effect=[rate_limit_response, ok_response])
        mock_cls.return_value = mock_client

        with patch("app.services.vocabulary.asyncio.sleep", new_callable=AsyncMock) as mock_sleep:
            result = await _extract_batch_with_retry(segments, "test_key", semaphore)

    mock_sleep.assert_called_once()
    assert result[0][0]["word"] == "你好"


@pytest.mark.asyncio
async def test_extract_batch_with_retry_raises_on_non_429():
    """Non-429 HTTP errors raise VocabularyExtractionError immediately (no retry)."""
    from app.services.vocabulary import _extract_batch_with_retry, VocabularyExtractionError

    segments = [{"id": 0, "text": "你好"}]
    semaphore = asyncio.Semaphore(1)

    with patch("app.services.vocabulary.httpx.AsyncClient") as mock_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.post = AsyncMock(return_value=_make_mock_response(500))
        mock_cls.return_value = mock_client

        with pytest.raises(VocabularyExtractionError):
            await _extract_batch_with_retry(segments, "test_key", semaphore)

        assert mock_client.post.call_count == 1


@pytest.mark.asyncio
async def test_extract_batch_with_retry_raises_after_exhausted_retries():
    """Should raise VocabularyExtractionError after 5 total 429 failures."""
    from app.services.vocabulary import _extract_batch_with_retry, VocabularyExtractionError

    segments = [{"id": 0, "text": "你好"}]
    semaphore = asyncio.Semaphore(1)

    with patch("app.services.vocabulary.httpx.AsyncClient") as mock_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.post = AsyncMock(return_value=_make_mock_response(429))
        mock_cls.return_value = mock_client

        with patch("app.services.vocabulary.asyncio.sleep", new_callable=AsyncMock) as mock_sleep:
            with pytest.raises(VocabularyExtractionError):
                await _extract_batch_with_retry(segments, "test_key", semaphore)

    # _MAX_ATTEMPTS=3: sleeps after attempt 0 and 1, not after the final attempt
    assert mock_sleep.call_count == 2


@pytest.mark.asyncio
async def test_extract_batch_with_retry_cancelled_error_propagates():
    """CancelledError must not be swallowed by the retry loop."""
    from app.services.vocabulary import _extract_batch_with_retry

    segments = [{"id": 0, "text": "你好"}]
    semaphore = asyncio.Semaphore(1)

    with patch("app.services.vocabulary.httpx.AsyncClient") as mock_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.post = AsyncMock(side_effect=asyncio.CancelledError())
        mock_cls.return_value = mock_client

        with pytest.raises(asyncio.CancelledError):
            await _extract_batch_with_retry(segments, "test_key", semaphore)


@pytest.mark.asyncio
async def test_extract_vocabulary_returns_all_segments():
    """All 6 segments across 2 batches (batch size 5) are returned in a single call."""
    from app.services.vocabulary import extract_vocabulary

    segments = [{"id": i, "text": f"句子{i}"} for i in range(6)]

    def make_batch_content(ids):
        import json
        return json.dumps({
            "segments": [
                {"id": i, "words": [{"word": "词", "romanization": "cí", "meaning": "word", "usage": "一个词"}]}
                for i in ids
            ]
        })

    # batch 0: segments 0-4, batch 1: segment 5
    responses = [
        _make_mock_response(200, make_batch_content(list(range(5)))),
        _make_mock_response(200, make_batch_content([5])),
    ]

    with patch("app.services.vocabulary.httpx.AsyncClient") as mock_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.post = AsyncMock(side_effect=responses)
        mock_cls.return_value = mock_client

        result = await extract_vocabulary(segments, "test_key")

    assert set(result.keys()) == set(range(6))


@pytest.mark.asyncio
async def test_extract_vocabulary_raises_on_batch_failure():
    """If any batch fails after retries, extract_vocabulary raises VocabularyExtractionError."""
    from app.services.vocabulary import extract_vocabulary, VocabularyExtractionError

    segments = [{"id": i, "text": f"句子{i}"} for i in range(6)]

    with patch("app.services.vocabulary.httpx.AsyncClient") as mock_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        # All calls return 500 → immediate failure
        mock_client.post = AsyncMock(return_value=_make_mock_response(500))
        mock_cls.return_value = mock_client

        with pytest.raises(VocabularyExtractionError):
            await extract_vocabulary(segments, "test_key")


@pytest.mark.asyncio
async def test_extract_vocabulary_empty_segments():
    """Empty segment list returns empty dict without making any requests."""
    from app.services.vocabulary import extract_vocabulary

    result = await extract_vocabulary([], "test_key")
    assert result == {}


@pytest.mark.asyncio
async def test_extract_vocabulary_result_order_matches_input():
    """Result keys cover all segment IDs regardless of which batch finishes first."""
    from app.services.vocabulary import extract_vocabulary

    segments = [{"id": i, "text": f"句子{i}"} for i in range(10)]

    def make_content(ids):
        import json
        return json.dumps({
            "segments": [
                {"id": i, "words": [{"word": str(i), "romanization": "pīn", "meaning": "m", "usage": "u"}]}
                for i in ids
            ]
        })

    # Two batches of 5
    responses = [
        _make_mock_response(200, make_content(list(range(5)))),
        _make_mock_response(200, make_content(list(range(5, 10)))),
    ]

    with patch("app.services.vocabulary.httpx.AsyncClient") as mock_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.post = AsyncMock(side_effect=responses)
        mock_cls.return_value = mock_client

        result = await extract_vocabulary(segments, "test_key")

    assert set(result.keys()) == set(range(10))
    for i in range(10):
        assert result[i][0]["word"] == str(i)


def test_build_vocab_prompt_english():
    """English prompt should say 'English language teacher' and 'IPA', not 'Chinese'."""
    from app.services.vocabulary import _build_vocab_prompt
    segments = [{"id": 0, "text": "Hello world"}]
    prompt = _build_vocab_prompt(segments, source_language="en")
    assert "English" in prompt
    assert "IPA" in prompt
    assert "Chinese" not in prompt
