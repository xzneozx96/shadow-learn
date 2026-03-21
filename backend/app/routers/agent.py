"""Agent route — thin streaming proxy for Vercel AI SDK v5 UIMessage protocol.

Adapted from https://github.com/vercel-labs/ai-sdk-preview-python-streaming
Tool execution happens client-side; this route only streams LLM output.
"""

import json
import logging
import traceback
import uuid
from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from openai import AsyncOpenAI
from app.config import settings
from app.routers._utils import _resolve_key
from pydantic import BaseModel, ConfigDict

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api")

# --------------------------------------------------------------------------- #
# Pydantic models for AI SDK v5 UIMessage format
# --------------------------------------------------------------------------- #

class ClientMessagePart(BaseModel):
    type: str
    text: str | None = None
    toolCallId: str | None = None
    toolName: str | None = None
    state: str | None = None
    input: Any | None = None
    output: Any | None = None
    args: Any | None = None

    model_config = ConfigDict(extra="allow")


class ClientMessage(BaseModel):
    role: str
    content: str | None = None
    parts: list[ClientMessagePart] | None = None


class AgentRequest(BaseModel):
    messages: list[ClientMessage]
    system_prompt: str
    openrouter_api_key: str | None = None
    tools: list[dict] | None = None
    model: str | None = None


# --------------------------------------------------------------------------- #
# Message conversion: AI SDK v5 UIMessage parts → OpenAI API format
# Adapted from sample prompt.py (simplified: no attachments, no images)
# --------------------------------------------------------------------------- #

def _convert_to_openai_messages(
    messages: list[ClientMessage],
    system_prompt: str,
) -> list[dict]:
    openai_messages: list[dict] = [{"role": "system", "content": system_prompt}]

    for message in messages:
        message_parts: list[dict] = []
        tool_calls: list[dict] = []
        tool_result_messages: list[dict] = []

        if message.parts:
            for part in message.parts:
                if part.type == "text":
                    message_parts.append({"type": "text", "text": part.text or ""})

                elif part.type.startswith("tool-"):
                    tool_call_id = part.toolCallId
                    tool_name = part.toolName or part.type.replace("tool-", "", 1)

                    if tool_call_id and tool_name:
                        should_emit_tool_call = False
                        if part.state and any(
                            kw in part.state for kw in ("call", "input")
                        ):
                            should_emit_tool_call = True
                        if part.input is not None or part.args is not None:
                            should_emit_tool_call = True

                        if should_emit_tool_call:
                            arguments = (
                                part.input if part.input is not None else part.args
                            )
                            serialized = (
                                arguments
                                if isinstance(arguments, str)
                                else json.dumps(arguments or {})
                            )
                            tool_calls.append(
                                {
                                    "id": tool_call_id,
                                    "type": "function",
                                    "function": {
                                        "name": tool_name,
                                        "arguments": serialized,
                                    },
                                }
                            )

                        if (
                            part.state == "output-available"
                            and part.output is not None
                        ):
                            tool_result_messages.append(
                                {
                                    "role": "tool",
                                    "tool_call_id": tool_call_id,
                                    "content": json.dumps(part.output),
                                }
                            )

        elif message.content is not None:
            message_parts.append({"type": "text", "text": message.content})

        # Build content field
        if message_parts:
            if len(message_parts) == 1 and message_parts[0]["type"] == "text":
                content_payload = message_parts[0]["text"]
            else:
                content_payload = message_parts
        else:
            content_payload = ""

        # Only emit the assistant/user message if it has text content or tool_calls.
        # A message with only output-available parts produces no text and no
        # tool_calls — skip it so we don't insert an empty assistant message
        # before the tool-role results.
        if message_parts or tool_calls:
            openai_message: dict = {"role": message.role, "content": content_payload}
            if tool_calls:
                openai_message["tool_calls"] = tool_calls
            openai_messages.append(openai_message)
        openai_messages.extend(tool_result_messages)

    logger.debug(f"[_convert_to_openai_messages] Converted to {len(openai_messages)} OpenAI messages")
    return openai_messages


