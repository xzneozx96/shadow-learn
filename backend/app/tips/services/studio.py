"""Studio artifact generation: prompt building + OpenRouter call + retry."""
from __future__ import annotations

import json
import logging
from typing import Any, Literal

import httpx

from app.settings import settings
from app.shared._retry import RetryableError, http_retry

logger = logging.getLogger(__name__)

StudioKind = Literal["summary", "study_guide", "cards", "mind_map"]
StudioLocale = Literal["en", "vi"]


_LOCALE_NAME = {"en": "English", "vi": "Vietnamese (Tiếng Việt)"}


def build_prompt(*, kind: StudioKind, transcript: str, locale: StudioLocale) -> str:
    """Build the system + user prompt that goes to OpenRouter for one artifact."""
    locale_name = _LOCALE_NAME[locale]
    transcript_block = f"<transcript>\n{transcript}\n</transcript>"

    if kind == "summary":
        instructions = (
            "Write a short Summary of this Chinese-learning lesson. "
            "Return JSON with two fields: `abstract` (2-4 sentences in "
            f"{locale_name}) and `takeaways` (3 to 6 bullet items, each a "
            "single short sentence in " + locale_name + "). "
            "Stay grounded in the transcript. Do not invent content."
        )
    elif kind == "study_guide":
        instructions = (
            f"Write a Study Guide in {locale_name} for this Chinese-learning lesson. "
            "Return JSON with one field `items`, an array of 3 to 10 "
            "{question, answer} objects. Questions should test the concrete "
            "grammar/pronunciation/learning points actually covered in the transcript."
        )
    elif kind == "cards":
        instructions = (
            f"Extract up to 8 concept-cards in {locale_name} from this lesson. "
            "Each card teaches one rule, with a concrete example and a common trap. "
            "Return JSON with one field `cards`, an array of up to 8 "
            "{id, front, rule, example, trap} objects. `id` is a short slug like "
            "'le-vs-guo'. `front` is the cue/question. `rule` is 1-2 sentences. "
            "`example` is one Chinese sentence with translation. `trap` is the "
            "common mistake (or null if none). Do not invent rules not in the transcript."
        )
    else:  # mind_map
        instructions = (
            f"Build a Mind Map of this Chinese-learning lesson in {locale_name}. "
            "Return JSON with one field `root`, a single tree node of shape "
            "{label, summary, children}. `label` is a short 1-6 word concept name. "
            "`summary` is one short sentence elaborating the node. `children` is an "
            "array of child nodes (same shape, recursive). Hard limits: tree depth "
            "<= 4 (root counts as depth 1) and total nodes <= 60. Aim for 15-30 "
            "nodes on a typical 5-minute lesson. Leaf nodes have `children: []`. "
            "Stay grounded in the transcript — do not invent concepts the lesson "
            "does not actually cover."
        )

    return f"{instructions}\n\n{transcript_block}"


async def _call_openrouter(*, prompt: str, schema_name: str) -> dict[str, Any]:
    """Single OpenRouter call expecting JSON response. Retries via @http_retry.

    Raises RetryableError on truncation / empty content / malformed JSON so
    the shared retry decorator picks it up. Network 429/502/503/504 + timeouts
    are also retryable per the decorator's predicate.
    """
    if not settings.openrouter_api_key:
        raise RuntimeError("OPENROUTER_API_KEY not configured")

    payload: dict[str, Any] = {
        "model": settings.openrouter_structured_model,
        "messages": [{"role": "user", "content": prompt}],
        "response_format": {"type": "json_object"},
        "max_tokens": 65000,
        # Project-standard reasoning toggle used by translation, vocab, quiz,
        # daily_review, and agent routers. Thinking-mode models (Qwen3,
        # DeepSeek-R1, o1) otherwise burn the token budget on internal
        # reasoning and return content="" with finish_reason=length.
        # "reasoning": {"effort": "none"},
    }

    @http_retry(logger)
    async def _call() -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                settings.openrouter_chat_url,
                headers={
                    "Authorization": f"Bearer {settings.openrouter_api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
        # Let @http_retry catch 429/5xx and retry; raise immediately on others.
        resp.raise_for_status()
        body = resp.json()

        # Defensive parsing — OpenRouter can return:
        #  - content: None (model refused, hit a filter, or doesn't honor
        #    response_format=json_object and dropped the body)
        #  - content: "" empty string
        #  - content: a JSON-shaped string wrapped in markdown fences
        # All retryable via RetryableError → @http_retry's predicate.
        choices = body.get("choices") or []
        if not choices:
            raise RetryableError(f"openrouter empty choices: {body}")

        choice = choices[0]
        if choice.get("finish_reason") == "length":
            raise RetryableError(
                f"openrouter truncated by token limit (model={body.get('model')})",
            )

        message = choice.get("message") or {}
        content = message.get("content")
        if not content or not isinstance(content, str):
            raise RetryableError(
                f"openrouter empty content (finish_reason={choice.get('finish_reason')}, "
                f"model={body.get('model')})",
            )

        # Strip markdown fences if the model wrapped the JSON in them.
        stripped = content.strip()
        if stripped.startswith("```"):
            stripped = stripped.removeprefix("```json").removeprefix("```").strip()
            if stripped.endswith("```"):
                stripped = stripped.removesuffix("```").strip()

        try:
            return json.loads(stripped)
        except json.JSONDecodeError as e:
            preview = stripped[:500] + ("…" if len(stripped) > 500 else "")
            logger.warning(
                "openrouter returned non-JSON content (schema=%s, model=%s): %s — preview: %r",
                schema_name, body.get("model"), e, preview,
            )
            raise RetryableError(f"openrouter returned non-JSON content: {e}") from e

    return await _call()


async def generate_studio_artifact(
    *, kind: StudioKind, transcript: str, locale: StudioLocale,
) -> dict[str, Any]:
    """Generate one studio artifact. Retries handled by @http_retry on _call.

    Retryable (via shared decorator): RetryableError (truncation, empty/malformed
    content), httpx 429/502/503/504, ConnectError, TimeoutException.
    Non-retryable: 4xx (caller config issue), missing API key.
    """
    prompt = build_prompt(kind=kind, transcript=transcript, locale=locale)
    return await _call_openrouter(prompt=prompt, schema_name=kind)
