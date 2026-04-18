"""Gladia STT provider."""

import asyncio
import logging
from pathlib import Path
from typing import TypedDict

import httpx

from app.services._retry import http_retry
from app.services.transcription_provider import (
    TranscriptionKeys,
    _Segment,
    _WordTiming,
)
from app.services.subtitle_segmenter import SubtitleSegmenter

logger = logging.getLogger(__name__)

_GLADIA_TRANSCRIPTION_URL = "https://api.gladia.io/v2/live"


class _GladiaWord(TypedDict):
    word: str
    start: float
    end: float
    confidence: float


class _GladiaUtterance(TypedDict):
    language: str
    start: float
    end: float
    confidence: float
    channel: int
    text: str
    speaker: None
    words: list[_GladiaWord]


def _segments_from_gladia_utterances(utterances: list[_GladiaUtterance], language: str) -> list[_Segment]:
    """Process Gladia utterances into subtitle segments.

    Adaptation from Deepgram:
    - Uses word["word"] directly (no punctuated_word fallback)
    - Uses utterance["text"] for transcript
    - Skips speaker-based processing (speaker is always null)
    """
    segmenter = SubtitleSegmenter()
    segments: list[_Segment] = []
    segment_id = 0

    for utt in utterances:
        word_timings: list[_WordTiming] = [
            {
                "text": w["word"],
                "start": w["start"],
                "end": w["end"],
            }
            for w in utt.get("words", [])
        ]

        _is_cjk = language.startswith("zh") or language.startswith("ja")

        if not word_timings:
            text = utt["text"]
            if _is_cjk:
                text = text.replace(" ", "")
            if not text.strip():
                continue
            word_timings = [
                {"text": text, "start": utt["start"], "end": utt["end"]}
            ]

        chunks = segmenter.segment_words(word_timings, language)

        for chunk in chunks:
            if not chunk:
                continue

            text = " ".join(w["text"] for w in chunk)
            if _is_cjk:
                text = text.replace(" ", "")
            if not text.strip():
                continue

            segments.append({
                "id": segment_id,
                "start": chunk[0]["start"],
                "end": chunk[-1]["end"],
                "text": text,
                "word_timings": chunk,
            })
            segment_id += 1

    return segments


async def transcribe_audio_gladia(audio_path: Path, api_key: str, language: str) -> list[_Segment]:
    """Transcribe audio using Gladia API."""
    file_size = audio_path.stat().st_size
    logger.info("Transcribing %s (%.1f MB) with Gladia", audio_path.name, file_size / 1024 / 1024)

    if file_size == 0:
        raise ValueError(f"Audio file is empty (0 bytes): {audio_path.name}")

    suffix = audio_path.suffix.lower().lstrip(".")
    _MIME_MAP = {"mp3": "audio/mpeg", "mp4": "audio/mp4", "m4a": "audio/mp4", "wav": "audio/wav", "ogg": "audio/ogg"}
    content_type = _MIME_MAP.get(suffix, "audio/mpeg")

    audio_bytes = await asyncio.to_thread(audio_path.read_bytes)

    @http_retry(logger)
    async def _http_call() -> dict:
        async with httpx.AsyncClient(timeout=300.0) as client:
            response = await client.post(
                _GLADIA_TRANSCRIPTION_URL,
                files={"file": (audio_path.name, audio_bytes, content_type)},
                data={
                    "language": language,
                    "model": "solaria-1",
                },
                headers={"x-gladia-key": api_key},
            )
        if response.status_code != 200:
            logger.error("Gladia API error %d: %s", response.status_code, response.text[:500])
        response.raise_for_status()
        return response.json()

    data = await _http_call()
    utterances: list[_GladiaUtterance] = data.get("result", {}).get("transcription", {}).get("utterances", [])
    if not utterances:
        logger.warning("Gladia returned no utterances — empty transcript")
        return []
    return _segments_from_gladia_utterances(utterances, language)


class GladiaSTTProvider:
    """STTProvider implementation backed by Gladia."""

    async def transcribe(self, audio_path: Path, keys: TranscriptionKeys, language: str) -> list[_Segment]:
        api_key = keys.get("gladia_api_key", "")
        if not api_key:
            raise ValueError("Gladia API key is required when stt_provider=gladia")
        return await transcribe_audio_gladia(audio_path, api_key, language)