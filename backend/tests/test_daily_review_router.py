import json
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

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


def test_generate_passage_returns_passage():
    with patch("httpx.AsyncClient", return_value=_mock_httpx(PASSAGE_RESP)):
        resp = client.post("/api/daily-review/passage", json={
            "openrouter_api_key": "test-key",
            "words": [{"hanzi": "你好", "pinyin": "nǐ hǎo", "meaning": "hello"}],
            "source_language": "zh-CN",
        })
    assert resp.status_code == 200
    data = resp.json()
    assert "passage" in data
    assert "pinyin" in data


def test_grade_passage_returns_score():
    with patch("httpx.AsyncClient", return_value=_mock_httpx(GRADE_RESP)):
        resp = client.post("/api/daily-review/grade-passage", json={
            "openrouter_api_key": "test-key",
            "passage": "你好世界。",
            "user_translation": "Hello world.",
            "source_language": "zh-CN",
        })
    assert resp.status_code == 200
    data = resp.json()
    assert data["score"] in ("excellent", "good", "needs-work")
    assert "feedback" in data


def test_grade_sentence_returns_correct():
    with patch("httpx.AsyncClient", return_value=_mock_httpx(SENTENCE_GRADE_RESP)):
        resp = client.post("/api/daily-review/grade-sentence", json={
            "openrouter_api_key": "test-key",
            "hanzi": "你好",
            "meaning": "hello",
            "user_sentence": "Tôi nói 你好 với anh ấy.",
        })
    assert resp.status_code == 200
    data = resp.json()
    assert "correct" in data
    assert "feedback" in data


def test_generate_passage_missing_api_key_raises():
    with patch("app.daily_review.router.settings") as mock_settings:
        mock_settings.openrouter_api_key = None
        mock_settings.openrouter_structured_model = "qwen/qwen3.5-flash-02-23"
        mock_settings.openrouter_chat_url = "https://openrouter.ai/api/v1/chat/completions"
        resp = client.post("/api/daily-review/passage", json={
            "words": [{"hanzi": "你好", "pinyin": "nǐ hǎo", "meaning": "hello"}],
            "source_language": "zh-CN",
        })
    assert resp.status_code == 400
