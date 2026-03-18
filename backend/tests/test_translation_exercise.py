# backend/tests/test_translation_exercise.py
import json

import pytest
from httpx import AsyncClient, ASGITransport

from app.main import app


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
                                {"text": "今天天气很好。", "romanization": "jīntiān tiānqì hěn hǎo", "english": "The weather is nice today."},
                                {"text": "我今天很忙。", "romanization": "wǒ jīntiān hěn máng", "english": "I am very busy today."},
                                {"text": "今天是星期一。", "romanization": "jīntiān shì xīngqīyī", "english": "Today is Monday."},
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
        assert "english" in data["sentences"][0]


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
