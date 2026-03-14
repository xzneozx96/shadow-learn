"""Transcription service using ElevenLabs Scribe API."""

from pathlib import Path

import httpx

_ELEVENLABS_SCRIBE_URL = "https://api.elevenlabs.io/v1/speech-to-text"
_SENTENCE_ENDINGS = set("。！？.!?")
_GAP_THRESHOLD_SECONDS = 1.5


def _finalize_segment(words: list[dict], index: int) -> dict:
    """Create a segment dict from a list of word dicts."""
    text = "".join(w["text"] for w in words)
    start = words[0]["start"]
    end = words[-1]["end"]
    return {
        "id": index,
        "start": start,
        "end": end,
        "text": text,
    }


def _group_words_into_segments(words: list[dict]) -> list[dict]:
    """Group a flat word list into sentence segments.

    Splits on:
    - Sentence-ending punctuation (。！？.!?)
    - Gaps between words greater than _GAP_THRESHOLD_SECONDS
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

            if gap > _GAP_THRESHOLD_SECONDS and word["type"] != "spacing":
                # Gap-based split: finalize current segment before this word
                segments.append(_finalize_segment(current_words, segment_index))
                segment_index += 1
                current_words = [word]
            else:
                current_words.append(word)

        # Check if last character appended is sentence-ending punctuation
        if text.rstrip() and text[-1] in _SENTENCE_ENDINGS:
            segments.append(_finalize_segment(current_words, segment_index))
            segment_index += 1
            current_words = []

    # Flush remaining words
    if current_words:
        segments.append(_finalize_segment(current_words, segment_index))

    return segments


async def transcribe_audio(audio_path: Path, api_key: str) -> list[dict]:
    """Transcribe an audio file using ElevenLabs Scribe.

    Returns a list of segment dicts with keys: id, start, end, text.
    """
    async with httpx.AsyncClient(timeout=120.0) as client:
        with audio_path.open("rb") as f:
            response = await client.post(
                _ELEVENLABS_SCRIBE_URL,
                headers={"xi-api-key": api_key},
                files={"file": (audio_path.name, f, "audio/mpeg")},
                data={"model_id": "scribe_v1"},
            )
        response.raise_for_status()

    data = response.json()
    words: list[dict] = data.get("words", [])
    return _group_words_into_segments(words)
