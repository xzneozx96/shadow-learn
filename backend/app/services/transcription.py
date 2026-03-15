"""Transcription service using Deepgram nova-2 API."""

import asyncio
import logging
from pathlib import Path
from typing import TypedDict

import httpx

logger = logging.getLogger(__name__)

_SENTENCE_ENDINGS = set("。！？.!?")
_CLAUSE_BREAKS = set("，,、；;：:")
_GAP_THRESHOLD_SECONDS = 1.5
_MAX_SEGMENT_CHARS = 40


# ---------------------------------------------------------------------------
# Internal word/segment types
# ---------------------------------------------------------------------------

class _Word(TypedDict):
    text: str
    start: float
    end: float


class _WordTiming(TypedDict):
    text: str    # punctuated_word, or word key as fallback
    start: float
    end: float


class _Segment(TypedDict):
    id: int
    start: float
    end: float
    text: str
    word_timings: list[_WordTiming]


# ---------------------------------------------------------------------------
# Deepgram response types
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Segmentation helpers
# ---------------------------------------------------------------------------

def _finalize_segment(words: list[_Word], index: int) -> _Segment:
    """Create a segment dict from a list of word dicts."""
    text = "".join(w["text"] for w in words)
    return {
        "id": index,
        "start": words[0]["start"],
        "end": words[-1]["end"],
        "text": text,
        "word_timings": list(words),  # _Word has same shape as _WordTiming
    }


def _group_words_into_segments(words: list[_Word]) -> list[_Segment]:
    """Group a flat word list into sentence segments.

    Splits on sentence-ending punctuation or time gaps.
    Used as fallback when Deepgram paragraph data is unavailable.
    """
    segments: list[_Segment] = []
    current_words: list[_Word] = []
    segment_index = 0

    for word in words:
        text = word["text"]

        if not current_words:
            current_words.append(word)
        else:
            prev_end = current_words[-1]["end"]
            gap = word["start"] - prev_end

            if gap > _GAP_THRESHOLD_SECONDS:
                segments.append(_finalize_segment(current_words, segment_index))
                segment_index += 1
                current_words = [word]
            else:
                current_words.append(word)

        current_text = "".join(w["text"] for w in current_words)

        if text.rstrip() and text[-1] in _SENTENCE_ENDINGS:
            segments.append(_finalize_segment(current_words, segment_index))
            segment_index += 1
            current_words = []
        elif text.rstrip() and text[-1] in _CLAUSE_BREAKS and len(current_text) >= _MAX_SEGMENT_CHARS:
            segments.append(_finalize_segment(current_words, segment_index))
            segment_index += 1
            current_words = []
        elif len(current_text) >= int(_MAX_SEGMENT_CHARS * 1.5):
            segments.append(_finalize_segment(current_words, segment_index))
            segment_index += 1
            current_words = []

    if current_words:
        segments.append(_finalize_segment(current_words, segment_index))

    return segments



def _segments_from_utterances(utterances: list[_DeepgramUtterance]) -> list[_Segment]:
    """Convert Deepgram utterance objects to segments.

    Each utterance becomes one segment. Deepgram inserts spaces between CJK tokens
    in transcript text (e.g. "你 在 学 什 么"). Stripping all spaces produces clean Chinese.
    Works for both single-speaker and multi-speaker content.
    """
    segments: list[_Segment] = []
    for i, utt in enumerate(utterances):
        text = utt["transcript"].replace(" ", "")
        if not text:
            continue
        word_timings: list[_WordTiming] = [
            {
                "text": w.get("punctuated_word") or w["word"],
                "start": w["start"],
                "end": w["end"],
            }
            for w in utt.get("words", [])
        ]
        segments.append({
            "id": i,   # utterance-positional index (skipped empty utterances leave id gaps)
            "start": utt["start"],
            "end": utt["end"],
            "text": text,
            "word_timings": word_timings,
        })
    return segments


# ---------------------------------------------------------------------------
# Deepgram transcription
# ---------------------------------------------------------------------------