# --------------------------------------------------------------------------- #
# SSE streaming — AI SDK v5 UIMessage stream protocol
# Adapted from sample stream.py (removed server-side tool execution)
# --------------------------------------------------------------------------- #

_OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
async def _stream_agent(
    client: AsyncOpenAI,
    messages: list[dict],
    tool_definitions: list[dict] | None,
    model: str,
):
    """Yield SSE events in AI SDK v5 UIMessage stream format."""
    try:
        def fmt(payload: dict) -> str:
            return f"data: {json.dumps(payload, separators=(',', ':'))}\n\n"

        message_id = f"msg-{uuid.uuid4().hex}"
        text_stream_id = "text-1"
        text_started = False
        text_finished = False
        finish_reason = None
        usage_data = None
        tool_calls_state: dict[int, dict[str, Any]] = {}

        yield fmt({"type": "start", "messageId": message_id})

        create_kwargs: dict[str, Any] = {
            "messages": messages,
            "model": model,
            "stream": True,
        }
        if tool_definitions:
            create_kwargs["tools"] = tool_definitions

        stream = await client.chat.completions.create(**create_kwargs)

        try:
            async for chunk in stream:
                for choice in chunk.choices:
                    if choice.finish_reason is not None:
                        finish_reason = choice.finish_reason

                    delta = choice.delta
                    if delta is None:
                        continue

                    # Text content
                    if delta.content is not None:
                        if not text_started:
                            yield fmt({"type": "text-start", "id": text_stream_id})
                            text_started = True
                        yield fmt(
                            {
                                "type": "text-delta",
                                "id": text_stream_id,
                                "delta": delta.content,
                            }
                        )

                    # Tool call deltas
                    if delta.tool_calls:
                        for tc_delta in delta.tool_calls:
                            index = tc_delta.index
                            state = tool_calls_state.setdefault(
                                index,
                                {
                                    "id": None,
                                    "name": None,
                                    "arguments": "",
                                    "started": False,
                                },
                            )

                            if tc_delta.id is not None:
                                state["id"] = tc_delta.id

                            fn = getattr(tc_delta, "function", None)
                            if fn is not None:
                                if fn.name is not None:
                                    state["name"] = fn.name
                                if fn.arguments:
                                    state["arguments"] += fn.arguments

                            # Emit tool-input-start once we have both id and name
                            if (
                                state["id"] is not None
                                and state["name"] is not None
                                and not state["started"]
                            ):
                                yield fmt(
                                    {
                                        "type": "tool-input-start",
                                        "toolCallId": state["id"],
                                        "toolName": state["name"],
                                    }
                                )
                                state["started"] = True

                            # Stream argument deltas
                            if fn and fn.arguments and state["id"] is not None:
                                yield fmt(
                                    {
                                        "type": "tool-input-delta",
                                        "toolCallId": state["id"],
                                        "inputTextDelta": fn.arguments,
                                    }
                                )

                # Usage chunk (no choices)
                if not chunk.choices and chunk.usage is not None:
                    usage_data = chunk.usage
        except Exception as e:
            logger.error(f"[_stream_agent] OpenAI Stream Error: {e}", exc_info=True)
            # Inspect standard openai.APIError attributes for more details
            if hasattr(e, 'code') and getattr(e, 'code'):
                logger.error(f"[_stream_agent] Error Code: {getattr(e, 'code')}")
            if hasattr(e, 'body') and getattr(e, 'body'):
                logger.error(f"[_stream_agent] Error Body: {getattr(e, 'body')}")
            if hasattr(e, 'response') and getattr(e, 'response'):
                logger.error(f"[_stream_agent] Error Response: {getattr(e, 'response')}")
            if hasattr(e, 'param') and getattr(e, 'param'):
                logger.error(f"[_stream_agent] Error Param: {getattr(e, 'param')}")

            if not text_started:
                yield fmt({"type": "text-start", "id": text_stream_id})
                text_started = True
            yield fmt(
                {
                    "type": "text-delta",
                    "id": text_stream_id,
                    "delta": f"\n\n⚠️ *[Streaming Interrupted: {e}]*",
                }
            )
            finish_reason = "stop"

        # Finalize text stream — close BEFORE tool finalization so SDK state
        # machine sees text-end before tool-input-available events.
        if text_started and not text_finished:
            yield fmt({"type": "text-end", "id": text_stream_id})
            text_finished = True

        # Finalize tool calls (emit tool-input-available for each)
        if finish_reason == "tool_calls":
            for index in sorted(tool_calls_state.keys()):
                state = tool_calls_state[index]
                tcid = state.get("id")
                name = state.get("name")
                if tcid is None or name is None:
                    continue

                if not state["started"]:
                    yield fmt(
                        {
                            "type": "tool-input-start",
                            "toolCallId": tcid,
                            "toolName": name,
                        }
                    )

                raw = state["arguments"]
                try:
                    parsed = json.loads(raw) if raw else {}
                    logger.info(f"[_stream_agent] Tool Call Parsed: {name} ID={tcid} Args={parsed}")
                except Exception as e:
                    logger.error(f"[_stream_agent] Invalid JSON in tool arguments for {name}: {raw} - Error: {e}")
                    yield fmt(
                        {
                            "type": "tool-input-error",
                            "toolCallId": tcid,
                            "toolName": name,
                            "input": raw,
                            "errorText": str(e),
                        }
                    )
                    continue

                yield fmt(
                    {
                        "type": "tool-input-available",
                        "toolCallId": tcid,
                        "toolName": name,
                        "input": parsed,
                    }
                )

        # Finish event — finishReason at top level per AI SDK v5 schema
        finish_event: dict[str, Any] = {"type": "finish"}
        if finish_reason is not None:
            finish_event["finishReason"] = finish_reason.replace("_", "-")
        if usage_data is not None:
            usage_payload: dict[str, int] = {
                "promptTokens": usage_data.prompt_tokens,
                "completionTokens": usage_data.completion_tokens,
            }
            total = getattr(usage_data, "total_tokens", None)
            if total is not None:
                usage_payload["totalTokens"] = total
            finish_event["messageMetadata"] = {"usage": usage_payload}

        yield fmt(finish_event)

        yield "data: [DONE]\n\n"

    except Exception:
        traceback.print_exc()
        raise


