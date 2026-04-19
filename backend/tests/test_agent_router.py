"""Tests for the /api/agent route and message conversion logic."""

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.agent.router import (
    ClientMessage,
    ClientMessagePart,
    _convert_to_openai_messages,
)

class AsyncIteratorMock:
    def __init__(self, items):
        self.items = items
    def __aiter__(self):
        self._current = iter(self.items)
        return self
    async def __anext__(self):
        try:
            return next(self._current)
        except StopIteration:
            raise StopAsyncIteration


# --------------------------------------------------------------------------- #
# Unit tests for _convert_to_openai_messages
# --------------------------------------------------------------------------- #


class TestConvertToOpenAIMessages:
    """Unit tests for the message conversion function."""

    def test_simple_text_message(self):
        messages = [
            ClientMessage(
                role="user",
                parts=[ClientMessagePart(type="text", text="Hello!")],
            )
        ]
        result = _convert_to_openai_messages(messages, "You are helpful.")
        assert result[0] == {"role": "system", "content": "You are helpful."}
        assert result[1] == {"role": "user", "content": "Hello!"}

    def test_fallback_to_content_field(self):
        """When parts is None, should fall back to content field."""
        messages = [
            ClientMessage(role="user", content="Hi there", parts=None)
        ]
        result = _convert_to_openai_messages(messages, "system")
        assert result[1] == {"role": "user", "content": "Hi there"}

    def test_multi_turn_conversation(self):
        messages = [
            ClientMessage(
                role="user",
                parts=[ClientMessagePart(type="text", text="What is 1+1?")],
            ),
            ClientMessage(
                role="assistant",
                parts=[ClientMessagePart(type="text", text="2")],
            ),
            ClientMessage(
                role="user",
                parts=[ClientMessagePart(type="text", text="Thanks")],
            ),
        ]
        result = _convert_to_openai_messages(messages, "sys")
        assert len(result) == 4  # system + 3 messages
        assert result[1]["role"] == "user"
        assert result[2]["role"] == "assistant"
        assert result[3]["role"] == "user"

    def test_tool_call_round_trip(self):
        """Tool call from assistant + tool result should produce correct OpenAI format."""
        messages = [
            ClientMessage(
                role="user",
                parts=[ClientMessagePart(type="text", text="Check weather")],
            ),
            # Assistant message with tool call
            ClientMessage(
                role="assistant",
                parts=[
                    ClientMessagePart(
                        type="tool-get_weather",
                        toolCallId="call-123",
                        toolName="get_weather",
                        state="input-available",
                        input={"city": "Tokyo"},
                    )
                ],
            ),
            # User message with tool result
            ClientMessage(
                role="assistant",
                parts=[
                    ClientMessagePart(
                        type="tool-get_weather",
                        toolCallId="call-123",
                        toolName="get_weather",
                        state="output-available",
                        output={"temp": 22},
                    )
                ],
            ),
        ]
        result = _convert_to_openai_messages(messages, "sys")
        # Check assistant message has tool_calls
        assistant_msg = result[2]
        assert "tool_calls" in assistant_msg
        assert assistant_msg["tool_calls"][0]["id"] == "call-123"
        assert assistant_msg["tool_calls"][0]["function"]["name"] == "get_weather"
        assert json.loads(assistant_msg["tool_calls"][0]["function"]["arguments"]) == {
            "city": "Tokyo"
        }

        # Check tool result message
        tool_msg = result[3]
        assert tool_msg["role"] == "tool"
        assert tool_msg["tool_call_id"] == "call-123"

    def test_empty_messages_only_system(self):
        result = _convert_to_openai_messages([], "sys prompt")
        assert len(result) == 1
        assert result[0] == {"role": "system", "content": "sys prompt"}


# --------------------------------------------------------------------------- #
# Integration tests for /api/agent endpoint
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_agent_rejects_empty_messages():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/agent",
            json={
                "messages": [],
                "system_prompt": "test",
                "openrouter_api_key": "key",
                "tools": [],
            },
        )
        assert response.status_code == 400


