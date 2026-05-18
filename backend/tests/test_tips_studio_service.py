from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from app.tips.services.studio import build_prompt, generate_studio_artifact


def test_build_prompt_summary_en_includes_transcript():
    prompt = build_prompt(kind="summary", transcript="hello world", locale="en")
    assert "hello world" in prompt
    assert "summary" in prompt.lower()
    assert "english" in prompt.lower()


def test_build_prompt_summary_vi_targets_vietnamese():
    prompt = build_prompt(kind="summary", transcript="x", locale="vi")
    assert "vietnamese" in prompt.lower() or "Tiếng Việt" in prompt


def test_build_prompt_cards_emphasizes_concept_shape():
    prompt = build_prompt(kind="cards", transcript="x", locale="en")
    assert "rule" in prompt.lower()
    assert "example" in prompt.lower()
    assert "trap" in prompt.lower()


@pytest.mark.asyncio
async def test_generate_studio_artifact_summary_happy(monkeypatch):
    fake_response = {
        "abstract": "It is about tones.",
        "takeaways": ["one", "two", "three"],
    }
    mock_call = AsyncMock(return_value=fake_response)
    monkeypatch.setattr("app.tips.services.studio._call_openrouter", mock_call)

    result = await generate_studio_artifact(
        kind="summary", transcript="hello", locale="en"
    )
    assert result["abstract"] == "It is about tones."
    assert mock_call.await_count == 1


@pytest.mark.asyncio
async def test_generate_studio_artifact_retries_once_on_transient(monkeypatch):
    fake_response = {"abstract": "x", "takeaways": ["a", "b", "c"]}
    mock_call = AsyncMock(side_effect=[RuntimeError("transient 503"), fake_response])
    monkeypatch.setattr("app.tips.services.studio._call_openrouter", mock_call)

    result = await generate_studio_artifact(
        kind="summary", transcript="hello", locale="en"
    )
    assert result["abstract"] == "x"
    assert mock_call.await_count == 2  # 1 fail + 1 success


@pytest.mark.asyncio
async def test_generate_studio_artifact_gives_up_after_max_attempts(monkeypatch):
    mock_call = AsyncMock(side_effect=RuntimeError("upstream down"))
    monkeypatch.setattr("app.tips.services.studio._call_openrouter", mock_call)
    # Skip backoff sleep to keep the test fast.
    monkeypatch.setattr("app.tips.services.studio.asyncio.sleep", AsyncMock(return_value=None))

    with pytest.raises(RuntimeError):
        await generate_studio_artifact(
            kind="summary", transcript="hello", locale="en"
        )
    assert mock_call.await_count == 3  # 1 try + 2 retries


@pytest.mark.asyncio
async def test_call_openrouter_raises_runtime_on_none_content(monkeypatch):
    """Defend against OpenRouter returning content: None (json mode unsupported,
    refusal, etc.). Must raise RuntimeError so retry logic kicks in."""
    from app.tips.services import studio as svc

    class FakeResp:
        status_code = 200

        def raise_for_status(self):
            return None

        def json(self):
            return {
                "model": "test-model",
                "choices": [{"finish_reason": "stop", "message": {"content": None}}],
            }

    class FakeClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def post(self, *a, **kw):
            return FakeResp()

    monkeypatch.setattr(svc.httpx, "AsyncClient", lambda *a, **kw: FakeClient())
    monkeypatch.setattr(svc.settings, "openrouter_api_key", "fake-key", raising=False)

    with pytest.raises(RuntimeError, match="empty content"):
        await svc._call_openrouter(prompt="x", schema_name="cards")


@pytest.mark.asyncio
async def test_call_openrouter_strips_markdown_fences(monkeypatch):
    """Some models wrap JSON in ```json ... ``` fences even with response_format set."""
    from app.tips.services import studio as svc

    class FakeResp:
        status_code = 200

        def raise_for_status(self):
            return None

        def json(self):
            return {
                "choices": [
                    {
                        "finish_reason": "stop",
                        "message": {"content": '```json\n{"cards": []}\n```'},
                    },
                ],
            }

    class FakeClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def post(self, *a, **kw):
            return FakeResp()

    monkeypatch.setattr(svc.httpx, "AsyncClient", lambda *a, **kw: FakeClient())
    monkeypatch.setattr(svc.settings, "openrouter_api_key", "fake-key", raising=False)

    result = await svc._call_openrouter(prompt="x", schema_name="cards")
    assert result == {"cards": []}
