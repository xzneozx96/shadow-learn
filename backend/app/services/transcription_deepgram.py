"""Deepgram nova-3 STT provider."""

import asyncio
import logging
from pathlib import Path
from typing import TypedDict

import httpx

from app.services._retry import http_retry
from app.services.transcription_provider import (
    TranscriptionKeys,
    _Segment,
    _Word,
    _WordTiming,
    _group_words_into_segments,
)
from app.services.subtitle_segmenter import SubtitleSegmenter

logger = logging.getLogger(__name__)

_DEEPGRAM_TRANSCRIPTION_URL = "https://api.deepgram.com/v1/listen"
_DEEPGRAM_PARAMS = {
    "diarize": "true",
    "punctuate": "true",
    "utterances": "true",
    "smart_format": "true",
    "model": "nova-3",
}


class _DeepgramWord(TypedDict):
    word: str
    start: float
    end: float
    confidence: float
    speaker: int
    speaker_confidence: float
    punctuated_word: str


class _DeepgramUtterance(TypedDict):
    start: float
    end: float
    transcript: str
    words: list[_DeepgramWord]
    speaker: int
    id: str
    channel: int
    confidence: float


class _DeepgramAlternative(TypedDict):
    transcript: str
    confidence: float
    words: list[_DeepgramWord]


class _DeepgramChannel(TypedDict):
    alternatives: list[_DeepgramAlternative]
    detected_language: str
    language_confidence: float


class _DeepgramResults(TypedDict):
    channels: list[_DeepgramChannel]
    utterances: list[_DeepgramUtterance]


class _DeepgramResponse(TypedDict):
    results: _DeepgramResults


def _normalize_deepgram_words(words: list[_DeepgramWord]) -> list[_Word]:
    return [
        {
            "text": w.get("punctuated_word") or w["word"],
            "start": w["start"],
            "end": w["end"],
        }
        for w in words
    ]


def _segments_from_utterances(utterances: list[_DeepgramUtterance], language: str) -> list[_Segment]:
    segmenter = SubtitleSegmenter()
    segments: list[_Segment] = []
    segment_id = 0

    for utt in utterances:
        word_timings: list[_WordTiming] = [
            {
                "text": w.get("punctuated_word") or w["word"],
                "start": w["start"],
                "end": w["end"],
            }
            for w in utt.get("words", [])
        ]

        _is_cjk = language.startswith("zh") or language.startswith("ja")

        if not word_timings:
            text = utt["transcript"]
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


async def transcribe_audio_deepgram(audio_path: Path, api_key: str, language: str) -> list[_Segment]:
    """Transcribe audio using Deepgram nova-3. Used internally by DeepgramSTTProvider."""
    file_size = audio_path.stat().st_size
    logger.info("Transcribing %s (%.1f MB) with Deepgram nova-3", audio_path.name, file_size / 1024 / 1024)

    if file_size == 0:
        raise ValueError(f"Audio file is empty (0 bytes): {audio_path.name}")

    suffix = audio_path.suffix.lower().lstrip(".")
    _MIME_MAP = {"mp3": "audio/mpeg", "mp4": "audio/mp4", "m4a": "audio/mp4", "wav": "audio/wav", "ogg": "audio/ogg"}
    content_type = _MIME_MAP.get(suffix, f"audio/{suffix}") if suffix else "audio/mpeg"

    audio_bytes = await asyncio.to_thread(audio_path.read_bytes)
    params = {**_DEEPGRAM_PARAMS, "language": language}

    @http_retry(logger)
    async def _http_call() -> dict:
        async with httpx.AsyncClient(timeout=300.0) as client:
            response = await client.post(
                _DEEPGRAM_TRANSCRIPTION_URL,
                params=params,
                headers={
                    "Authorization": f"Token {api_key}",
                    "Content-Type": content_type,
                    "Content-Length": str(file_size),
                },
                content=audio_bytes,
            )
        if response.status_code != 200:
            logger.error("Deepgram API error %d: %s", response.status_code, response.text[:500])
        response.raise_for_status()
        return response.json()

    data: _DeepgramResponse = await _http_call()
    results = data.get("results", {})  # type: ignore[union-attr]

    utterances: list[_DeepgramUtterance] = results.get("utterances", [])  # type: ignore[assignment]
    if utterances:
        segments = _segments_from_utterances(utterances, language)
        logger.info("Deepgram transcription complete: %d segments from utterances", len(segments))
        return segments

    channels = results.get("channels", [])  # type: ignore[call-overload]
    if not channels:
        logger.warning("Deepgram returned no channels — empty transcript")
        return []

    channel = channels[0]
    detected_language = channel.get("detected_language", "unknown")
    language_confidence = channel.get("language_confidence", 0.0)
    logger.info("Deepgram detected language: %s (confidence=%.2f)", detected_language, language_confidence)

    alternative = channel.get("alternatives", [{}])[0]  # type: ignore[call-overload]
    raw_words: list[_DeepgramWord] = alternative.get("words", [])  # type: ignore[assignment]
    if not raw_words:
        logger.warning("Deepgram returned no speech")
        return []

    words = _normalize_deepgram_words(raw_words)
    return _group_words_into_segments(words, language)


class DeepgramSTTProvider:
    """STTProvider implementation backed by Deepgram nova-3."""

    async def transcribe(self, audio_path: Path, keys: TranscriptionKeys, language: str) -> list[_Segment]:
        api_key = keys.get("deepgram_api_key", "")
        if not api_key:
            raise ValueError("Deepgram API key is required when stt_provider=deepgram")
        return await transcribe_audio_deepgram(audio_path, api_key, language)
