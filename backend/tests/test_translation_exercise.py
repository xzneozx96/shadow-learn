# backend/tests/test_translation_exercise.py
import json
from unittest.mock import AsyncMock, patch

import httpx as _httpx
import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app

_GENERATE_OK_BODY = {"sentences": [{"text": "今天很好。", "romanization": "jīntiān hěn hǎo", "translation": "Today is great."}]}
_EVALUATE_OK_BODY = {
    "overall_score": 80,
    "accuracy": {"score": 85, "comment": "Good."},
    "grammar": {"score": 75, "comment": "OK."},
    "naturalness": {"score": 80, "comment": "Natural."},
    "tip": "Keep it up.",
}


@pytest.mark.asyncio
async def test_generate_rejects_missing_word():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/translation/generate",
            json={
                "openrouter_api_key": "key",
                # missing required fields: word, romanization, meaning
            },
        )
        assert response.status_code == 422


@pytest.mark.asyncio
async def test_evaluate_rejects_missing_source():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/translation/evaluate",
            json={
                "openrouter_api_key": "key",
                # missing required fields
            },
        )
        assert response.status_code == 422


@pytest.mark.asyncio
async def test_generate_accepts_valid_payload(respx_mock):
    """Smoke test: valid payload reaches the LLM call (mocked)."""
    import httpx as _httpx
    respx_mock.post("https://openrouter.ai/api/v1/chat/completions").mock(
        return_value=_httpx.Response(
            200,
            json={
                "choices": [{
                    "message": {
                        "content": json.dumps({
                            "sentences": [
                                {"text": "今天天气很好。", "romanization": "jīntiān tiānqì hěn hǎo", "translation": "The weather is nice today."},
                                {"text": "我今天很忙。", "romanization": "wǒ jīntiān hěn máng", "translation": "I am very busy today."},
                                {"text": "今天是星期一。", "romanization": "jīntiān shì xīngqīyī", "translation": "Today is Monday."},
                            ]
                        })
                    }
                }]
            },
        )
    )
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/translation/generate",
            json={
                "openrouter_api_key": "key",
                "word": "今天",
                "romanization": "jīntiān",
                "meaning": "today",
                "usage": "",
                "sentence_count": 3,
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data["sentences"]) == 3
        assert "text" in data["sentences"][0]
        assert "translation" in data["sentences"][0]


@pytest.mark.asyncio
async def test_evaluate_accepts_valid_payload(respx_mock):
    """Smoke test: valid evaluate payload returns structured feedback."""
    import httpx as _httpx
    respx_mock.post("https://openrouter.ai/api/v1/chat/completions").mock(
        return_value=_httpx.Response(
            200,
            json={
                "choices": [{
                    "message": {
                        "content": json.dumps({
                            "overall_score": 72,
                            "accuracy": {"score": 80, "comment": "Meaning preserved."},
                            "grammar": {"score": 60, "comment": "Missing article."},
                            "naturalness": {"score": 75, "comment": "Slightly unnatural."},
                            "tip": "Add 'the' before weather.",
                        })
                    }
                }]
            },
        )
    )
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/translation/evaluate",
            json={
                "openrouter_api_key": "key",
                "source": "今天天气很好。",
                "source_language": "chinese",
                "target_language": "english",
                "reference": "The weather is nice today.",
                "user_answer": "Today weather very good.",
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert "overall_score" in data
        assert "accuracy" in data
        assert "grammar" in data
        assert "naturalness" in data
        assert "tip" in data


@pytest.mark.asyncio
async def test_generate_uses_json_schema(respx_mock):
    """generate_sentences must send json_schema response_format."""
    import httpx as _httpx
    captured = {}

    def capture_post(request: _httpx.Request):
        import json as _json
        captured["payload"] = _json.loads(request.content)
        return _httpx.Response(
            200,
            json={"choices": [{"message": {"content": _json.dumps({"sentences": [{"text": "今天。", "romanization": "jīntiān", "translation": "Today."}]})}}]},
        )

    respx_mock.post("https://openrouter.ai/api/v1/chat/completions").mock(side_effect=capture_post)

    from httpx import AsyncClient, ASGITransport
    from app.main import app
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post("/api/translation/generate", json={
            "openrouter_api_key": "key", "word": "今天", "romanization": "jīntiān", "meaning": "today",
        })
    assert resp.status_code == 200
    assert captured["payload"]["response_format"]["type"] == "json_schema"
    assert captured["payload"]["response_format"]["json_schema"]["name"] == "generate_response"
    assert captured["payload"]["reasoning"] == {"effort": "none"}


@pytest.mark.asyncio
async def test_evaluate_uses_json_schema(respx_mock):
    """evaluate_translation must send json_schema response_format."""
    import httpx as _httpx
    captured = {}

    def capture_post(request: _httpx.Request):
        import json as _json
        captured["payload"] = _json.loads(request.content)
        return _httpx.Response(
            200,
            json={"choices": [{"message": {"content": _json.dumps({
                "overall_score": 80, "accuracy": {"score": 85, "comment": "Good."},
                "grammar": {"score": 75, "comment": "OK."}, "naturalness": {"score": 80, "comment": "Natural."},
                "tip": "Try harder.",
            })}}]},
        )

    respx_mock.post("https://openrouter.ai/api/v1/chat/completions").mock(side_effect=capture_post)

    from httpx import AsyncClient, ASGITransport
    from app.main import app
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post("/api/translation/evaluate", json={
            "openrouter_api_key": "key", "source": "今天。", "source_language": "chinese",
            "target_language": "english", "reference": "Today.", "user_answer": "Today.",
        })
    assert resp.status_code == 200
    assert captured["payload"]["response_format"]["type"] == "json_schema"
    assert captured["payload"]["response_format"]["json_schema"]["name"] == "evaluate_response"
    assert captured["payload"]["reasoning"] == {"effort": "none"}


@pytest.mark.asyncio
async def test_generate_sentences_retries_on_429(respx_mock):
    """generate_sentences retries and succeeds after an initial 429."""
    call_count = 0

    def side_effect(request):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return _httpx.Response(429)
        return _httpx.Response(200, json={"choices": [{"message": {"content": json.dumps(_GENERATE_OK_BODY)}}]})

    respx_mock.post("https://openrouter.ai/api/v1/chat/completions").mock(side_effect=side_effect)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        with patch("asyncio.sleep", new_callable=AsyncMock):
            resp = await client.post("/api/translation/generate", json={
                "openrouter_api_key": "key", "word": "今天", "romanization": "jīntiān",
                "meaning": "today", "usage": "", "sentence_count": 1,
            })

    assert resp.status_code == 200
    assert call_count == 2


@pytest.mark.asyncio
async def test_evaluate_translation_retries_on_429(respx_mock):
    """evaluate_translation retries and succeeds after an initial 429."""
    call_count = 0

    def side_effect(request):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return _httpx.Response(429)
        return _httpx.Response(200, json={"choices": [{"message": {"content": json.dumps(_EVALUATE_OK_BODY)}}]})

    respx_mock.post("https://openrouter.ai/api/v1/chat/completions").mock(side_effect=side_effect)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        with patch("asyncio.sleep", new_callable=AsyncMock):
            resp = await client.post("/api/translation/evaluate", json={
                "openrouter_api_key": "key", "source": "今天。", "source_language": "chinese",
                "target_language": "english", "reference": "Today.", "user_answer": "Today.",
            })

    assert resp.status_code == 200
    assert call_count == 2
