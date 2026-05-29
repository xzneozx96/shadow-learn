"""Vocabulary extraction service using OpenRouter API.

Two paths:
- ``enrich_vocabulary``: words are pre-segmented (e.g. jieba) and pre-romanized
  deterministically; the LLM only fills meaning + usage. Cannot drop or invent words.
- ``extract_vocabulary``: legacy fallback where the LLM segments + romanizes + defines,
  used for languages without a deterministic segmenter.
"""

import asyncio
import json
import logging
from typing import Awaitable, Callable, List

import httpx
from pydantic import BaseModel, ConfigDict

from app.lessons.services.romanization_provider import RomanizationProvider
from app.settings import settings
from app.shared._retry import RetryableError, http_retry
from app.shared.language_config import get_language_config

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


class EnrichWordEntry(BaseModel):
    model_config = ConfigDict(extra="ignore")
    word: str
    meaning: str
    usage: str


class EnrichSegment(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: int
    words: List[EnrichWordEntry]


class EnrichResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    segments: List[EnrichSegment]


# Fully inlined JSON schemas for OpenAI strict structured outputs.
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

_VOCAB_ENRICH_JSON_SCHEMA = {
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
                                "meaning": {"type": "string"},
                                "usage": {"type": "string"},
                            },
                            "required": ["word", "meaning", "usage"],
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
    """Build a prompt to extract key vocabulary from segments (legacy LLM segmentation)."""
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


def _build_enrich_prompt(segments: list[dict], source_language: str = "zh-CN", meaning_language: str = "English") -> str:
    """Build a prompt that defines pre-segmented words. The LLM only adds meaning + usage."""
    lang_cfg = get_language_config(source_language)
    segments_text = "\n".join(
        f'{{"id": {seg["id"]}, "words": {json.dumps(seg.get("tokens", []), ensure_ascii=False)}}}'
        for seg in segments
    )
    return (
        f"You are a {lang_cfg['language_name']} language teacher. Each segment below has an id and an ordered "
        "list of words that have ALREADY been segmented.\n"
        "For EVERY word in each list, provide its meaning and an example usage. Do NOT add, drop, merge, "
        "reorder, or alter the words.\n\n"
        "For each word provide:\n"
        '- "word": copy the word EXACTLY as given\n'
        f'- "meaning": concise {meaning_language} meaning\n'
        '- "usage": a short example sentence (different from the source)\n\n'
        f"Segments:\n{segments_text}\n\n"
        "Return the SAME words in the SAME order for each segment, as a JSON object with this exact structure:\n"
        '{"segments": [{"id": <int>, "words": [{"word": "<str>", "meaning": "<str>", "usage": "<str>"}]}]}'
    )


_VOCAB_BATCH_SIZE = 5


def _make_batch_runner(
    seg_ids: list[int],
    prompt: str,
    json_schema_name: str,
    json_schema: dict,
    parse: Callable[[str], dict[int, list[dict]]],
    api_key: str,
    semaphore: asyncio.Semaphore,
) -> Callable[[], Awaitable[dict[int, list[dict]]]]:
    """Build a retrying coroutine that POSTs one batch and parses the structured response."""
    response_format = {
        "type": "json_schema",
        "json_schema": {
            "name": json_schema_name,
            "strict": True,
            "schema": json_schema,
        },
    }

    @http_retry(logger)
    async def _call() -> dict[int, list[dict]]:
        async with semaphore:
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
                        "temperature": 0.5,
                        "max_tokens": 65000,
                        "reasoning": {"effort": "none"},
                    },
                )
        response.raise_for_status()
        body = response.json()
        if "error" in body:
            raise RetryableError(
                f"Vocab batch {seg_ids}: OpenRouter error — {body['error']}"
            )
        choice = body["choices"][0]
        finish_reason = choice.get("finish_reason", "")
        if finish_reason == "length":
            logger.warning(
                "Vocab batch %s: response truncated (finish_reason=length), "
                "output hit max_tokens limit",
                seg_ids,
            )
            raise RetryableError(f"Vocab batch {seg_ids}: response truncated by token limit")
        content = choice["message"]["content"]
        try:
            return parse(content)
        except Exception as e:
            raise RetryableError(
                f"Vocab batch {seg_ids}: failed to parse response — {e}"
            ) from e

    return _call


async def _run_batch(
    runner: Callable[[], Awaitable[dict[int, list[dict]]]],
    seg_ids: list[int],
) -> dict[int, list[dict]]:
    """Execute a batch runner, wrapping unexpected failures as VocabularyExtractionError."""
    try:
        return await runner()
    except VocabularyExtractionError:
        raise
    except asyncio.CancelledError:
        raise
    except Exception as e:
        raise VocabularyExtractionError(
            f"Vocab batch {seg_ids}: unexpected error — {e}"
        ) from e


async def _gather_batches(tasks: list[asyncio.Task]) -> dict[int, list[dict]]:
    """Await all batch tasks, cancel siblings on first failure, merge results."""
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
    return merged


