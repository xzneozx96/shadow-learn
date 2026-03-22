"""Vocabulary extraction service using OpenRouter API."""

import asyncio
import logging
import random
from typing import List

import httpx
from pydantic import BaseModel, ConfigDict

from app.config import settings
from app.services.language_config import get_language_config

logger = logging.getLogger(__name__)


class VocabularyExtractionError(Exception):
    """Raised when vocabulary extraction fails for one or more segment batches."""


class WordEntry(BaseModel):
    model_config = ConfigDict(extra="ignore")
    word: str
    romanization: str
    meaning: str
    usage: str


class SegmentVocabulary(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: int
    words: List[WordEntry]


class VocabularyResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    segments: List[SegmentVocabulary]


# Fully inlined JSON schema for OpenAI strict structured outputs.
# Cannot use model_json_schema() — OpenAI strict mode forbids $ref/$defs.
_VOCABULARY_JSON_SCHEMA = {
    "type": "object",
    "properties": {
        "segments": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "integer"},
                    "words": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "word": {"type": "string"},
                                "romanization": {"type": "string"},
                                "meaning": {"type": "string"},
                                "usage": {"type": "string"},
                            },
                            "required": ["word", "romanization", "meaning", "usage"],
                            "additionalProperties": False,
                        },
                    },
                },
                "required": ["id", "words"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["segments"],
    "additionalProperties": False,
}


def _build_vocab_prompt(segments: list[dict], source_language: str = "zh-CN", meaning_language: str = "English") -> str:
    """Build a prompt to extract key vocabulary from segments."""
    lang_cfg = get_language_config(source_language)
    no_romanization = lang_cfg["romanization_description"].startswith("leave empty")
    romanization_line = (
        '- "romanization": leave as empty string ""\n'
        if no_romanization
        else f'- "romanization": {lang_cfg["romanization_description"]}\n'
    )
    segments_text = "\n".join(
        f'{{"id": {seg["id"]}, "text": "{seg["text"]}"}}'
        for seg in segments
    )
    return (
        f"You are a {lang_cfg['language_name']} language teacher. For each segment below, break down ALL meaningful words and phrases.\n"
        "Include every content word (nouns, verbs, adjectives, adverbs, measure words, grammar particles).\n"
        "Skip only pure punctuation. The goal is that a student can hover over ANY word and see its meaning.\n\n"
        "For each word provide:\n"
        '- "word": the characters/text exactly as they appear in the segment\n'
        + romanization_line +
        f'- "meaning": concise {meaning_language} meaning\n'
        '- "usage": a short example sentence (different from the source)\n\n'
        f"Segments:\n{segments_text}\n\n"
        "IMPORTANT: Cover ALL words in each segment, not just key vocabulary.\n\n"
        "Return a JSON object with this exact structure:\n"
        '{"segments": [{"id": <int>, "words": [{"word": "<str>", "romanization": "<str>", "meaning": "<str>", "usage": "<str>"}]}]}'
    )


_VOCAB_BATCH_SIZE = 5
_MAX_ATTEMPTS = 3


