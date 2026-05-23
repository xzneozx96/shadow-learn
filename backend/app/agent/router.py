"""Agent route — thin streaming proxy for Vercel AI SDK v5 UIMessage protocol.

Adapted from https://github.com/vercel-labs/ai-sdk-preview-python-streaming
Tool execution happens client-side; this route only streams LLM output.
"""

import json
import logging
import re
import traceback
import uuid
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from openai import AsyncOpenAI, RateLimitError, APIStatusError
from app.settings import settings
from app.shared.utils import _resolve_key
from app.shared._retry import RetryableError, http_retry
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
    trigger: str | None = None
    stitch_message_id: str | None = None


# --------------------------------------------------------------------------- #
# Message conversion: AI SDK v5 UIMessage parts → OpenAI API format
# Adapted from sample prompt.py — supports text, image attachments, and tool calls
# --------------------------------------------------------------------------- #

def _convert_to_openai_messages(
    messages: list[ClientMessage],
    system_prompt: str,
) -> list[dict]:
    # DeepSeek/OpenAI/Grok cache the prompt prefix automatically — no cache_control
    # markers needed (and they're ignored by these providers). See OpenRouter prompt
    # caching docs. Re-add markers only if routing to Anthropic/Gemini.
    openai_messages: list[dict] = [
        {"role": "system", "content": system_prompt}
    ]

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

_TOKEN_WRAPPED_RE = re.compile(r'"<\|\\"\|"?([^"]*?)<\|\\"\|"')
_BARE_TOKEN_RE = re.compile(r'<\|[^|\s]*\|>?')


def _sanitize_tool_arguments(raw: str) -> str:
    """Strip LLM tokenizer special-token artifacts that corrupt JSON.

    The FPT AI model wraps JSON string values with ``<|\"|`` tokens.  Two
    variants appear in practice:

    Case A – plain string (e.g. exerciseTypes):
        ``"<|\"|cloze<|\"|"``  →  token uses JSON-escaped quote (``\\"``)
        so it hides inside the JSON string.  Stripping leaves ``"cloze"``.

    Case B – UUID with extra bare quote (e.g. itemIds):
        ``"<|\"|"UUID<|\"|"``  →  the unescaped ``"`` after the first token
        terminates the JSON string early.  Simple stripping leaves ``""UUID"``
        which is still invalid.

    Strategy:
    1. Replace full ``"<|\\"|"?CONTENT<|\\"|"`` patterns → ``"CONTENT"``.
    2. Strip remaining bare ``<|…|>?`` tokens.
    3. Validate with ``json.loads``; return *raw* on failure so the caller's
       existing error-handling path logs the original string.
    """
    cleaned = _TOKEN_WRAPPED_RE.sub(r'"\1"', raw)
    cleaned = _BARE_TOKEN_RE.sub('', cleaned)

    if cleaned == raw:
        return raw

    # Validate — if our regexes produced broken JSON, return raw so the
    # caller's error path logs the untouched string for debugging.
    try:
        json.loads(cleaned)
    except (json.JSONDecodeError, ValueError):
        logger.warning(
            "[_sanitize_tool_arguments] Sanitized result is still invalid JSON; "
            "falling back to raw. sanitized=%r",
            cleaned,
        )
        return raw
    return cleaned


