"""Transcription service using OpenAI Whisper API."""

import logging
from pathlib import Path

import httpx

logger = logging.getLogger(__name__)

_OPENAI_TRANSCRIPTION_URL = "https://api.openai.com/v1/audio/transcriptions"
_WHISPER_MODEL = "whisper-1"
_SENTENCE_ENDINGS = set("。！？.!?")
_CLAUSE_BREAKS = set("，,、；;：:")
_GAP_THRESHOLD_SECONDS = 1.5
_MAX_SEGMENT_CHARS = 40


def _finalize_segment(words: list[dict], index: int) -> dict:
    """Create a segment dict from a list of word dicts."""
    text = "".join(w["text"] for w in words)
    start = words[0]["start"]
    end = words[-1]["end"]
    return {"id": index, "start": start, "end": end, "text": text}


def _group_words_into_segments(words: list[dict]) -> list[dict]:
    """Group a flat word list into sentence segments.

    Splits on sentence-ending punctuation or time gaps.
    """
    segments: list[dict] = []
    current_words: list[dict] = []
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
            # Split on clause breaks if segment is getting long
            segments.append(_finalize_segment(current_words, segment_index))
            segment_index += 1
            current_words = []
        elif len(current_text) >= int(_MAX_SEGMENT_CHARS * 1.5):
            # Force split even without punctuation if it's getting very long
            segments.append(_finalize_segment(current_words, segment_index))
            segment_index += 1
            current_words = []

    if current_words:
        segments.append(_finalize_segment(current_words, segment_index))

    return segments


async def transcribe_audio(audio_path: Path, api_key: str) -> list[dict]:
    """Transcribe an audio file using OpenAI Whisper API.

    Uses SRT format to get timestamped segments (compatible with all models).
    Returns a list of segment dicts with keys: id, start, end, text.
    """
    file_size = audio_path.stat().st_size
    logger.info("Transcribing %s (%.1f MB) with model=%s", audio_path.name, file_size / 1024 / 1024, _WHISPER_MODEL)

    async with httpx.AsyncClient(timeout=300.0) as client:
        with audio_path.open("rb") as f:
            response = await client.post(
                _OPENAI_TRANSCRIPTION_URL,
                headers={"Authorization": f"Bearer {api_key}"},
                files={"file": (audio_path.name, f, "audio/mpeg")},
                data={
                    "model": _WHISPER_MODEL,
                    "response_format": "verbose_json",
                    "timestamp_granularities[]": "word",
                    "language": "zh",
                },
            )

        if response.status_code != 200:
            logger.error("OpenAI Whisper API error %d: %s", response.status_code, response.text[:500])
        response.raise_for_status()

    data = response.json()
    logger.info("Transcription response keys: %s", list(data.keys()))

    # whisper-1 with verbose_json + timestamp_granularities[]=word returns both words and segments
    words: list[dict] = data.get("words", [])
    if words:
        logger.info("Transcription complete: %d words, sample: %s", len(words), words[:3])
        # Normalize: whisper-1 uses "word" key, our grouper expects "text"
        for w in words:
            if "word" in w and "text" not in w:
                w["text"] = w["word"]
        return _group_words_into_segments(words)

    # Fallback to segments if words not available
    segments = data.get("segments", [])
    if segments:
        logger.info("No words, using %d segments from response", len(segments))
        return [
            {"id": i, "start": seg["start"], "end": seg["end"], "text": seg["text"].strip()}
            for i, seg in enumerate(segments)
        ]

    # Last resort
    text = data.get("text", "")
    if text:
        logger.warning("No words or segments — returning full text as single segment")
        return [{"id": 0, "start": 0.0, "end": 0.0, "text": text.strip()}]
    return []


_DEEPGRAM_TRANSCRIPTION_URL = "https://api.deepgram.com/v1/listen"
_DEEPGRAM_PARAMS = {
    "diarize": "true",
    "punctuate": "true",
    "smart_format": "true",
    "detect_language": "true",
    "model": "nova-3",
}


def _normalize_deepgram_words(words: list[dict]) -> list[dict]:
    """Convert Deepgram word objects to the internal {text, start, end} format."""
    return [
        {
            "text": w.get("punctuated_word") or w.get("word", ""),
            "start": w["start"],
            "end": w["end"],
        }
        for w in words
    ]


async def transcribe_audio_deepgram(audio_path: Path, api_key: str) -> list[dict]:
    """Transcribe an audio file using the Deepgram nova-3 API.

    Sends the raw audio bytes, requests diarization + punctuation + smart_format.
    Returns a list of segment dicts with keys: id, start, end, text.
    """
    file_size = audio_path.stat().st_size
    logger.info("Transcribing %s (%.1f MB) with Deepgram nova-3", audio_path.name, file_size / 1024 / 1024)

    suffix = audio_path.suffix.lower().lstrip(".")
    content_type = f"audio/{suffix}" if suffix else "audio/mpeg"

    async with httpx.AsyncClient(timeout=300.0) as client:
        with audio_path.open("rb") as f:
            audio_bytes = f.read()

        response = await client.post(
            _DEEPGRAM_TRANSCRIPTION_URL,
            params=_DEEPGRAM_PARAMS,
            headers={
                "Authorization": f"Token {api_key}",
                "Content-Type": content_type,
            },
            content=audio_bytes,
        )

    if response.status_code != 200:
        logger.error("Deepgram API error %d: %s", response.status_code, response.text[:500])
    response.raise_for_status()

    data = response.json()
    raw_words: list[dict] = (
        data.get("results", {})
        .get("channels", [{}])[0]
        .get("alternatives", [{}])[0]
        .get("words", [])
    )

    if not raw_words:
        logger.warning("Deepgram returned no words — empty transcript")
        return []

    logger.info("Deepgram transcription complete: %d words", len(raw_words))
    words = _normalize_deepgram_words(raw_words)
    return _group_words_into_segments(words)