async def _extract_batch_with_retry(
    segments: list[dict],
    api_key: str,
    semaphore: asyncio.Semaphore,
    source_language: str = "zh-CN",
    meaning_language: str = "English",
) -> dict[int, list[dict]]:
    """Extract vocabulary for a batch of segments with semaphore gating and retry on 429."""
    seg_ids = [s["id"] for s in segments]
    prompt = _build_vocab_prompt(segments, source_language=source_language, meaning_language=meaning_language)
    response_format = {
        "type": "json_schema",
        "json_schema": {
            "name": "vocabulary_response",
            "strict": True,
            "schema": _VOCABULARY_JSON_SCHEMA,
        },
    }

    async with semaphore:
        for attempt in range(_MAX_ATTEMPTS):
            try:
                async with httpx.AsyncClient(timeout=180.0) as client:
                    response = await client.post(
                        settings.openrouter_chat_url,
                        headers={
                            "Authorization": f"Bearer {api_key}",
                            "Content-Type": "application/json",
                        },
                        json={
                            "model": settings.openrouter_structured_model,
                            "messages": [{"role": "user", "content": prompt}],
                            "response_format": response_format,
                            "temperature": 0.1,
                            "max_tokens": 16384,
                        },
                    )
                    if response.status_code == 429:
                        if attempt < _MAX_ATTEMPTS - 1:
                            wait = 2 ** attempt + random.uniform(0, 1)
                            logger.warning(
                                "Vocab batch %s: rate limited (429), retry %d/%d in %.1fs",
                                seg_ids, attempt + 1, _MAX_ATTEMPTS - 1, wait,
                            )
                            await asyncio.sleep(wait)
                            continue
                        raise VocabularyExtractionError(
                            f"Vocab batch {seg_ids}: exhausted {_MAX_ATTEMPTS} attempts on rate limit"
                        )
                    response.raise_for_status()

                if not response.text.strip():
                    if attempt < _MAX_ATTEMPTS - 1:
                        logger.warning(
                            "Vocab batch %s: empty response body (HTTP 200), retry %d/%d",
                            seg_ids, attempt + 1, _MAX_ATTEMPTS - 1,
                        )
                        continue
                    raise VocabularyExtractionError(
                        f"Vocab batch {seg_ids}: empty response body after {_MAX_ATTEMPTS} attempts"
                    )
                body = response.json()
                if "error" in body:
                    raise VocabularyExtractionError(
                        f"Vocab batch {seg_ids}: OpenRouter error — {body['error']}"
                    )
                choice = body["choices"][0]
                finish_reason = choice.get("finish_reason", "")
                if finish_reason == "length":
                    logger.warning(
                        "Vocab batch %s: response truncated (finish_reason=length), "
                        "output hit max_tokens limit — retry %d/%d",
                        seg_ids, attempt + 1, _MAX_ATTEMPTS - 1,
                    )
                    if attempt < _MAX_ATTEMPTS - 1:
                        continue
                    raise VocabularyExtractionError(
                        f"Vocab batch {seg_ids}: response truncated after {_MAX_ATTEMPTS} attempts"
                    )
                content = choice["message"]["content"]
                try:
                    parsed = VocabularyResponse.model_validate_json(content)
                    total_words = sum(len(seg.words) for seg in parsed.segments)
                    logger.info(
                        "Vocab batch %s: OK — %d segments, %d words extracted",
                        seg_ids, len(parsed.segments), total_words,
                    )
                    return {seg.id: [w.model_dump() for w in seg.words] for seg in parsed.segments}
                except Exception as e:
                    raise VocabularyExtractionError(
                        f"Vocab batch {seg_ids}: failed to parse response — {e}"
                    )

            except VocabularyExtractionError:
                raise
            except asyncio.CancelledError:
                raise
            except Exception as e:
                raise VocabularyExtractionError(
                    f"Vocab batch {seg_ids}: unexpected error — {e}"
                ) from e

    # Unreachable, but satisfies type checker
    raise VocabularyExtractionError(f"Vocab batch {seg_ids}: exhausted all attempts")


async def extract_vocabulary(
    segments: list[dict],
    api_key: str,
    source_language: str = "zh-CN",
    meaning_language: str = "English",
) -> dict[int, list[dict]]:
    """Extract vocabulary for all segments in parallel batches.

    Fires all batch tasks concurrently (max 20 in-flight via semaphore).
    Raises VocabularyExtractionError if any batch fails after retries —
    guaranteeing all-or-nothing consistency.
    """
    if not segments:
        return {}

    semaphore = asyncio.Semaphore(20)
    batches = [
        segments[i : i + _VOCAB_BATCH_SIZE]
        for i in range(0, len(segments), _VOCAB_BATCH_SIZE)
    ]
    tasks = [
        asyncio.create_task(_extract_batch_with_retry(batch, api_key, semaphore, source_language, meaning_language))
        for batch in batches
    ]
    logger.info("Vocabulary: dispatching %d parallel batches for %d segments", len(tasks), len(segments))

    try:
        results: list[dict[int, list[dict]]] = await asyncio.gather(*tasks)
    except VocabularyExtractionError:
        for t in tasks:
            t.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        raise
    except Exception as e:
        for t in tasks:
            t.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        raise VocabularyExtractionError(f"Vocabulary extraction failed: {e}") from e

    merged: dict[int, list[dict]] = {}
    for batch_result in results:
        merged.update(batch_result)

    logger.info("Vocabulary: complete — %d segments with words", len(merged))
    return merged
