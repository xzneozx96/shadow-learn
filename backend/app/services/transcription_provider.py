"""Shared types, helpers, and Protocol for STT providers."""

from pathlib import Path
from typing import Protocol, TypedDict

_SENTENCE_ENDINGS = set("。！？.!?")
_CLAUSE_BREAKS = set("，,、；;：:")
_GAP_THRESHOLD_SECONDS = 1.5
_MAX_SEGMENT_CHARS = 40


class _Word(TypedDict):
    text: str
    start: float
    end: float


class _WordTiming(TypedDict):
    text: str
    start: float
    end: float


class _Segment(TypedDict):
    id: int
    start: float
    end: float
    text: str
    word_timings: list[_WordTiming]


class TranscriptionKeys(TypedDict, total=False):
    deepgram_api_key: str
    azure_speech_key: str
    azure_speech_region: str


class STTProvider(Protocol):
    async def transcribe(
        self, audio_path: Path, keys: TranscriptionKeys, language: str
    ) -> list[_Segment]:
        """Transcribe audio to segments with word-level timestamps.

        Args:
            audio_path: Path to the audio file (MP3 produced by audio.py).
            keys: Provider-specific credentials (only relevant keys need be present).
            language: BCP-47 language tag, e.g. 'zh-CN'.

        Returns:
            List of segments with id, start, end, text, word_timings.

        Raises:
            ValueError: If a required key is missing.
            RuntimeError: If the provider API returns an error.
        """
        ...


def _finalize_segment(words: list[_Word], index: int, language: str) -> _Segment:
    """Create a segment dict from a list of word dicts."""
    text = " ".join(w["text"] for w in words)
    if language.startswith("zh"):
        text = text.replace(" ", "")
    return {
        "id": index,
        "start": words[0]["start"],
        "end": words[-1]["end"],
        "text": text,
        "word_timings": list(words),
    }


def _group_words_into_segments(words: list[_Word], language: str) -> list[_Segment]:
    """Group a flat word list into sentence segments.

    Splits on sentence-ending punctuation or time gaps.
    Used as fallback when utterance data is absent.
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
                segments.append(_finalize_segment(current_words, segment_index, language))
                segment_index += 1
                current_words = [word]
            else:
                current_words.append(word)

        current_text = " ".join(w["text"] for w in current_words)
        if language.startswith("zh"):
            current_text = current_text.replace(" ", "")

        if text.rstrip() and text[-1] in _SENTENCE_ENDINGS:
            segments.append(_finalize_segment(current_words, segment_index, language))
            segment_index += 1
            current_words = []
        elif text.rstrip() and text[-1] in _CLAUSE_BREAKS and len(current_text) >= _MAX_SEGMENT_CHARS:
            segments.append(_finalize_segment(current_words, segment_index, language))
            segment_index += 1
            current_words = []
        elif len(current_text) >= int(_MAX_SEGMENT_CHARS * 1.5):
            segments.append(_finalize_segment(current_words, segment_index, language))
            segment_index += 1
            current_words = []

    if current_words:
        segments.append(_finalize_segment(current_words, segment_index, language))

    return segments
