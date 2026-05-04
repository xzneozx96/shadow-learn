import json
from unittest.mock import AsyncMock, patch

import httpx as _httpx
import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


def _ok_response():
    request = _httpx.Request("POST", "https://openrouter.ai/api/v1/chat/completions")
    return _httpx.Response(
        200,
        json={
            "choices": [
                {"message": {"content": "Học là đứa trẻ ngồi dưới mái nhà..."}}
            ]
        },
        request=request,
    )


_BREAKDOWN_PAYLOAD = {
    "word": "学习",
    "pinyin": "xuéxí",
    "meaning": "to study",
    "sino_vietnamese": "học tập",
    "characters": [
        {
            "char": "学", "pinyin": "xué", "sino_vietnamese": "học",
            "meaning": "to learn",
            "components": [{"name": "child", "meaning": "young learner"}],
        },
        {
            "char": "习", "pinyin": "xí", "sino_vietnamese": "tập",
            "meaning": "to practice",
            "components": [{"name": "feather", "meaning": "young bird"}],
        },
    ],
    "openrouter_api_key": "sk-test",
}


@pytest.mark.asyncio
async def test_breakdown_story_returns_story():
    with patch("app.vocab.router.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__.return_value = mock_client
        mock_client.post.return_value = _ok_response()
        mock_client_cls.return_value = mock_client

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post("/api/vocab/breakdown-story", json=_BREAKDOWN_PAYLOAD)

    assert resp.status_code == 200
    body = resp.json()
    assert "story" in body
    assert "Học" in body["story"]


@pytest.mark.asyncio
async def test_breakdown_story_sends_system_and_user_prompts():
    captured = {}

    def capture_post(*args, **kwargs):
        captured["payload"] = kwargs.get("json") or json.loads(args[1] if len(args) > 1 else "{}")
        return _ok_response()

    with patch("app.vocab.router.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__.return_value = mock_client
        mock_client.post.side_effect = capture_post
        mock_client_cls.return_value = mock_client

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            await client.post("/api/vocab/breakdown-story", json=_BREAKDOWN_PAYLOAD)

    payload = captured["payload"]
    msgs = payload["messages"]
    assert msgs[0]["role"] == "system"
    assert "Vietnamese-speaking learners" in msgs[0]["content"]
    assert msgs[1]["role"] == "user"
    assert "学习" in msgs[1]["content"]
    assert "luyện" not in msgs[1]["content"]  # only chars in payload should appear
    assert "học" in msgs[1]["content"]


@pytest.mark.asyncio
async def test_breakdown_story_400_when_no_api_key(monkeypatch):
    monkeypatch.setattr("app.vocab.router.settings.openrouter_api_key", None)
    payload = {**_BREAKDOWN_PAYLOAD, "openrouter_api_key": None}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post("/api/vocab/breakdown-story", json=payload)
    assert resp.status_code == 400
    assert "OpenRouter" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_breakdown_story_500_on_openrouter_error():
    with patch("app.vocab.router.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__.return_value = mock_client
        request = _httpx.Request("POST", "https://openrouter.ai/api/v1/chat/completions")
        mock_client.post.return_value = _httpx.Response(500, json={"error": "boom"}, request=request)
        mock_client_cls.return_value = mock_client

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post("/api/vocab/breakdown-story", json=_BREAKDOWN_PAYLOAD)

    assert resp.status_code in (500, 502)
