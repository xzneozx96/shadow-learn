"""Translation service using OpenAI API with batching and retry."""

import json
import logging
from typing import Dict, List

import httpx
from pydantic import BaseModel, ConfigDict

from app.config import settings
from app.services.language_config import get_language_config

logger = logging.getLogger(__name__)

_DEFAULT_MODEL = "gpt-4o-mini"


class LanguageTranslation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    language: str
    text: str


class SegmentTranslation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: int
    translations: List[LanguageTranslation]


class TranslationResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    translations: List[SegmentTranslation]


def _build_translation_prompt(
    segments: list[dict],
    languages: list[str],
    source_language: str = "zh-CN",
) -> str:
    """Build an LLM prompt requesting translations of the given source-language segments."""
    lang_cfg = get_language_config(source_language)
    language_list = ", ".join(languages)
    segments_text = "\n".join(
        f'{{"id": {seg["id"]}, "text": "{seg["text"]}"}}'
        for seg in segments
    )
    example_langs = [{"language": lang, "text": "<translated text>"} for lang in languages]
    return (
        f"You are a professional translator specializing in {lang_cfg['language_name']}.\n"
        f"Translate each segment below into the following languages: {language_list}.\n\n"
        f"Segments:\n{segments_text}\n\n"
        f"Respond with a JSON object in exactly this structure:\n"
        f'{{"translations": [{{"id": <segment_id>, "translations": {example_langs}}}, ...]}}\n\n'
        f"Include every segment ID. Output only the JSON object, no other text."
    )


async def _translate_batch(
    segments: list[dict],
    languages: list[str],
    api_key: str,
    model: str,
    source_language: str = "zh-CN",
) -> list[dict]:
    """Translate a single batch of segments via OpenAI API using Structured Outputs."""
    prompt = _build_translation_prompt(segments, languages, source_language=source_language)
    
    # Define JSON schema for Structured Outputs
    response_format = {
        "type": "json_schema",
        "json_schema": {
            "name": "translation_response",
            "strict": True,
            "schema": TranslationResponse.model_json_schema()
        }
    }

    max_retries = settings.translation_max_retries
    last_exc: Exception | None = None

    for attempt in range(max_retries + 1):
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(
                    settings.openai_chat_url,
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": model,
                        "messages": [{"role": "user", "content": prompt}],
                        "response_format": response_format,
                        "temperature": 0.1,
                    },
                )
                response.raise_for_status()

            data = response.json()
            content = data["choices"][0]["message"]["content"]
            
            try:
                parsed = TranslationResponse.model_validate_json(content)
                id_to_translations = {
                    item.id: {lt.language: lt.text for lt in item.translations}
                    for item in parsed.translations
                }
            except Exception as e:
                logger.error("Failed to parse translation response: %s", e)
                # Fallback to standard JSON parsing if schema validation fails
                raw_data = json.loads(content)
                if isinstance(raw_data, dict) and "translations" in raw_data:
                    id_to_translations = {item["id"]: item["translations"] for item in raw_data["translations"]}
                elif isinstance(raw_data, list):
                    id_to_translations = {item["id"]: item["translations"] for item in raw_data if "id" in item}
                else:
                    raise e

            result = []
            for seg in segments:
                seg_copy = dict(seg)
                seg_copy["translations"] = id_to_translations.get(
                    seg["id"],
                    {lang: "[translation unavailable]" for lang in languages},
                )
                result.append(seg_copy)
            return result

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
    source_language: str = "zh-CN",
) -> list[dict]:
    """Translate all segments in batches, returning enriched segment dicts.

    Each returned segment gains a "translations" key mapping language name → text.
    """
    batch_size = settings.translation_batch_size
    results: list[dict] = []

    for i in range(0, len(segments), batch_size):
        batch = segments[i : i + batch_size]
        translated = await _translate_batch(batch, languages, api_key, model, source_language=source_language)
        results.extend(translated)

    return results
