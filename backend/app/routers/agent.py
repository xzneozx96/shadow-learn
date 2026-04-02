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
from openai import AsyncOpenAI, RateLimitError, APIStatusError
from app.config import settings
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
# Adapted from sample prompt.py — supports text, image attachments, and tool calls
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
                if part.type == "text" and part.text:
                    message_parts.append({"type": "text", "text": part.text})

                elif part.type == "file":
                    # Image attachment — forward as OpenAI vision image_url part
                    url = getattr(part, "url", None)
                    if url:
                        message_parts.append({
                            "type": "image_url",
                            "image_url": {"url": url},
                        })

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

                        if part.state == "output-available":
                            content = (
                                json.dumps(part.output)
                                if part.output is not None
                                else "Tool returned no output."
                            )
                            tool_result_messages.append(
                                {
                                    "role": "tool",
                                    "tool_call_id": tool_call_id,
                                    "content": content,
                                }
                            )

                        elif part.state == "output-error":
                            error_text = getattr(part, "errorText", None) or "Tool execution failed"
                            tool_result_messages.append(
                                {
                                    "role": "tool",
                                    "tool_call_id": tool_call_id,
                                    "content": json.dumps({"error": error_text}),
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

async def _stream_agent(stream):
    """Yield SSE events in AI SDK v5 UIMessage stream format. Caller creates the stream."""
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
                    # Still emit tool-input-available so onToolCall fires and
                    # addToolResult can provide a result, preventing an orphaned
                    # tool_call on re-submit (which causes a 400 from OpenRouter).
                    yield fmt(
                        {
                            "type": "tool-input-available",
                            "toolCallId": tcid,
                            "toolName": name,
                            "input": {"error": f"Invalid tool arguments — JSON parse failed: {e}"},
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

_RETRYABLE_STATUS_CODES = {429, 502, 503}


def _messages_contain_image(messages: list[ClientMessage]) -> bool:
    """Return True if any message part is a file/image attachment."""
    return any(
        part.type == "file"
        for message in messages
        if message.parts
        for part in message.parts
    )


@router.post("/agent")
async def agent_chat(request: AgentRequest) -> StreamingResponse:
    """Stream agent response in AI SDK v5 UIMessage format."""
    logger.info(f"[agent_chat] Request received, messages={len(request.messages)} model={request.model or 'default'}")
    if not request.messages:
        raise HTTPException(status_code=400, detail="messages must not be empty")

    client = AsyncOpenAI(
        api_key=settings.fpt_ai_api_key,
        base_url=settings.openrouter_base_url,
    )

    has_images = _messages_contain_image(request.messages)
    vision_model = settings.openrouter_vision_model

    if has_images and vision_model:
        logger.info(f"[agent_chat] Image detected — routing to vision model: {vision_model}")
        primary = vision_model
    else:
        primary = request.model or settings.openrouter_agent_model
    cascade = [primary, *settings.openrouter_fallback_models]
    # Deduplicate preserving order
    seen: set[str] = set()
    unique_cascade = [m for m in cascade if not (m in seen or seen.add(m))]  # type: ignore[func-returns-value]

    openai_messages = _convert_to_openai_messages(request.messages, request.system_prompt)

    create_kwargs: dict[str, Any] = {
        "stream": True,
        "extra_body": {"reasoning": {"effort": "none"}},
        "messages": openai_messages,
    }
    if request.tools:
        create_kwargs["tools"] = request.tools

    last_error: Exception | None = None
    for model in unique_cascade:
        try:
            stream = await client.chat.completions.create(model=model, **create_kwargs)
            logger.info(f"[agent_chat] Streaming with model={model}")
            response = StreamingResponse(
                _stream_agent(stream),
                media_type="text/event-stream",
            )
            return _patch_headers(response)
        except (RateLimitError, APIStatusError) as e:
            status = getattr(e, "status_code", None)
            if status not in _RETRYABLE_STATUS_CODES:
                raise
            logger.warning(f"[agent_chat] Model {model} returned {status}, trying next in cascade")
            last_error = e

    raise last_error or HTTPException(status_code=503, detail="All models in cascade unavailable")
