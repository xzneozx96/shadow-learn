import json
from unittest.mock import AsyncMock, patch

import httpx as _httpx
import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.routers.quiz import WordInput, QuizRequest, _build_cloze_prompt

_WORDS = [{"word": "今天", "romanization": "jīntiān", "meaning": "today", "usage": "今天很好"}]
_CLOZE_BODY = {"exercises": [{"story": "今天很好。", "blanks": ["今天"]}]}


def _ok_response():
    return _httpx.Response(200, json={"choices": [{"message": {"content": json.dumps(_CLOZE_BODY)}}]})


def test_word_input_uses_romanization_field():
    """WordInput must accept 'romanization', not 'pinyin'."""
    w = WordInput(word="hello", romanization="/həˈloʊ/", meaning="a greeting", usage="Hello world")
    assert w.romanization == "/həˈloʊ/"
    assert not hasattr(w, "pinyin")


def test_quiz_request_has_source_language():
    """QuizRequest must have source_language, defaulting to zh-CN."""
    req = QuizRequest(
        openrouter_api_key="key",
        words=[WordInput(word="你好", romanization="nǐ hǎo", meaning="hello", usage="你好世界")],
        exercise_type="cloze",
    )
    assert req.source_language == "zh-CN"


def test_build_cloze_prompt_english():
    """Cloze prompt for English should say 'English' not 'Mandarin Chinese'."""
    from app.services.language_config import get_language_config
    words = [WordInput(word="hello", romanization="/həˈloʊ/", meaning="greeting", usage="Hello world")]
    lang_cfg = get_language_config("en")
    prompt = _build_cloze_prompt(words, story_count=1, lang_cfg=lang_cfg)
    assert "English" in prompt
    assert "Chinese" not in prompt


@pytest.mark.asyncio
async def test_quiz_uses_json_schema_for_cloze(respx_mock):
    """generate_quiz must send json_schema response_format for cloze."""
    import json
    import httpx as _httpx
    captured = {}

    def capture_post(request: _httpx.Request):
        captured["payload"] = json.loads(request.content)
        return _httpx.Response(
            200,
            json={"choices": [{"message": {"content": json.dumps({"exercises": [{"story": "今天很好。", "blanks": ["今天"]}]})}}]},
        )

    respx_mock.post("https://openrouter.ai/api/v1/chat/completions").mock(side_effect=capture_post)

    from httpx import AsyncClient, ASGITransport
    from app.main import app
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post("/api/quiz/generate", json={
            "openrouter_api_key": "key",
            "words": [{"word": "今天", "romanization": "jīntiān", "meaning": "today", "usage": "今天很好"}],
            "exercise_type": "cloze",
        })
    assert resp.status_code == 200
    assert captured["payload"]["response_format"]["type"] == "json_schema"
    assert captured["payload"]["response_format"]["json_schema"]["name"] == "cloze_response"
    assert captured["payload"]["reasoning"] == {"effort": "none"}


@pytest.mark.asyncio
async def test_quiz_uses_json_schema_for_pronunciation(respx_mock):
    """generate_quiz must send json_schema response_format for pronunciation_sentence."""
    import json
    import httpx as _httpx
    captured = {}

    def capture_post(request: _httpx.Request):
        captured["payload"] = json.loads(request.content)
        return _httpx.Response(
            200,
            json={"choices": [{"message": {"content": json.dumps({"exercises": [{"sentence": "今天天气很好。", "translation": "The weather is nice today.", "romanization": "jīntiān tiānqì hěn hǎo"}]})}}]},
        )

    respx_mock.post("https://openrouter.ai/api/v1/chat/completions").mock(side_effect=capture_post)

    from httpx import AsyncClient, ASGITransport
    from app.main import app
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post("/api/quiz/generate", json={
            "openrouter_api_key": "key",
            "words": [{"word": "今天", "romanization": "jīntiān", "meaning": "today", "usage": "今天很好"}],
            "exercise_type": "pronunciation_sentence",
        })
    assert resp.status_code == 200
    assert captured["payload"]["response_format"]["type"] == "json_schema"
    assert captured["payload"]["response_format"]["json_schema"]["name"] == "pronunciation_exercises"
    assert captured["payload"]["reasoning"] == {"effort": "none"}


@pytest.mark.asyncio
async def test_generate_quiz_retries_on_429(respx_mock):
    """generate_quiz retries and succeeds after an initial 429."""
    call_count = 0

    def side_effect(request):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return _httpx.Response(429)
        return _ok_response()

    respx_mock.post("https://openrouter.ai/api/v1/chat/completions").mock(side_effect=side_effect)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        with patch("asyncio.sleep", new_callable=AsyncMock):
            resp = await client.post("/api/quiz/generate", json={
                "openrouter_api_key": "key",
                "words": _WORDS,
                "exercise_type": "cloze",
            })

    assert resp.status_code == 200
    assert call_count == 2


@pytest.mark.asyncio
async def test_generate_quiz_retries_on_truncated_response(respx_mock):
    """generate_quiz retries when finish_reason='length' then succeeds."""
    call_count = 0

    def side_effect(request):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return _httpx.Response(200, json={"choices": [{"finish_reason": "length", "message": {"content": '{"exercises":'}}]})
        return _ok_response()

    respx_mock.post("https://openrouter.ai/api/v1/chat/completions").mock(side_effect=side_effect)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        with patch("asyncio.sleep", new_callable=AsyncMock):
            resp = await client.post("/api/quiz/generate", json={
                "openrouter_api_key": "key",
                "words": _WORDS,
                "exercise_type": "cloze",
            })

    assert resp.status_code == 200
    assert call_count == 2
