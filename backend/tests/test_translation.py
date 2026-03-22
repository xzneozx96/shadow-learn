import json
import pytest
from unittest.mock import patch, AsyncMock, MagicMock
from app.services.translation import (
    _build_translation_prompt,
    translate_segments,
)


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
    mock_content = (
        '[{"id": 0, "translations": {"English": "Hello"}}, '
        '{"id": 1, "translations": {"English": "World"}}]'
    )
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


def test_build_translation_prompt_english():
    """English source language should mention 'English' in the prompt, not 'Chinese'."""
    segments = [{"id": 0, "text": "Hello world"}]
    languages = ["Spanish"]
    prompt = _build_translation_prompt(segments, languages, source_language="en")
    assert "English" in prompt
    assert "Chinese" not in prompt