@pytest.mark.asyncio
async def test_agent_rejects_missing_fields():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/agent",
            json={"messages": [{"role": "user", "parts": [{"type": "text", "text": "hi"}]}]},
        )
        # Missing system_prompt and openrouter_api_key
        assert response.status_code == 422


@pytest.mark.asyncio
async def test_agent_streams_with_correct_headers():
    """Mock OpenAI client to verify streaming headers and SSE format."""

    # Create a mock that simulates a minimal OpenAI streaming response
    mock_chunk = MagicMock()
    mock_choice = MagicMock()
    mock_choice.finish_reason = "stop"
    mock_delta = MagicMock()
    mock_delta.content = "Hello"
    mock_delta.tool_calls = None
    mock_choice.delta = mock_delta
    mock_chunk.choices = [mock_choice]
    mock_chunk.usage = None

    # Second chunk for finish
    mock_finish_chunk = MagicMock()
    mock_finish_choice = MagicMock()
    mock_finish_choice.finish_reason = "stop"
    mock_finish_choice.delta = None
    mock_finish_chunk.choices = [mock_finish_choice]
    mock_finish_chunk.usage = None

    mock_stream = AsyncIteratorMock([mock_chunk])

    with patch("app.agent.router.AsyncOpenAI") as MockAsyncOpenAI:
        mock_client = MagicMock()
        mock_client.chat.completions.create = AsyncMock(return_value=mock_stream)
        MockAsyncOpenAI.return_value = mock_client

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/agent",
                json={
                    "messages": [
                        {
                            "role": "user",
                            "parts": [{"type": "text", "text": "hello"}],
                        }
                    ],
                    "system_prompt": "You are a tutor.",
                    "openrouter_api_key": "test-key",
                    "tools": [],
                },
            )
            assert response.status_code == 200

            # Check headers
            assert (
                response.headers.get("x-vercel-ai-ui-message-stream") == "v1"
            )
            assert response.headers.get("cache-control") == "no-cache"

            # Parse SSE events
            body = response.text
            events = [
                line.replace("data: ", "")
                for line in body.strip().split("\n")
                if line.startswith("data: ") and line != "data: [DONE]"
            ]

            # Should have start, text-start, text-delta, text-end, finish
            types = []
            for event_str in events:
                event = json.loads(event_str)
                types.append(event["type"])

            assert "start" in types
            assert "text-delta" in types
            assert "finish" in types


@pytest.mark.asyncio
async def test_agent_passes_tools_to_openai():
    """Verify tool definitions are forwarded to OpenAI client."""
    tool_defs = [
        {
            "type": "function",
            "function": {
                "name": "get_study_context",
                "description": "Get study context",
                "parameters": {"type": "object", "properties": {}},
            },
        }
    ]

    mock_chunk = MagicMock()
    mock_choice = MagicMock()
    mock_choice.finish_reason = "stop"
    mock_delta = MagicMock()
    mock_delta.content = "ok"
    mock_delta.tool_calls = None
    mock_choice.delta = mock_delta
    mock_chunk.choices = [mock_choice]
    mock_chunk.usage = None

    with patch("app.agent.router.AsyncOpenAI") as MockAsyncOpenAI:
        mock_client = MagicMock()
        mock_client.chat.completions.create = AsyncMock(return_value=AsyncIteratorMock([mock_chunk]))
        MockAsyncOpenAI.return_value = mock_client

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            await client.post(
                "/api/agent",
                json={
                    "messages": [
                        {
                            "role": "user",
                            "parts": [{"type": "text", "text": "hi"}],
                        }
                    ],
                    "system_prompt": "test",
                    "openrouter_api_key": "test-key",
                    "tools": tool_defs,
                },
            )

        # Verify tools were passed to OpenAI
        call_kwargs = mock_client.chat.completions.create.call_args
        assert call_kwargs is not None
        assert call_kwargs.kwargs.get("tools") == tool_defs
