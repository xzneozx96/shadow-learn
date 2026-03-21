"""Chat router with SSE streaming responses from OpenRouter."""

import json
from typing import AsyncGenerator

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from app.config import settings
from app.models import ChatRequest
from app.routers._utils import _resolve_key

router = APIRouter(prefix="/api")

_MAX_CONTEXT_SEGMENTS = 40
_MAX_MESSAGES = 20


def _build_system_prompt(request: ChatRequest) -> str:
    """Build a system prompt with video title, active segment, and nearby transcript context."""
    lines = [
        "You are ShadowLearn AI, a language-learning companion helping users study Chinese.",
        f'The user is watching a video titled: "{request.video_title}".',
        "",
    ]

    if request.active_segment:
        seg = request.active_segment
        lines += [
            "The user is currently on this segment:",
            f'  [{seg.start:.1f}s – {seg.end:.1f}s] {seg.text}',
            f'  Romanization: {seg.romanization}',
        ]
        if seg.translations:
            for lang, text in seg.translations.items():
                lines.append(f'  {lang}: {text}')
        lines.append("")

    context = request.context_segments[:_MAX_CONTEXT_SEGMENTS]
    if context:
        lines.append("Nearby transcript segments:")
        for seg in context:
            lines.append(f'  [{seg.start:.1f}s – {seg.end:.1f}s] {seg.text}')
        lines.append("")

    lines += [
        "Answer the user's questions about the language, vocabulary, grammar, or content.",
        "Be concise and helpful.",
    ]

    return "\n".join(lines)


async def _stream_chat(
    messages: list[dict],
    api_key: str,
    model: str,
) -> AsyncGenerator[str, None]:
    """Stream chat completion tokens from OpenRouter as SSE events."""
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            async with client.stream(
                "POST",
                settings.openrouter_chat_url,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": model,
                    "messages": messages,
                    "stream": True,
                    "reasoning": {"effort": "none"},
                },
            ) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if not line.startswith("data: "):
                        continue
                    raw = line[len("data: "):]
                    if raw.strip() == "[DONE]":
                        break
                    try:
                        chunk = json.loads(raw)
                        delta = chunk["choices"][0]["delta"]
                        token = delta.get("content")
                        if token:
                            payload = json.dumps({"token": token})
                            yield f"event: token\ndata: {payload}\n\n"
                    except (KeyError, json.JSONDecodeError):
                        continue

        yield "event: done\ndata: {}\n\n"

    except httpx.HTTPStatusError as exc:
        payload = json.dumps({"message": f"Upstream error: {exc.response.status_code}"})
        yield f"event: error\ndata: {payload}\n\n"
    except Exception as exc:
        payload = json.dumps({"message": str(exc)})
        yield f"event: error\ndata: {payload}\n\n"


@router.post("/chat")
async def chat(request: ChatRequest) -> StreamingResponse:
    """Validate chat request and stream AI response as SSE."""
    if not request.messages:
        raise HTTPException(status_code=400, detail="messages must not be empty")

    system_prompt = _build_system_prompt(request)

    # Truncate to last 20 messages
    recent_messages = request.messages[-_MAX_MESSAGES:]

    messages: list[dict] = [{"role": "system", "content": system_prompt}]
    messages += [{"role": m.role, "content": m.content} for m in recent_messages]

    api_key = _resolve_key(request.openrouter_api_key, settings.openrouter_api_key, "OpenRouter API key")
    return StreamingResponse(
        _stream_chat(messages, api_key, settings.openrouter_model),
        media_type="text/event-stream",
    )