async def _stream_agent(stream, stitch_message_id: str | None = None):
    """Yield SSE events in AI SDK v5 UIMessage stream format. Caller creates the stream.

    When ``stitch_message_id`` is supplied (set by caller only on
    ``trigger == 'submit-message'`` auto-resubmits), echo that id in the
    ``start`` event so AI SDK v6's ``createStreamingUIMessageState`` takes the
    ``replaceMessage`` path and stitches all tool-loop rounds into one
    assistant message instead of pushing a new (inherited-parts) message per
    round.
    """
    try:
        def fmt(payload: dict) -> str:
            return f"data: {json.dumps(payload, separators=(',', ':'))}\n\n"

        message_id = f"msg-{uuid.uuid4().hex}"
        emit_message_id = stitch_message_id or message_id
        text_stream_id = "text-1"
        reasoning_stream_id = "reasoning-1"
        text_started = False
        text_finished = False
        reasoning_started = False
        reasoning_finished = False
        finish_reason = None
        usage_data = None
        tool_calls_state: dict[int, dict[str, Any]] = {}

        yield fmt({"type": "start", "messageId": emit_message_id})
        yield fmt({"type": "start-step"})

        try:
            async for chunk in stream:
                for choice in chunk.choices:
                    if choice.finish_reason is not None:
                        finish_reason = choice.finish_reason
                        logger.info(f"[_stream_agent] finish_reason={choice.finish_reason}")

                    delta = choice.delta
                    if delta is None:
                        continue

                    # Reasoning content (thinking tokens) — only before block is closed
                    reasoning_delta = getattr(delta, "reasoning", None)
                    if reasoning_delta is not None and not reasoning_finished:
                        if not reasoning_started:
                            yield fmt({"type": "reasoning-start", "id": reasoning_stream_id})
                            reasoning_started = True
                        yield fmt(
                            {
                                "type": "reasoning-delta",
                                "id": reasoning_stream_id,
                                "delta": reasoning_delta,
                            }
                        )

                    # Close reasoning block once actual text begins
                    # Use truthiness — OpenRouter sends content='' (not None) during reasoning chunks
                    if delta.content and reasoning_started and not reasoning_finished:
                        yield fmt({"type": "reasoning-end", "id": reasoning_stream_id})
                        reasoning_finished = True

                    # Text content — skip empty strings sent during reasoning phase
                    if delta.content:
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

                # Usage may ride the final chunk (which also carries choices /
                # finish_reason), not a separate no-choices chunk — so capture
                # whenever it appears, not only when choices is empty.
                if getattr(chunk, "usage", None) is not None:
                    usage_data = chunk.usage
                    # Observe prompt-cache effectiveness. OpenRouter field naming
                    # varies by provider, so dump the raw usage object.
                    details = getattr(usage_data, "prompt_tokens_details", None)
                    cached = getattr(details, "cached_tokens", None) if details else None
                    logger.info(
                        "[_stream_agent] usage: prompt=%s cached=%s raw=%s",
                        getattr(usage_data, "prompt_tokens", None),
                        cached,
                        usage_data.model_dump() if hasattr(usage_data, "model_dump") else usage_data,
                    )
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

        # Close reasoning block if it never got closed (e.g. model produced only reasoning, no text)
        if reasoning_started and not reasoning_finished:
            yield fmt({"type": "reasoning-end", "id": reasoning_stream_id})
            reasoning_finished = True

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
                sanitized = _sanitize_tool_arguments(raw)
                if sanitized != raw:
                    logger.warning(
                        f"[_stream_agent] Stripped tokenizer artifacts from {name} args; "
                        f"original={raw!r} sanitized={sanitized!r}"
                    )
                try:
                    parsed = json.loads(sanitized) if sanitized else {}
                    logger.info(f"[_stream_agent] Tool Call Parsed: {name} ID={tcid} Args={parsed}")
                except Exception as e:
                    logger.error(f"[_stream_agent] Invalid JSON in tool arguments for {name}: {sanitized!r} - Error: {e}")
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
        yield fmt({"type": "finish-step"})
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
    """Return True if any message part is a file/image attachment in the last 5 messages."""
    return any(
        part.type == "file"
        for message in messages[-5:]
        if message.parts
        for part in message.parts
    )


