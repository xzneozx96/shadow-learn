import sys
import os
import pytest
from unittest.mock import AsyncMock, MagicMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


def _make_mock_session(target_language="zh-CN", interface_language="vi"):
    session = MagicMock()
    session.userdata.target_language = target_language
    config = MagicMock()
    config.interface_language = interface_language
    session.userdata.situation_config = config
    return session


def _make_observer(session, llm_response_json: str):
    """Build an ObserverAgent bypassing __init__, with a mock LLM."""
    from agents.observer_agent import ObserverAgent

    observer = ObserverAgent.__new__(ObserverAgent)
    observer.session = session
    observer._room = None
    observer.conversation_history = []
    observer._target_vocab = []
    observer._used_vocab = set()
    observer._evaluating = False
    observer._turn_count = 0

    chunk = MagicMock()
    chunk.delta = MagicMock()
    chunk.delta.content = llm_response_json

    async def _async_iter():
        yield chunk

    class _MockStream:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_):
            return False

        def __aiter__(self):
            return _async_iter().__aiter__()

    observer.llm = MagicMock()
    observer.llm.chat = MagicMock(return_value=_MockStream())
    observer._stream_feedback = AsyncMock()
    return observer


@pytest.mark.asyncio
async def test_translate_ai_turn_sends_rpc_with_correct_shape():
    session = _make_mock_session("zh-CN", "vi")
    observer = _make_observer(
        session,
        '{"translation": "Xin chào", "romanization": "nǐ hǎo"}',
    )

    await observer._translate_ai_turn("你好")

    observer._stream_feedback.assert_called_once()
    payload = observer._stream_feedback.call_args[0][0]
    assert payload["type"] == "ai-turn-translation"
    assert payload["transcript"] == "你好"
    assert payload["translation"] == "Xin chào"
    assert payload["romanization"] == "nǐ hǎo"


@pytest.mark.asyncio
async def test_translate_ai_turn_empty_romanization_for_non_chinese():
    session = _make_mock_session("en", "vi")
    observer = _make_observer(
        session,
        '{"translation": "Xin chào", "romanization": ""}',
    )

    await observer._translate_ai_turn("Hello")

    payload = observer._stream_feedback.call_args[0][0]
    assert payload["romanization"] == ""
    assert payload["translation"] == "Xin chào"


@pytest.mark.asyncio
async def test_translate_ai_turn_strips_markdown_json_fences():
    """LLM wraps JSON in ```json ... ``` — should still parse."""
    session = _make_mock_session("zh-CN", "vi")
    observer = _make_observer(
        session,
        '```json\n{"translation": "Xin chào", "romanization": "nǐ hǎo"}\n```',
    )

    await observer._translate_ai_turn("你好")

    payload = observer._stream_feedback.call_args[0][0]
    assert payload["translation"] == "Xin chào"


@pytest.mark.asyncio
async def test_translate_ai_turn_no_rpc_on_empty_llm_response():
    session = _make_mock_session("zh-CN", "vi")
    # Empty content — _stream_feedback must NOT be called
    observer = _make_observer(session, "")
    await observer._translate_ai_turn("你好")
    observer._stream_feedback.assert_not_called()