_DEEPGRAM_TRANSCRIPTION_URL = "https://api.deepgram.com/v1/listen"
_DEEPGRAM_PARAMS = {
    "diarize": "true",
    "punctuate": "true",
    "utterances": "true",
    "smart_format": "true",
    "language": "zh-CN",
    "model": "nova-2",
}


def _normalize_deepgram_words(words: list[_DeepgramWord]) -> list[_Word]:
    """Convert Deepgram word objects to the internal {text, start, end} format."""
    return [
        {
            "text": w.get("punctuated_word") or w["word"],
            "start": w["start"],
            "end": w["end"],
        }
        for w in words
    ]


async def transcribe_audio_deepgram(audio_path: Path, api_key: str) -> list[_Segment]:
    """Transcribe an audio file using the Deepgram nova-2 API.

    Uses utterance segmentation from Deepgram (speaker-aware, punctuated).
    Falls back to word-level grouping if utterance data is absent.
    Returns a list of segment dicts with keys: id, start, end, text, word_timings.
    """
    file_size = audio_path.stat().st_size
    logger.info("Transcribing %s (%.1f MB) with Deepgram nova-2", audio_path.name, file_size / 1024 / 1024)

    if file_size == 0:
        raise ValueError(f"Audio file is empty (0 bytes): {audio_path.name}")

    suffix = audio_path.suffix.lower().lstrip(".")
    # audio/mp3 is non-standard; audio/mpeg is the correct MIME type for MP3
    _MIME_MAP = {"mp3": "audio/mpeg", "mp4": "audio/mp4", "m4a": "audio/mp4", "wav": "audio/wav", "ogg": "audio/ogg"}
    content_type = _MIME_MAP.get(suffix, f"audio/{suffix}") if suffix else "audio/mpeg"

    audio_bytes = await asyncio.to_thread(audio_path.read_bytes)

    async with httpx.AsyncClient(timeout=300.0) as client:
        response = await client.post(
            _DEEPGRAM_TRANSCRIPTION_URL,
            params=_DEEPGRAM_PARAMS,
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

    data: _DeepgramResponse = response.json()
    results = data.get("results", {})  # type: ignore[union-attr]

    # Primary: use utterances (works for single-speaker and multi-speaker)
    utterances: list[_DeepgramUtterance] = results.get("utterances", [])  # type: ignore[assignment]
    if utterances:
        segments = _segments_from_utterances(utterances)
        logger.info("Deepgram transcription complete: %d segments from utterances", len(segments))
        return segments

    # Fallback: word-level grouping from channels
    channels = results.get("channels", [])  # type: ignore[call-overload]
    if not channels:
        logger.warning("Deepgram returned no channels — empty transcript")
        return []

    channel = channels[0]
    detected_language = channel.get("detected_language", "unknown")
    language_confidence = channel.get("language_confidence", 0.0)
    logger.info("Deepgram detected language: %s (confidence=%.2f)", detected_language, language_confidence)

    alternative = channel.get("alternatives", [{}])[0]  # type: ignore[call-overload]
    alt_confidence = alternative.get("confidence", 0.0)
    alt_transcript = alternative.get("transcript", "")
    logger.info(
        "Deepgram alternative (word fallback): confidence=%.4f, transcript=%r",
        alt_confidence,
        alt_transcript[:100] if alt_transcript else "(empty)",
    )

    raw_words: list[_DeepgramWord] = alternative.get("words", [])  # type: ignore[assignment]
    if not raw_words:
        logger.warning(
            "Deepgram returned no speech. "
            "detected_language=%s, language_confidence=%.2f, alt_confidence=%.4f, transcript=%r",
            detected_language, language_confidence, alt_confidence,
            alt_transcript[:200] if alt_transcript else "(empty)",
        )
        return []

    logger.info("Deepgram transcription complete (word fallback): %d words", len(raw_words))
    words = _normalize_deepgram_words(raw_words)
    return _group_words_into_segments(words)