def _parse_extraction(content: str, seg_ids: list[int]) -> dict[int, list[dict]]:
    parsed = VocabularyResponse.model_validate_json(content)
    total_words = sum(len(seg.words) for seg in parsed.segments)
    logger.info(
        "Vocab batch %s: OK — %d segments, %d words extracted",
        seg_ids, len(parsed.segments), total_words,
    )
    return {seg.id: [w.model_dump() for w in seg.words] for seg in parsed.segments}


def _parse_enrichment(
    content: str,
    tokens_by_id: dict[int, list[str]],
    romanizer: RomanizationProvider,
    seg_ids: list[int],
) -> dict[int, list[dict]]:
    """Attach deterministic pinyin to our jieba tokens; splice in LLM meaning/usage.

    The token list is authoritative — coverage is guaranteed regardless of what the LLM
    returns. Meaning/usage are matched by exact word string, with a positional fallback
    only when the LLM returned the same number of words.
    """
    parsed = EnrichResponse.model_validate_json(content)
    llm_by_id = {seg.id: seg.words for seg in parsed.segments}

    result: dict[int, list[dict]] = {}
    for seg_id, tokens in tokens_by_id.items():
        llm_words = llm_by_id.get(seg_id, [])
        by_word: dict[str, EnrichWordEntry] = {}
        for w in llm_words:
            by_word.setdefault(w.word, w)
        same_length = len(llm_words) == len(tokens)

        words_out: list[dict] = []
        for i, token in enumerate(tokens):
            entry = by_word.get(token)
            if entry is None and same_length:
                entry = llm_words[i]
            words_out.append({
                "word": token,
                "romanization": romanizer.romanize_word(token),
                "meaning": entry.meaning if entry else "",
                "usage": entry.usage if entry else "",
            })
        result[seg_id] = words_out

    total_words = sum(len(v) for v in result.values())
    logger.info(
        "Vocab batch %s: enriched — %d segments, %d words",
        seg_ids, len(result), total_words,
    )
    return result


async def _extract_batch_with_retry(
    segments: list[dict],
    api_key: str,
    semaphore: asyncio.Semaphore,
    source_language: str = "zh-CN",
    meaning_language: str = "English",
) -> dict[int, list[dict]]:
    """Extract vocabulary for one batch (LLM segments + romanizes + defines)."""
    seg_ids = [s["id"] for s in segments]
    prompt = _build_vocab_prompt(segments, source_language=source_language, meaning_language=meaning_language)
    runner = _make_batch_runner(
        seg_ids, prompt, "vocabulary_response", _VOCABULARY_JSON_SCHEMA,
        lambda content: _parse_extraction(content, seg_ids),
        api_key, semaphore,
    )
    return await _run_batch(runner, seg_ids)


async def extract_vocabulary(
    segments: list[dict],
    api_key: str,
    source_language: str = "zh-CN",
    meaning_language: str = "English",
) -> dict[int, list[dict]]:
    """LLM extracts + segments + romanizes vocabulary for all segments (legacy fallback).

    Fires all batch tasks concurrently (max 20 in-flight via semaphore).
    Raises VocabularyExtractionError if any batch fails after retries.
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

    merged = await _gather_batches(tasks)
    logger.info("Vocabulary: complete — %d segments with words", len(merged))
    return merged


async def enrich_vocabulary(
    segments: list[dict],
    romanizer: RomanizationProvider,
    api_key: str,
    source_language: str = "zh-CN",
    meaning_language: str = "English",
) -> dict[int, list[dict]]:
    """Enrich pre-segmented words with meaning + usage; pinyin filled deterministically.

    Each segment must carry a ``tokens: list[str]`` list (e.g. from jieba). The LLM only
    supplies meaning + usage — it cannot drop or invent words, so coverage is guaranteed.
    """
    if not segments:
        return {}

    semaphore = asyncio.Semaphore(20)
    batches = [
        segments[i : i + _VOCAB_BATCH_SIZE]
        for i in range(0, len(segments), _VOCAB_BATCH_SIZE)
    ]
    tasks = []
    for batch in batches:
        seg_ids = [s["id"] for s in batch]
        tokens_by_id = {s["id"]: list(s.get("tokens", [])) for s in batch}
        prompt = _build_enrich_prompt(batch, source_language=source_language, meaning_language=meaning_language)
        runner = _make_batch_runner(
            seg_ids, prompt, "vocabulary_enrich_response", _VOCAB_ENRICH_JSON_SCHEMA,
            lambda content, tbi=tokens_by_id, ids=seg_ids: _parse_enrichment(content, tbi, romanizer, ids),
            api_key, semaphore,
        )
        tasks.append(asyncio.create_task(_run_batch(runner, seg_ids)))
    logger.info("Vocabulary: dispatching %d parallel enrich batches for %d segments", len(tasks), len(segments))

    merged = await _gather_batches(tasks)
    logger.info("Vocabulary: enrich complete — %d segments with words", len(merged))
    return merged