@router.post("/agent")
async def agent_chat(request: AgentRequest) -> StreamingResponse:
    """Stream agent response in AI SDK v5 UIMessage format."""
    if not request.messages:
        raise HTTPException(status_code=400, detail="messages must not be empty")

    client = AsyncOpenAI(
        api_key=request.openrouter_api_key or settings.openrouter_api_key,
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
        # Ask OpenRouter for a trailing usage chunk so we can observe prompt-cache
        # hit rate (cached_tokens) — see _stream_agent logging.
        "stream_options": {"include_usage": True},
        "extra_body": {
            # OpenRouter-native usage accounting — includes cached_tokens / cost.
            "usage": {"include": True},
            "reasoning": {"budget_tokens": 256},
            "provider": {
                "require_parameters": True,  # only route to providers supporting the params in your call
                "allow_fallbacks": True,     # but allow fallback among those that qualify
                # Prefer DeepSeek's own endpoint — it's the only provider that
                # supports prompt caching (input_cache_read) for deepseek models.
                # Fallbacks still kick in if it's unavailable (they just won't cache).
                "order": ["DeepSeek"],
            },
        },
        "messages": openai_messages,
        "max_tokens": settings.openrouter_agent_max_tokens,
    }
    if request.tools:
        create_kwargs["tools"] = request.tools

    # Only echo the client-provided id on auto-resubmits (the SDK's
    # sendAutomaticallyWhen path uses trigger == 'submit-message'). For a fresh
    # user turn we mint a new id so each user→assistant exchange remains a
    # distinct message.
    should_stitch = (
        request.trigger == "submit-message"
        and request.stitch_message_id is not None
    )
    stitch_id = request.stitch_message_id if should_stitch else None

    last_error: Exception | None = None
    for model in unique_cascade:
        try:
            stream = await client.chat.completions.create(model=model, **create_kwargs)
            
            logger.info(f"[agent_chat] Request received, messages={len(request.messages)} model={model}")

            response = StreamingResponse(
                _stream_agent(stream, stitch_message_id=stitch_id),
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


# --------------------------------------------------------------------------- #
# Summarize — non-streaming structured output via fast structured model
# --------------------------------------------------------------------------- #

_SUMMARY_JSON_SCHEMA = {
    "type": "json_schema",
    "json_schema": {
        "name": "summary_response",
        "strict": True,
        "schema": {
            "type": "object",
            "properties": {
                "summary": {"type": "string"},
                "keyDecisions": {"type": "array", "items": {"type": "string"}},
                "openTopics": {"type": "array", "items": {"type": "string"}},
            },
            "required": ["summary", "keyDecisions", "openTopics"],
            "additionalProperties": False,
        },
    },
}

_SUMMARIZER_SYSTEM_TEMPLATE = """\
Summarize the language-learning conversation into a compact record that lets a tutor resume teaching without re-reading the chat. Output your response as JSON matching the required schema.

**IMPORTANT: Write ALL output fields (summary, keyDecisions, openTopics) in {output_language}. Do not use any other language.**

<process_steps>
Work through these steps before writing the summary:
1. Identify every language topic covered: vocabulary items, grammar patterns, pronunciation points, comprehension work.
2. Note each error (vocabulary, grammar, pronunciation) and how it was corrected. Capture the exact words or characters where possible.
3. Identify weak areas (recurring errors, repeated questions, hesitations) and strong areas (first-attempt success, confident responses).
4. Capture learner-stated preferences or behavioral patterns (e.g. prefers mnemonics, struggles with tones, requests more examples).
5. List any threads the learner raised that were not fully resolved.
6. Draft the summary in {output_language}: lead with the session arc, then add specific learner observations. Avoid generic statements ("learner is improving") — prefer specific ones ("confused 喝 hē / 和 hé homophones, corrected twice").
</process_steps>

<output_guidelines>
1. summary — 100–300 words of prose in {output_language}. Topic arc first, then specific errors corrected, weak spots, and preferences noted.
2. keyDecisions — 2–5 short strings in {output_language}. Specific facts, corrections, or rules the learner must carry forward. Each under 20 words. No duplication of summary prose.
3. openTopics — 0–3 short strings in {output_language}. Unresolved threads or questions the learner raised. Empty array if none.
</output_guidelines>

<ideal_output>
{{
  "summary": "Session focused on food and restaurant vocabulary (HSK 2). Learner correctly used 好吃 hǎo chī and 好喝 hǎo hē in context. Main correction: confused 多少 duōshao (how much/many) with 怎么 zěnme (how) when forming price questions — drilled the pattern 多少钱 three times before producing it correctly. Weak area: measure words (个 gè vs. 杯 bēi) — used 个 for beverages throughout; tutor introduced 杯 but learner has not yet internalized the distinction. Strong area: tone production on 4th-tone words. Learner prefers short dialogues over grammar drills and asked for a sample restaurant dialogue to study.",
  "keyDecisions": [
    "Price questions use 多少钱 duōshao qián, not 怎么钱",
    "Beverages use measure word 杯 bēi, not 个 gè",
    "好吃 = tasty (food), 好喝 = tasty (drink) — not interchangeable"
  ],
  "openTopics": [
    "Learner asked for a sample restaurant dialogue — not yet provided"
  ]
}}
</ideal_output>"""

_LOCALE_NAMES = {"vi": "Vietnamese (Tiếng Việt)", "en": "English"}


def _build_summarizer_system(locale: str | None) -> str:
    lang = _LOCALE_NAMES.get(locale or "en", locale or "English")
    return _SUMMARIZER_SYSTEM_TEMPLATE.format(output_language=lang)


class SummarizeRequest(BaseModel):
    messages: list[ClientMessage]
    openrouter_api_key: str | None = None
    locale: str | None = None


class SummarizeResponse(BaseModel):
    summary: str
    keyDecisions: list[str]
    openTopics: list[str]


def _build_summary_messages(messages: list[ClientMessage], system_prompt: str) -> list[dict]:
    """Simplified message builder for the structured summarize model.

    Strips tool calls, tool results, file parts, and content arrays — the
    structured model only needs plain text turns from user and assistant.
    """
    result: list[dict] = [{"role": "system", "content": system_prompt}]
    for msg in messages:
        if msg.role not in ("user", "assistant"):
            continue
        text = ""
        if msg.parts:
            text = " ".join(p.text for p in msg.parts if p.type == "text" and p.text)
        elif msg.content:
            text = msg.content
        if text.strip():
            result.append({"role": msg.role, "content": text})
    return result


@router.post("/summarize", response_model=SummarizeResponse)
async def summarize_thread(req: SummarizeRequest) -> SummarizeResponse:
    api_key = _resolve_key(req.openrouter_api_key, settings.openrouter_api_key, "OpenRouter API key")
    openai_messages = _build_summary_messages(req.messages, _build_summarizer_system(req.locale))
    payload = {
        "model": settings.openrouter_structured_model,
        "messages": openai_messages,
        "temperature": 0.5,
        "response_format": _SUMMARY_JSON_SCHEMA,
        "reasoning": {"effort": "none"},
    }

    @http_retry(logger)
    async def _call() -> SummarizeResponse:
        async with httpx.AsyncClient(timeout=90) as client:
            resp = await client.post(
                settings.openrouter_chat_url,
                headers={"Authorization": f"Bearer {api_key}"},
                json=payload,
            )
        resp.raise_for_status()
        body = resp.json()
        if "error" in body or "choices" not in body:
            logger.error("[summarize] OpenRouter unexpected response: %s", body)
            raise HTTPException(500, f"OpenRouter error: {body.get('error', body)}")
        choice = body["choices"][0]
        if choice.get("finish_reason") == "length":
            raise RetryableError("response truncated by token limit")
        try:
            content = choice["message"]["content"]
            if not isinstance(content, str):
                raise RetryableError(f"unexpected content type: {type(content).__name__}: {content!r}")
            data = json.loads(content)
            if not isinstance(data, dict):
                raise RetryableError(f"expected JSON object, got {type(data).__name__}: {data!r}")
            return SummarizeResponse(**data)
        except (json.JSONDecodeError, KeyError, TypeError, ValueError) as exc:
            raise RetryableError(f"malformed response: {exc}") from exc

    return await _call()
