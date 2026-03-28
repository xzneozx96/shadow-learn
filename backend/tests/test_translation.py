import json
import httpx
import pytest
from unittest.mock import patch, AsyncMock, MagicMock
from app.services.translation import (
    _build_translation_prompt,
    translate_segments,
)
from app.config import settings


def test_build_translation_prompt():
    """Verify segments and target language appear in the prompt."""
    segments = [
        {"id": 0, "text": "你好世界"},
        {"id": 1, "text": "今天是星期四"},
    ]
    languages = ["English", "Spanish"]
    prompt = _build_translation_prompt(segments, languages)

    assert "你好世界" in prompt
    assert "今天是星期四" in prompt
    assert "English" in prompt
    assert "Spanish" in prompt


@pytest.mark.asyncio
async def test_translate_segments_parses_response():
    """Mock OpenRouter response, verify translations are parsed onto segments."""
    segments = [
        {"id": 0, "start": 0.0, "end": 1.0, "text": "你好"},
        {"id": 1, "start": 1.5, "end": 2.5, "text": "世界"},
    ]
    languages = ["English"]

    # Simulate LLM response with a JSON array of translation objects
    mock_content = json.dumps({
        "translations": [
            {"id": 0, "translations": [{"language": "English", "text": "Hello"}]},
            {"id": 1, "translations": [{"language": "English", "text": "World"}]},
        ]
    })
    mock_response_data = {
        "choices": [{"message": {"content": mock_content}}]
    }

    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = mock_response_data
    mock_response.raise_for_status = MagicMock()

    with patch("app.services.translation.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client_cls.return_value = mock_client

        result = await translate_segments(
            segments,
            languages=languages,
            api_key="test_key",
        )

    assert len(result) == 2
    assert result[0]["translations"]["English"] == "Hello"
    assert result[1]["translations"]["English"] == "World"

    call_kwargs = mock_client.post.call_args.kwargs["json"]
    assert call_kwargs["model"] == settings.openrouter_structured_model


@pytest.mark.asyncio
async def test_translate_segments_parses_structured_output():
    """Mock OpenRouter structured output response (json_schema format), verify parsing."""
    segments = [
        {"id": 0, "start": 0.0, "end": 1.0, "text": "你好"},
        {"id": 1, "start": 1.5, "end": 2.5, "text": "世界"},
    ]
    languages = ["English"]

    mock_content = json.dumps({
        "translations": [
            {"id": 0, "translations": [{"language": "English", "text": "Hello"}]},
            {"id": 1, "translations": [{"language": "English", "text": "World"}]},
        ]
    })
    mock_response_data = {"choices": [{"message": {"content": mock_content}}]}

    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = mock_response_data
    mock_response.raise_for_status = MagicMock()

    with patch("app.services.translation.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client_cls.return_value = mock_client

        result = await translate_segments(segments, languages=languages, api_key="test_key")

    assert len(result) == 2
    assert result[0]["translations"]["English"] == "Hello"
    assert result[1]["translations"]["English"] == "World"

    call_kwargs = mock_client.post.call_args.kwargs["json"]
    assert call_kwargs["model"] == settings.openrouter_structured_model
    assert call_kwargs["response_format"]["type"] == "json_schema"
    assert call_kwargs["response_format"]["json_schema"]["strict"] is True
    assert call_kwargs["reasoning"] == {"effort": "none"}


def test_build_translation_prompt_english():
    """English source language should mention 'English' in the prompt, not 'Chinese'."""
    segments = [{"id": 0, "text": "Hello world"}]
    languages = ["Spanish"]
    prompt = _build_translation_prompt(segments, languages, source_language="en")
    assert "English" in prompt
    assert "Chinese" not in prompt


def _ok_translation_response():
    content = json.dumps({
        "translations": [{"id": 0, "translations": [{"language": "English", "text": "Hello"}]}]
    })
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.raise_for_status = MagicMock()
    mock_response.json.return_value = {"choices": [{"message": {"content": content}}]}
    return mock_response


@pytest.mark.asyncio
async def test_translate_batch_retries_on_429():
    """_translate_batch retries on 429 and returns translations on subsequent success."""
    rate_limit_response = MagicMock()
    rate_limit_response.status_code = 429
    rate_limit_response.raise_for_status = MagicMock(
        side_effect=httpx.HTTPStatusError("429", request=MagicMock(), response=rate_limit_response)
    )

    with patch("app.services.translation.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.post = AsyncMock(side_effect=[rate_limit_response, _ok_translation_response()])
        mock_client_cls.return_value = mock_client

        with patch("asyncio.sleep", new_callable=AsyncMock):
            result = await translate_segments(
                [{"id": 0, "start": 0.0, "end": 1.0, "text": "你好"}],
                languages=["English"],
                api_key="key",
            )

    assert result[0]["translations"]["English"] == "Hello"
    assert mock_client.post.call_count == 2


@pytest.mark.asyncio
async def test_translate_batch_retries_on_connect_error():
    """_translate_batch retries on ConnectError and returns translations on subsequent success."""
    with patch("app.services.translation.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.post = AsyncMock(
            side_effect=[httpx.ConnectError("connection refused"), _ok_translation_response()]
        )
        mock_client_cls.return_value = mock_client

        with patch("asyncio.sleep", new_callable=AsyncMock):
            result = await translate_segments(
                [{"id": 0, "start": 0.0, "end": 1.0, "text": "你好"}],
                languages=["English"],
                api_key="key",
            )

    assert result[0]["translations"]["English"] == "Hello"
    assert mock_client.post.call_count == 2
