import json
from unittest.mock import AsyncMock, patch

import pytest

pytestmark = [pytest.mark.asyncio(loop_scope="session"), pytest.mark.usefixtures("stored_user", "provider_env")]

PASSAGE_RESP = {
    "choices": [{"message": {"content": json.dumps({"passage": "你好世界。", "pinyin": "Nǐ hǎo shìjiè."})}}]
}
GRADE_RESP = {
    "choices": [{"message": {"content": json.dumps({"score": "good", "feedback": "Good translation."})}}]
}
SENTENCE_GRADE_RESP = {
    "choices": [{"message": {"content": json.dumps({"correct": True, "feedback": "Used correctly."})}}]
}

def _mock_httpx(response_data):
    mock = AsyncMock()
    mock.__aenter__ = AsyncMock(return_value=mock)
    mock.__aexit__ = AsyncMock(return_value=False)
    mock_resp = AsyncMock()
    mock_resp.raise_for_status = AsyncMock()
    mock_resp.json = lambda: response_data
    mock.post = AsyncMock(return_value=mock_resp)
    return mock


async def test_generate_passage_returns_passage(client):
    with patch("httpx.AsyncClient", return_value=_mock_httpx(PASSAGE_RESP)):
        resp = await client.post("/api/daily-review/passage", json={
            "words": [{"hanzi": "你好", "pinyin": "nǐ hǎo", "meaning": "hello"}],
            "source_language": "zh-CN",
        })
    assert resp.status_code == 200
    data = resp.json()
    assert "passage" in data
    assert "pinyin" in data


async def test_grade_passage_returns_score(client):
    with patch("httpx.AsyncClient", return_value=_mock_httpx(GRADE_RESP)):
        resp = await client.post("/api/daily-review/grade-passage", json={
            "passage": "你好世界。",
            "user_translation": "Hello world.",
            "source_language": "zh-CN",
        })
    assert resp.status_code == 200
    data = resp.json()
    assert data["score"] in ("excellent", "good", "needs-work")
    assert "feedback" in data


async def test_grade_sentence_returns_correct(client):
    with patch("httpx.AsyncClient", return_value=_mock_httpx(SENTENCE_GRADE_RESP)):
        resp = await client.post("/api/daily-review/grade-sentence", json={
            "hanzi": "你好",
            "meaning": "hello",
            "user_sentence": "Tôi nói 你好 với anh ấy.",
        })
    assert resp.status_code == 200
    data = resp.json()
    assert "correct" in data
    assert "feedback" in data


async def test_generate_passage_missing_api_key_raises(client, monkeypatch):
    monkeypatch.setattr("app.keys.service.settings.openrouter_api_key", None)
    resp = await client.post("/api/daily-review/passage", json={
        "words": [{"hanzi": "你好", "pinyin": "nǐ hǎo", "meaning": "hello"}],
        "source_language": "zh-CN",
    })
    assert resp.status_code == 400
    assert resp.json()["detail"] == "No OpenRouter key configured. Add one in Settings."
