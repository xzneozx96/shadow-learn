"""Translation service using OpenRouter LLM API with batching and retry."""

import json
import logging

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

_DEFAULT_MODEL = "openai/gpt-4o-mini"


def _build_translation_prompt(segments: list[dict], languages: list[str]) -> str:
    """Build an LLM prompt requesting translations of Chinese segments.

    Returns a prompt string that includes the segment texts and the target
    languages, instructing the model to return a JSON array.
    """
    language_list = ", ".join(languages)
    segments_text = "\n".join(
        f'{{"id": {seg["id"]}, "text": "{seg["text"]}"}}'
        for seg in segments
    )
    prompt = (
        f"You are a professional translator specializing in Chinese.\n"
        f"Translate each segment below into the following languages: {language_list}.\n\n"
        f"Segments:\n{segments_text}\n\n"
        f"Return ONLY a valid JSON array where each element has:\n"
        f'  "id": the segment id (integer)\n'
        f'  "translations": an object mapping each language name to its translation\n\n'
        f"Example output:\n"
        f'[{{"id": 0, "translations": {{"English": "Hello world"}}}}]\n\n'
        f"Do not include any explanation or markdown. Return raw JSON only."
    )
    return prompt


def _parse_translations(response_text: str, segments: list[dict], languages: list[str]) -> list[dict]:
    """Parse LLM JSON response and merge translations onto segment dicts."""
    try:
        translation_list = json.loads(response_text)
    except json.JSONDecodeError:
        # Extract JSON array if wrapped in markdown
        start = response_text.find("[")
        end = response_text.rfind("]") + 1
        if start == -1 or end == 0:
            raise ValueError(f"No JSON array found in response: {response_text!r}")
        translation_list = json.loads(response_text[start:end])

    id_to_translations = {item["id"]: item["translations"] for item in translation_list}
    result = []
    for seg in segments:
        seg_copy = dict(seg)
        seg_copy["translations"] = id_to_translations.get(
            seg["id"],
            {lang: "[translation unavailable]" for lang in languages},
        )
        result.append(seg_copy)
    return result


async def _translate_batch(
    segments: list[dict],
    languages: list[str],
    api_key: str,
    model: str,
) -> list[dict]:
    """Translate a single batch of segments via OpenRouter, with retry on failure.

    On persistent failure, segments are returned with "[translation unavailable]"
    and _error: True.
    """
    prompt = _build_translation_prompt(segments, languages)
    max_retries = settings.translation_max_retries
    last_exc: Exception | None = None

    for attempt in range(max_retries + 1):
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(
                    settings.openrouter_chat_url,
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": model,
                        "messages": [{"role": "user", "content": prompt}],
                        "temperature": 0.1,
                    },
                )
                response.raise_for_status()

            data = response.json()
            content = data["choices"][0]["message"]["content"]
            return _parse_translations(content, segments, languages)

        except Exception as exc:
            last_exc = exc
            logger.warning(
                "Translation batch attempt %d/%d failed: %s",
                attempt + 1,
                max_retries + 1,
                exc,
            )

    # All retries exhausted — return unavailable placeholders
    logger.error("Translation failed after %d attempts: %s", max_retries + 1, last_exc)
    return [
        {**seg, "translations": {lang: "[translation unavailable]" for lang in languages}, "_error": True}
        for seg in segments
    ]


async def translate_segments(
    segments: list[dict],
    languages: list[str],
    api_key: str,
    model: str = _DEFAULT_MODEL,
) -> list[dict]:
    """Translate all segments in batches, returning enriched segment dicts.

    Each returned segment gains a "translations" key mapping language name → text.
    """
    batch_size = settings.translation_batch_size
    results: list[dict] = []

    for i in range(0, len(segments), batch_size):
        batch = segments[i : i + batch_size]
        translated = await _translate_batch(batch, languages, api_key, model)
        results.extend(translated)

    return results
