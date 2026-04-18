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

_GLADIA_UPLOAD_URL = "https://api.gladia.io/v2/upload"
_GLADIA_TRANSCRIPTION_URL = "https://api.gladia.io/v2/pre-recorded"

_GLADIA_LANGUAGE_MAP: dict[str, str] = {
    "zh-CN": "zh",
    "zh-TW": "zh",
    "vi-VN": "vi",
    "ja-JP": "ja",
    "ko-KR": "ko",
    "en-US": "en",
    "en-GB": "en",
    "fr-FR": "fr",
    "de-DE": "de",
    "es-ES": "es",
    "pt-BR": "pt",
}


def _normalize_language_for_gladia(language: str) -> str:
    """Convert full locale (zh-CN) to Gladia format (zh)."""
    return _GLADIA_LANGUAGE_MAP.get(language, language.split("-")[0])
_GLADIA_RESULT_URL = "https://api.gladia.io/v2/pre-recorded/{job_id}"

_POLL_INTERVAL_SECONDS = 2.0
_POLL_TIMEOUT_SECONDS = 300.0


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


async def _upload_audio(audio_path: Path, api_key: str) -> str:
    """Upload audio file to Gladia and return the audio_url."""
    audio_bytes = await asyncio.to_thread(audio_path.read_bytes)
    suffix = audio_path.suffix.lower().lstrip(".")
    _MIME_MAP = {"mp3": "audio/mpeg", "mp4": "audio/mp4", "m4a": "audio/mp4", "wav": "audio/wav", "ogg": "audio/ogg"}
    content_type = _MIME_MAP.get(suffix, "audio/mpeg")

    @http_retry(logger)
    async def _http_call() -> dict:
        async with httpx.AsyncClient(timeout=300.0) as client:
            response = await client.post(
                _GLADIA_UPLOAD_URL,
                files={"audio": (audio_path.name, audio_bytes, content_type)},
                headers={"x-gladia-key": api_key},
            )
        if response.status_code != 200:
            logger.error("Gladia upload error %d: %s", response.status_code, response.text[:500])
        response.raise_for_status()
        return response.json()

    data = await _http_call()
    return data["audio_url"]


async def _start_transcription(audio_url: str, api_key: str, language: str) -> str:
    """Start pre-recorded transcription job and return job_id."""
    gladia_lang = _normalize_language_for_gladia(language)
    body = {
        "audio_url": audio_url,
        "language_config": {
            "languages": [gladia_lang],
            "code_switching": False,
        },
        "diarization": True,
        "punctuation_enhanced": True,
    }

    @http_retry(logger)
    async def _http_call() -> dict:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                _GLADIA_TRANSCRIPTION_URL,
                json=body,
                headers={
                    "x-gladia-key": api_key,
                    "Content-Type": "application/json",
                },
            )
        if response.status_code not in (200, 201):
            logger.error("Gladia transcription start error %d: %s", response.status_code, response.text[:500])
        response.raise_for_status()
        return response.json()

    data = await _http_call()
    return data["id"]


async def _poll_for_result(job_id: str, api_key: str) -> dict:
    """Poll for transcription result until status is done."""
    result_url = _GLADIA_RESULT_URL.format(job_id=job_id)
    start_time = asyncio.get_event_loop().time()

    @http_retry(logger)
    async def _http_call() -> dict:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.get(
                result_url,
                headers={"x-gladia-key": api_key},
            )
        if response.status_code != 200:
            logger.error("Gladia result poll error %d: %s", response.status_code, response.text[:500])
        response.raise_for_status()
        return response.json()

    while True:
        elapsed = asyncio.get_event_loop().time() - start_time
        if elapsed > _POLL_TIMEOUT_SECONDS:
            raise TimeoutError(f"Gladia transcription timed out after {elapsed:.1f}s")

        data = await _http_call()
        status = data.get("status", "unknown")

        if status == "done":
            return data
        if status in ("error", "failed"):
            raise RuntimeError(f"Gladia transcription failed: {data.get('message', 'unknown error')}")

        logger.info("Gladia transcription status: %s, waiting...", status)
        await asyncio.sleep(_POLL_INTERVAL_SECONDS)


async def transcribe_audio_gladia(audio_path: Path, api_key: str, language: str) -> list[_Segment]:
    """Transcribe audio using Gladia Pre-recorded API.

    Two-step async pattern:
    1. Upload audio file -> get audio_url
    2. POST /v2/pre-recorded -> get job_id
    3. Poll GET /v2/pre-recorded/:id until status=done
    4. Extract utterances from result
    """
    file_size = audio_path.stat().st_size
    logger.info("Transcribing %s (%.1f MB) with Gladia", audio_path.name, file_size / 1024 / 1024)

    if file_size == 0:
        raise ValueError(f"Audio file is empty (0 bytes): {audio_path.name}")

    audio_url = await _upload_audio(audio_path, api_key)
    job_id = await _start_transcription(audio_url, api_key, language)
    logger.info("Gladia job started: %s", job_id)

    result = await _poll_for_result(job_id, api_key)
    utterances: list[_GladiaUtterance] = result.get("result", {}).get("transcription", {}).get("utterances", [])
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