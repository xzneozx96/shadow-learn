"""Azure AI Speech STT provider using Fast Transcription REST API."""

import asyncio
import json
import logging
from pathlib import Path

import httpx

from app.services.transcription_provider import (
    TranscriptionKeys,
    _Segment,
    _Word,
    _WordTiming,
    _finalize_segment,
)

logger = logging.getLogger(__name__)

_API_VERSION = "2024-11-15"
_TIMEOUT_SECONDS = 600.0

# Fast Transcription API requires full BCP-47 tags; map short codes to canonical forms
_LOCALE_MAP: dict[str, str] = {
    "en": "en-US",
    "vi": "vi-VN",
    "ja": "ja-JP",
    "ko": "ko-KR",
    "fr": "fr-FR",
    "de": "de-DE",
    "es": "es-ES",
    "pt": "pt-BR",
}


def _normalize_locale(language: str) -> str:
    """Map short language codes to full BCP-47 tags required by the Fast Transcription API."""
    return _LOCALE_MAP.get(language, language)


def _parse_duration(iso: str) -> float:
    """Parse ISO 8601 duration 'PT1.23S' → 1.23 seconds."""
    return float(iso.removeprefix("PT").removesuffix("S"))


class AzureSTTProvider:
    """STTProvider backed by Azure AI Speech Fast Transcription REST API."""

    async def transcribe(self, audio_path: Path, keys: TranscriptionKeys, language: str) -> list[_Segment]:
        key = keys.get("azure_speech_key", "")
        region = keys.get("azure_speech_region", "")
        if not key:
            raise ValueError("Azure Speech key is required when stt_provider=azure")
        if not region:
            raise ValueError("Azure Speech region is required when stt_provider=azure")

        url = (
            f"https://{region}.api.cognitive.microsoft.com"
            f"/speechtotext/transcriptions:transcribe?api-version={_API_VERSION}"
        )
        locale = _normalize_locale(language)
        definition = {
            "locales": [locale],
            "profanityFilterMode": "None",
            "wordLevelTimestampsEnabled": True,
        }

        logger.info("Azure Fast STT: submitting %s (language=%s)", audio_path.name, language)
        audio_bytes = audio_path.read_bytes()

        _MAX_RETRIES = 5
        _BASE_DELAY = 10.0
        response = None
        async with httpx.AsyncClient(timeout=_TIMEOUT_SECONDS) as client:
            for attempt in range(_MAX_RETRIES):
                response = await client.post(
                    url,
                    headers={"Ocp-Apim-Subscription-Key": key},
                    files={
                        "audio": (audio_path.name, audio_bytes, "audio/mpeg"),
                        "definition": (None, json.dumps(definition), "application/json"),
                    },
                )
                if response.status_code != 429:
                    break
                delay = _BASE_DELAY * (2 ** attempt)
                logger.warning("Azure Fast STT: rate limited (429), retrying in %.0fs (attempt %d/%d)", delay, attempt + 1, _MAX_RETRIES)
                await asyncio.sleep(delay)

        if response.status_code != 200:
            raise RuntimeError(
                f"Azure Fast STT error {response.status_code}: {response.text[:300]}"
            )

        data = response.json()
        phrases = data.get("phrases", [])
        logger.info("Azure Fast STT: complete, %d phrases", len(phrases))

        segments: list[_Segment] = []
        for idx, phrase in enumerate(phrases):
            words_raw = phrase.get("words", [])
            text = phrase.get("text", "")
            if language.startswith("zh"):
                text = text.replace(" ", "")

            if words_raw:
                word_dicts: list[_Word] = [
                    {
                        "text": w["text"],
                        "start": w["offsetMilliseconds"] / 1000.0 if "offsetMilliseconds" in w else _parse_duration(w["offset"]),
                        "end": (w["offsetMilliseconds"] + w["durationMilliseconds"]) / 1000.0 if "offsetMilliseconds" in w else _parse_duration(w["offset"]) + _parse_duration(w["duration"]),
                    }
                    for w in words_raw
                ]
                word_timings: list[_WordTiming] = [
                    {"text": w["text"], "start": w["start"], "end": w["end"]}
                    for w in word_dicts
                ]
                seg = _finalize_segment(word_dicts, idx, language)
                seg["word_timings"] = word_timings
            else:
                if "offsetMilliseconds" in phrase:
                    offset = phrase["offsetMilliseconds"] / 1000.0
                    end = (phrase["offsetMilliseconds"] + phrase["durationMilliseconds"]) / 1000.0
                else:
                    offset = _parse_duration(phrase["offset"])
                    end = offset + _parse_duration(phrase["duration"])
                seg = {
                    "id": idx,
                    "start": offset,
                    "end": end,
                    "text": text,
                    "word_timings": [],
                }
            segments.append(seg)

        return segments
