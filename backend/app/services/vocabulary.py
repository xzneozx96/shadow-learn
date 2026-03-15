"""Vocabulary extraction service using OpenAI API."""

import json
import logging
from typing import List

import httpx
from pydantic import BaseModel, ConfigDict

from app.config import settings

logger = logging.getLogger(__name__)


class WordEntry(BaseModel):
    model_config = ConfigDict(extra="forbid")
    word: str
    pinyin: str
    meaning: str
    usage: str


class SegmentVocabulary(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: int
    words: List[WordEntry]


class VocabularyResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    segments: List[SegmentVocabulary]


def _build_vocab_prompt(segments: list[dict]) -> str:
    """Build a prompt to extract key vocabulary from Chinese segments."""
    segments_text = "\n".join(
        f'{{"id": {seg["id"]}, "text": "{seg["text"]}"}}'
        for seg in segments
    )
    return (
        "You are a Chinese language teacher. For each segment below, break down ALL meaningful Chinese words and phrases.\n"
        "Include every content word (nouns, verbs, adjectives, adverbs, measure words, grammar particles).\n"
        "Skip only pure punctuation. The goal is that a student can hover over ANY word in the sentence and see its meaning.\n\n"
        "For each word provide:\n"
        '- "word": the Chinese characters as they appear in the text (must match exactly)\n'
        '- "pinyin": with tone marks (e.g. "zhōng wén")\n'
        '- "meaning": concise English meaning\n'
        '- "usage": a short example sentence in Chinese (different from the source)\n\n'
        f"Segments:\n{segments_text}\n\n"
        "IMPORTANT: Cover ALL words in each segment, not just key vocabulary."
    )


_VOCAB_BATCH_SIZE = 8


async def _extract_batch(
    segments: list[dict],
    api_key: str,
    model: str,
) -> dict[int, list[dict]]:
    """Extract vocabulary for a single batch of segments using Structured Outputs."""
    prompt = _build_vocab_prompt(segments)

    # Define the JSON schema for Structured Outputs
    response_format = {
        "type": "json_schema",
        "json_schema": {
            "name": "vocabulary_extraction",
            "strict": True,
            "schema": VocabularyResponse.model_json_schema()
        }
    }

    async with httpx.AsyncClient(timeout=180.0) as client:
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
        if response.status_code != 200:
            logger.error("OpenAI error %d: %s", response.status_code, response.text)
        response.raise_for_status()

    data = response.json()
    content = data["choices"][0]["message"]["content"]
    
    try:
        parsed = VocabularyResponse.model_validate_json(content)
        return {seg.id: [w.model_dump() for w in seg.words] for seg in parsed.segments}
    except Exception as e:
        logger.error("Failed to parse vocabulary response: %s", e)
        # Attempt fallback to simple json.loads if schema validation fails but it's still JSON
        try:
            raw_data = json.loads(content)
            # If it's the old format (array), handle it
            if isinstance(raw_data, list):
                return {item.get("id"): item.get("words", []) for item in raw_data if "id" in item}
            # If it's the new format but failed validation
            if isinstance(raw_data, dict) and "segments" in raw_data:
                return {item.get("id"): item.get("words", []) for item in raw_data["segments"] if "id" in item}
        except:
            pass
        return {}


async def extract_vocabulary(
    segments: list[dict],
    api_key: str,
    model: str = "gpt-4o-mini",
) -> dict[int, list[dict]]:
    """Extract vocabulary for all segments in batches, returning segment_id -> words map."""
    if not segments:
        return {}

    result: dict[int, list[dict]] = {}

    for i in range(0, len(segments), _VOCAB_BATCH_SIZE):
        batch = segments[i:i + _VOCAB_BATCH_SIZE]
        try:
            batch_result = await _extract_batch(batch, api_key, model)
            result.update(batch_result)
            logger.info(
                "Vocabulary batch %d-%d: extracted words for %d/%d segments",
                i, i + len(batch), len(batch_result), len(batch),
            )
        except Exception as exc:
            logger.warning("Vocabulary batch %d-%d failed (non-fatal): %s", i, i + len(batch), exc)

    logger.info("Total vocabulary: %d segments with words", len(result))
    return result