def _patch_headers(response: StreamingResponse) -> StreamingResponse:
    """Apply streaming headers expected by AI SDK v5 useChat."""
    response.headers["x-vercel-ai-ui-message-stream"] = "v1"
    response.headers["Cache-Control"] = "no-cache"
    response.headers["Connection"] = "keep-alive"
    response.headers["X-Accel-Buffering"] = "no"
    return response


# --------------------------------------------------------------------------- #
# Route
# --------------------------------------------------------------------------- #

@router.post("/agent")
async def agent_chat(request: AgentRequest) -> StreamingResponse:
    """Stream agent response in AI SDK v5 UIMessage format."""
    logger.info(f"[agent_chat] Request received, messages={len(request.messages)} model={request.model or 'default'}")
    if not request.messages:
        raise HTTPException(status_code=400, detail="messages must not be empty")

    api_key = _resolve_key(request.openrouter_api_key, settings.openrouter_api_key, "OpenRouter API key")
    client = AsyncOpenAI(
        api_key=api_key,
        base_url=_OPENROUTER_BASE_URL,
    )

    resolved_model = request.model or settings.openrouter_model

    openai_messages = _convert_to_openai_messages(
        request.messages, request.system_prompt
    )

    # Log the full prompt payload for debugging Provider/Inspection errors
    logger.info(f"[agent_chat] Sending {len(openai_messages)} messages to OpenRouter")
    logger.info(f"[agent_chat] Full OpenAI messages payload:\n{json.dumps(openai_messages, indent=2, ensure_ascii=False)}")

    response = StreamingResponse(
        _stream_agent(client, openai_messages, request.tools, resolved_model),
        media_type="text/event-stream",
    )
    return _patch_headers(response)
