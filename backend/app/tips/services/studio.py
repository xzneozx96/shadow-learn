"""Studio artifact generation: prompt building + OpenRouter call + retry."""
from __future__ import annotations

import asyncio
import json
from typing import Any, Literal

import httpx

from app.settings import settings

StudioKind = Literal["summary", "study_guide", "cards"]
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
    else:  # cards
        instructions = (
            f"Extract up to 8 concept-cards in {locale_name} from this lesson. "
            "Each card teaches one rule, with a concrete example and a common trap. "
            "Return JSON with one field `cards`, an array of up to 8 "
            "{id, front, rule, example, trap} objects. `id` is a short slug like "
            "'le-vs-guo'. `front` is the cue/question. `rule` is 1-2 sentences. "
            "`example` is one Chinese sentence with translation. `trap` is the "
            "common mistake (or null if none). Do not invent rules not in the transcript."
        )

    return f"{instructions}\n\n{transcript_block}"


async def _call_openrouter(*, prompt: str, schema_name: str) -> dict[str, Any]:
    """Single OpenRouter call expecting JSON response. Raises on non-2xx."""
    if not settings.openrouter_api_key:
        raise RuntimeError("OPENROUTER_API_KEY not configured")

    payload = {
        "model": settings.openrouter_structured_model,
        "messages": [{"role": "user", "content": prompt}],
        "response_format": {"type": "json_object"},
        "max_tokens": 2000,
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {settings.openrouter_api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
        )
        if resp.status_code >= 500:
            raise RuntimeError(f"openrouter transient {resp.status_code}")
        resp.raise_for_status()
        body = resp.json()

        # Defensive parsing — OpenRouter can return:
        #  - content: None (model refused, hit a filter, or doesn't honor
        #    response_format=json_object and dropped the body)
        #  - content: "" empty string
        #  - content: a JSON-shaped string wrapped in markdown fences
        # Any of these should be retryable rather than crashing.
        choices = body.get("choices") or []
        if not choices:
            raise RuntimeError(f"openrouter empty choices: {body}")
        message = choices[0].get("message") or {}
        content = message.get("content")
        if not content or not isinstance(content, str):
            raise RuntimeError(
                f"openrouter empty content (finish_reason={choices[0].get('finish_reason')}, "
                f"model={body.get('model')})",
            )

        # Strip markdown fences if the model wrapped the JSON in them.
        stripped = content.strip()
        if stripped.startswith("```"):
            # Remove fence and optional language tag (```json ... ```).
            stripped = stripped.removeprefix("```json").removeprefix("```").strip()
            if stripped.endswith("```"):
                stripped = stripped.removesuffix("```").strip()

        try:
            return json.loads(stripped)
        except json.JSONDecodeError as e:
            raise RuntimeError(f"openrouter returned non-JSON content: {e}") from e


_MAX_ATTEMPTS = 3  # 1 try + 2 retries


async def generate_studio_artifact(
    *, kind: StudioKind, transcript: str, locale: StudioLocale,
) -> dict[str, Any]:
    """Generate one studio artifact. Retries on transient errors.

    Retryable: 5xx, empty/None content, malformed JSON, timeouts.
    Non-retryable: 4xx (caller config issue), missing API key.
    """
    prompt = build_prompt(kind=kind, transcript=transcript, locale=locale)

    last_err: Exception | None = None
    for attempt in range(_MAX_ATTEMPTS):
        try:
            return await _call_openrouter(prompt=prompt, schema_name=kind)
        except RuntimeError as e:
            last_err = e
            # Last attempt: give up.
            if attempt == _MAX_ATTEMPTS - 1:
                break
            # Tiny exponential backoff to give the upstream a breath.
            await asyncio.sleep(0.5 * (2 ** attempt))

    assert last_err is not None
    raise last_err
